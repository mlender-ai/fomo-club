import { readFeedContent, readFeedContentHistoryByPrefix, writeFeedContent } from "./feed-content-store";
import { kstDate } from "./fomo";

/**
 * WO-SUB-00 §4-2 — 행동 지표 계측 적재.
 *
 * 왜 필요한가: 라이브 픽 화면(QuietPickDeck)의 행동 신호는 서버로 **한 건도** 나가지 않았다.
 * `recordTaste` 는 WO-M1 에서 no-op 스텁이 됐고, `discoveryMetrics` 는 sessionStorage 에만 쌓인다.
 * 기준선 없이 이후 페이즈의 A/B 를 돌릴 수 없어(§4-2) 이 WO 안에서 계측을 먼저 심는다.
 *
 * 저장: FeedContentCache(JSONB KV) 재사용 — 신규 DDL 없음.
 * 키는 `ux-metrics:{date}:{sessionId}` 로 **세션당 한 행**이다. 한 행에 몰아 쓰면
 * 동시 갱신에서 read-modify-write 경합으로 카운트가 유실된다.
 *
 * 개인정보: 종목·세션 해시·카운터만. 원문 텍스트나 식별자는 쓰지 않는다.
 */

export const UX_EVENTS = [
  "card_view",
  "card_dwell",
  "card_detail_open",
  "detail_scroll_depth",
  "card_watchlist_add",
  "deck_complete",
  "card_skip",
] as const;
export type UxEvent = (typeof UX_EVENTS)[number];

export interface UxEventInput {
  event: UxEvent;
  /** 덱 내 위치(1-base). card_view/card_skip 에서 이탈 지점 분석에 쓴다. */
  position?: number;
  /** card_dwell 의 체류 시간. */
  durationMs?: number;
  /** detail_scroll_depth 의 최대 스크롤 비율(0~1). */
  maxRatio?: number;
  /** deck_complete 의 소비 카드 수. */
  cardsConsumed?: number;
  /** card_detail_open 진입점. */
  entryPoint?: "tap" | "button";
}

export interface UxSessionRow {
  sessionId: string;
  date: string;
  updatedAt: string;
  counts: Partial<Record<UxEvent, number>>;
  /** 체류시간 표본(중앙값·p90 산출용). 상한을 둬 행이 무한정 커지지 않게 한다. */
  dwellMs: number[];
  scrollRatios: number[];
  cardsConsumed: number[];
  /** 위치별 노출/이탈 — 카드 위치별 이탈률용. */
  viewByPosition: Record<string, number>;
  skipByPosition: Record<string, number>;
}

const MAX_SAMPLES = 200;
const MAX_POSITION = 50;

/** 세션 식별자 정규화 — 길이 제한 + 안전 문자만. */
export function normalizeSessionId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 64);
  return /^[A-Za-z0-9_-]{6,64}$/.test(trimmed) ? trimmed : null;
}

function emptyRow(sessionId: string, date: string): UxSessionRow {
  return {
    sessionId,
    date,
    updatedAt: new Date().toISOString(),
    counts: {},
    dwellMs: [],
    scrollRatios: [],
    cardsConsumed: [],
    viewByPosition: {},
    skipByPosition: {},
  };
}

function clampPosition(position: number | undefined): string | null {
  if (typeof position !== "number" || !Number.isFinite(position)) return null;
  const p = Math.round(position);
  if (p < 1 || p > MAX_POSITION) return null;
  return String(p);
}

/** 이벤트 배열을 세션 행에 접어 넣는다(순수 함수 — 테스트 대상). */
export function applyUxEvents(row: UxSessionRow, events: readonly UxEventInput[]): UxSessionRow {
  const next: UxSessionRow = {
    ...row,
    counts: { ...row.counts },
    dwellMs: [...row.dwellMs],
    scrollRatios: [...row.scrollRatios],
    cardsConsumed: [...row.cardsConsumed],
    viewByPosition: { ...row.viewByPosition },
    skipByPosition: { ...row.skipByPosition },
    updatedAt: new Date().toISOString(),
  };
  for (const e of events) {
    if (!UX_EVENTS.includes(e.event)) continue;
    next.counts[e.event] = (next.counts[e.event] ?? 0) + 1;

    if (e.event === "card_dwell" && typeof e.durationMs === "number" && Number.isFinite(e.durationMs)) {
      // 상한 10분 — 탭을 열어두고 떠난 세션이 중앙값을 오염시키지 않게.
      const ms = Math.min(Math.max(0, Math.round(e.durationMs)), 600_000);
      if (next.dwellMs.length < MAX_SAMPLES) next.dwellMs.push(ms);
    }
    if (e.event === "detail_scroll_depth" && typeof e.maxRatio === "number" && Number.isFinite(e.maxRatio)) {
      const r = Math.min(Math.max(0, e.maxRatio), 1);
      if (next.scrollRatios.length < MAX_SAMPLES) next.scrollRatios.push(Number(r.toFixed(3)));
    }
    if (e.event === "deck_complete" && typeof e.cardsConsumed === "number" && Number.isFinite(e.cardsConsumed)) {
      if (next.cardsConsumed.length < MAX_SAMPLES) next.cardsConsumed.push(Math.max(0, Math.round(e.cardsConsumed)));
    }
    const pos = clampPosition(e.position);
    if (pos && e.event === "card_view") next.viewByPosition[pos] = (next.viewByPosition[pos] ?? 0) + 1;
    if (pos && e.event === "card_skip") next.skipByPosition[pos] = (next.skipByPosition[pos] ?? 0) + 1;
  }
  return next;
}

export async function appendUxEvents(sessionId: string, events: readonly UxEventInput[], date = kstDate()): Promise<number> {
  if (events.length === 0) return 0;
  const id = `ux-metrics:${date}:${sessionId}`;
  const existing = (await readOne(id)) ?? emptyRow(sessionId, date);
  await writeFeedContent(id, applyUxEvents(existing, events));
  return events.length;
}

async function readOne(id: string): Promise<UxSessionRow | null> {
  return readFeedContent<UxSessionRow>(id);
}

// ── 집계 ────────────────────────────────────────────────────────────────────

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export interface UxBaseline {
  date: string;
  sessions: number;
  counts: Record<string, number>;
  dwellMsP50: number | null;
  dwellMsP90: number | null;
  scrollDepthP50: number | null;
  scrollDepthP90: number | null;
  /** 더보기 클릭률 = card_detail_open / card_view */
  detailOpenRate: number | null;
  /** 관심 등록률 = card_watchlist_add / card_view */
  watchlistRate: number | null;
  /** 덱 완주율 = deck_complete / 덱 시작(=위치 1 노출) */
  deckCompleteRate: number | null;
  /** 위치별 이탈률 = skip@n / view@n */
  skipRateByPosition: Record<string, number>;
}

export function aggregateRows(rows: readonly UxSessionRow[], date: string): UxBaseline {
  const counts: Record<string, number> = {};
  const dwell: number[] = [];
  const scroll: number[] = [];
  const viewPos: Record<string, number> = {};
  const skipPos: Record<string, number> = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row.counts)) counts[k] = (counts[k] ?? 0) + (v ?? 0);
    dwell.push(...row.dwellMs);
    scroll.push(...row.scrollRatios);
    for (const [k, v] of Object.entries(row.viewByPosition)) viewPos[k] = (viewPos[k] ?? 0) + v;
    for (const [k, v] of Object.entries(row.skipByPosition)) skipPos[k] = (skipPos[k] ?? 0) + v;
  }
  const views = counts.card_view ?? 0;
  const rate = (num: number | undefined, den: number): number | null =>
    den > 0 ? Number((((num ?? 0) / den) * 100).toFixed(2)) : null;

  const skipRateByPosition: Record<string, number> = {};
  for (const [pos, v] of Object.entries(viewPos)) {
    if (v > 0) skipRateByPosition[pos] = Number((((skipPos[pos] ?? 0) / v) * 100).toFixed(2));
  }

  return {
    date,
    sessions: rows.length,
    counts,
    dwellMsP50: percentile(dwell, 50),
    dwellMsP90: percentile(dwell, 90),
    scrollDepthP50: percentile(scroll, 50),
    scrollDepthP90: percentile(scroll, 90),
    detailOpenRate: rate(counts.card_detail_open, views),
    watchlistRate: rate(counts.card_watchlist_add, views),
    deckCompleteRate: rate(counts.deck_complete, viewPos["1"] ?? 0),
    skipRateByPosition,
  };
}

export async function readUxBaseline(date: string): Promise<UxBaseline> {
  // prefix 리더는 50행 상한이라 집계에 못 쓴다 — history 변형(5,000행)을 쓴다.
  const rows = await readFeedContentHistoryByPrefix<UxSessionRow>(`ux-metrics:${date}:`, 5_000);
  return aggregateRows(rows.map((r) => r.row), date);
}

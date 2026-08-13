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

/**
 * 슬롯 구성 라벨 (WO-SUB-04 A/B 준비).
 *
 * ## 왜 이게 필요한가
 *
 * A/B 검정력 산출 결과 현재 트래픽으로는 무작위 배정 실험이 불가능하다(`POWER_wo_sub_04_ab.md`:
 * 일 노출 최대 23건 · 14일에 탐지 가능한 최소 효과가 상대 +323%). 그래서 지시대로 **사후 비교**
 * 로 내려왔는데, 종전 이벤트에는 `position` 만 있고 **그 카드에 ③ 이 있었는지가 없었다.**
 * 이벤트를 아무리 모아도 두 군으로 쪼갤 수 없다.
 *
 * 라벨을 심어두면 트래픽이 생겼을 때 사후 비교가 **가능해진다.** 지금 결론을 내는 것이 아니다 —
 * 무작위 배정이 아니므로 인과는 약하고, 그 한계는 집계 응답과 문서에 명시한다.
 */
export interface UxSlotLabel {
  /** ③ 값의 상태 차트가 그려졌는가 — 사후 비교의 처치 축. */
  hasChart?: boolean;
  /** ② 사업 실체 문장이 있었는가. */
  hasSubstance?: boolean;
  /** "이게 틀리는 경우" 블록이 있었는가(WO-SUB-06). */
  hasRisk?: boolean;
}

/** 라벨 조합 키 — 집계에서 군을 나누는 축. `chart:1|substance:0|risk:1` 형태. */
export function slotGroupKey(label: UxSlotLabel | undefined): string {
  const bit = (value: boolean | undefined) => (value === true ? "1" : value === false ? "0" : "?");
  return `chart:${bit(label?.hasChart)}|substance:${bit(label?.hasSubstance)}|risk:${bit(label?.hasRisk)}`;
}

export interface UxEventInput extends UxSlotLabel {
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
  /**
   * 슬롯 구성별 카운트 — `{ "chart:1|substance:1|risk:1": { card_view: 3, card_detail_open: 1 } }`.
   *
   * 사후 비교(③ 있는 카드 vs 없는 카드)의 유일한 입력이다. 라벨이 안 붙은 이벤트는 `?` 로
   * 들어가 **군에서 빠지지 않고 분모에 남는다** — 조용히 제외하면 비율이 왜곡된다.
   *
   * **optional 인 이유**: 이 필드를 심기 전에 저장된 행에는 없다. 필수로 두면 배포 직후
   * 기존 행을 읽을 때 타입과 실제가 어긋난다 — 읽는 쪽이 `?? {}` 로 받는다.
   */
  bySlotGroup?: Record<string, Partial<Record<UxEvent, number>>>;
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
    bySlotGroup: {},
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
    // 구버전 행에는 이 필드가 없다 — `??` 로 받아야 배포 직후 행이 깨지지 않는다.
    bySlotGroup: Object.fromEntries(Object.entries(row.bySlotGroup ?? {}).map(([key, value]) => [key, { ...value }])),
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

    /**
     * 슬롯 구성별 카운트. 라벨이 없으면 `?` 키로 들어간다 — **군에서 빼지 않는다.**
     * 빼면 라벨 미부착 이벤트가 조용히 사라져 분모가 줄고 비율이 왜곡된다.
     */
    const group = slotGroupKey(e);
    const groups = (next.bySlotGroup ??= {});
    const bucket = groups[group] ?? {};
    bucket[e.event] = (bucket[e.event] ?? 0) + 1;
    groups[group] = bucket;
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
  /**
   * 사후 비교 (WO-SUB-04 A/B 대체).
   *
   * ③ 있는 카드 vs 없는 카드의 더보기 클릭률. **무작위 배정이 아니므로 인과가 아니다** —
   * ③ 이 그려지는 조건(팩트시트·밴드 확보)이 종목 특성과 상관돼 있어 선택 편향이 있다.
   * 그 한계를 응답에 문자열로 싣는다(화면이 숨기지 못하게).
   */
  slotComparison: {
    withChart: SlotArm;
    withoutChart: SlotArm;
    /** 라벨이 안 붙은 이벤트 — 분모에서 빼지 않고 여기 남긴다. */
    unlabeled: SlotArm;
    /** 표본이 임계치 미만이면 비율을 내지 않는 이유. 충분하면 null. */
    insufficient: string | null;
    caveat: string;
  };
}

export interface SlotArm {
  views: number;
  detailOpens: number;
  /** 표본이 임계치 미만이면 `null` — 0% 로 쓰지 않는다. */
  detailOpenRate: number | null;
}

/**
 * 사후 비교에 비율을 낼 최소 노출 수.
 *
 * 근거: 기저 클릭률 4.35% 에서 노출 30건이면 기대 성공이 1.3건이다. 그 아래에서는 성공 1건이
 * 붙고 떨어지는 것만으로 비율이 0%↔3.3% 로 튀어 아무것도 말하지 않는다. 검정력 산출
 * (`POWER_wo_sub_04_ab.md`)이 보여준 대로 유의성은 수천 건 단위라 이 값은 "유의하다" 는 뜻이
 * 아니고 **표시할 가치가 있는 최소선**이다.
 */
export const SLOT_COMPARISON_MIN_VIEWS = 30;

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

  // ── 사후 비교: 슬롯 구성 라벨로 군을 나눈다 ──────────────────────────────
  const arms = { with: { views: 0, opens: 0 }, without: { views: 0, opens: 0 }, unknown: { views: 0, opens: 0 } };
  for (const row of rows) {
    for (const [group, counts_] of Object.entries(row.bySlotGroup ?? {})) {
      const chart = /chart:1/.test(group) ? "with" : /chart:0/.test(group) ? "without" : "unknown";
      arms[chart].views += counts_.card_view ?? 0;
      arms[chart].opens += counts_.card_detail_open ?? 0;
    }
  }
  const arm = (a: { views: number; opens: number }): SlotArm => ({
    views: a.views,
    detailOpens: a.opens,
    // 임계치 미만이면 비율을 만들지 않는다 — 성공 1건에 비율이 튀는 구간이다.
    detailOpenRate: a.views >= SLOT_COMPARISON_MIN_VIEWS ? Number(((a.opens / a.views) * 100).toFixed(2)) : null,
  });
  const bothEnough = arms.with.views >= SLOT_COMPARISON_MIN_VIEWS && arms.without.views >= SLOT_COMPARISON_MIN_VIEWS;
  const slotComparison: UxBaseline["slotComparison"] = {
    withChart: arm(arms.with),
    withoutChart: arm(arms.without),
    unlabeled: arm(arms.unknown),
    insufficient: bothEnough
      ? null
      : `표본 부족 — 두 군 모두 노출 ${SLOT_COMPARISON_MIN_VIEWS}건 이상이어야 비율을 낸다(있음 ${arms.with.views} · 없음 ${arms.without.views})`,
    caveat:
      "무작위 배정이 아니다. ③ 이 그려지는 조건(팩트시트·밴드 확보)이 종목 특성과 상관돼 있어 선택 편향이 있고, 인과로 읽으면 안 된다.",
  };

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
    slotComparison,
  };
}

export async function readUxBaseline(date: string): Promise<UxBaseline> {
  // prefix 리더는 50행 상한이라 집계에 못 쓴다 — history 변형(5,000행)을 쓴다.
  const rows = await readFeedContentHistoryByPrefix<UxSessionRow>(`ux-metrics:${date}:`, 5_000);
  return aggregateRows(rows.map((r) => r.row), date);
}

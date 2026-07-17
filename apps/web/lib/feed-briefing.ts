import { callAI, isAiConfigured } from "@fomo/shared";
import { sectorOf } from "@fomo/core";
import { fetchMacro } from "./fomo-market-sources";
import { readUsMarketQuoteRows } from "./us-market-cache";
import { fetchKrMarketRows } from "./discovery-supply";
import { fetchNaverStockNews } from "./fomo-news-sources";
import { fetchRecentSecFilings } from "./sec-edgar";
import { computeStockAttentionSignals } from "./stock-signal-coverage";
import { hasForbiddenCopy } from "./copy-guards";
import { deleteFeedContent, readFeedContent, readFeedContentByPrefix, writeFeedContent } from "./feed-content-store";
import { fetchStockDaily } from "./stock-front";
import { relatedTo } from "./relation-graph";
import { kstDate } from "./fomo";
import type { DiscoveryMarketRow } from "./market-source-types";
import type { DeckContentCard, DeckContentFact } from "./deck-content";

/**
 * 피드 콘텐츠 강화 (WO) — 숫자에 이야기를 붙인다.
 * ① 데일리 브리핑(간밤 미장/오늘 국장): 무버+왜 1줄+지수+Editor's Note.
 * ② 버즈 스토리: 언급 급증 사건 요약 + 연결 종목.
 * ③ 주간 회고: "일주일 전에 샀으면" UP3/DOWN3.
 *
 * 전부 크론에서 빌드→FeedContentCache 저장. 요청 경로는 read* 만(외부 fetch/LLM 0 — 504 원칙).
 * 수치·사건·연결종목은 실데이터만. Editor's Note 는 크론 LLM 1콜(수치 언급 금지 프롬프트+가드) 또는 규칙 폴백.
 */

const MOVER_COUNT = 4;
/** 코스피 급변동 임계(%) — 넘으면 브리핑 최상단 고정 + 원인 확장(WO). */
const BIG_MOVE_PCT = 3;
/** 버즈: 언급 스냅샷 대비 급증 배수(스냅샷 3일치 이상일 때). */
const BUZZ_SPIKE_RATIO = 2.5;
/** 버즈: 스냅샷 부족 시 절대 언급 하한. */
const BUZZ_MIN_MENTIONS = 6;
const LLM_TIMEOUT_MS = 20_000;

/** 캐시 행 — 카드 + 정렬 힌트. */
export interface FeedBriefingRow {
  card: DeckContentCard;
  /** 급변동일 최상단 고정. */
  pinned?: boolean;
  /** MARKET NOTE 해석 1줄(지수 카드에 주입) — 실데이터 섹터 펄스. */
  sectorPulse?: string;
}

function signedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** LLM 출력 안전판 — 금지 카피/숫자(지어낸 수치 방지) 있으면 버린다. */
function safeNote(text: string | undefined): string | undefined {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 8 || clean.length > 180) return undefined;
  if (/\d/.test(clean)) return undefined; // 수치는 실데이터(facts)에만 — 노트가 숫자를 만들면 폐기
  if (hasForbiddenCopy(clean)) return undefined;
  return clean;
}

function safeWhy(text: string | undefined): string | undefined {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 4 || clean.length > 60) return undefined;
  if (hasForbiddenCopy(clean)) return undefined;
  if (/[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(clean)) return undefined; // 영어 문장 그대로면 폐기
  return clean;
}

function parseJsonBlock<T>(content: string): T | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

interface MoverInput {
  name: string;
  symbol?: string;
  changePct: number;
  /** 수집된 재료 헤드라인(원문) — LLM이 한국어 1줄로 눌러쓴다. */
  materialTitle?: string;
}

/** 무버 유니버스 상한 — 시총 상위만(상한가 소형주가 브리핑을 점령하지 않게, GMC도 대형주 무버). */
const MOVER_UNIVERSE = 400;

/** 무버 선택 — |등락| 상위, 상승·하락 최소 1개씩 섞는다(시장의 양면). */
function pickMovers(rows: readonly DiscoveryMarketRow[], count = MOVER_COUNT): DiscoveryMarketRow[] {
  const priced = rows
    .slice(0, MOVER_UNIVERSE)
    .filter((row) => typeof row.changePct === "number" && Number.isFinite(row.changePct));
  const byAbs = [...priced].sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!));
  const top = byAbs.slice(0, count);
  const hasUp = top.some((row) => row.changePct! > 0);
  const hasDown = top.some((row) => row.changePct! < 0);
  if (!hasDown) {
    const worst = [...priced].sort((a, b) => a.changePct! - b.changePct!)[0];
    if (worst && worst.changePct! < 0) top.splice(count - 1, 1, worst);
  } else if (!hasUp) {
    const best = [...priced].sort((a, b) => b.changePct! - a.changePct!)[0];
    if (best && best.changePct! > 0) top.splice(count - 1, 1, best);
  }
  return top;
}

/**
 * LLM 1콜 — 무버 "왜" 1줄(수집 재료 압축)과 Editor's Note 를 함께 받는다(크론 전용).
 * 실패/미설정 시 null — 호출부가 규칙 폴백.
 */
async function synthesizeBriefingCopy(
  market: "미국" | "한국",
  movers: readonly MoverInput[],
  indices: ReadonlyArray<{ label: string; changePct: number }>,
  sectorPulse?: string,
  marketNews?: readonly string[]
): Promise<{ whyBySymbol: Map<string, string>; note?: string } | null> {
  if (!isAiConfigured()) return null;
  const data = {
    market,
    movers: movers.map((m) => ({
      name: m.name,
      changePct: Number(m.changePct.toFixed(2)),
      material: m.materialTitle ?? null,
    })),
    indices: indices.map((i) => ({ label: i.label, changePct: Number(i.changePct.toFixed(2)) })),
    ...(sectorPulse ? { sectorPulse } : {}),
    ...(marketNews && marketNews.length > 0 ? { marketNews: marketNews.slice(0, 4) } : {}),
  };
  const res = await callAI({
    messages: [
      {
        role: "system",
        content:
          "너는 시장 브리핑 에디터다. 입력 JSON의 실데이터만 근거로 답한다. " +
          "각 무버의 material(기사 제목)을 한국어 한 줄(24자 이내, 사실 서술)로 눌러써라. " +
          "material이 null이거나 해당 종목의 changePct 방향을 설명하지 못하면 빈 문자열(억지로 만들지 마라). " +
          "note는 오늘 시장 전체의 해석 1~2문장(한국어) — 숫자·퍼센트 언급 금지(수치는 카드가 보여준다), 입력에 없는 종목·사실 언급 금지, 매수·매도 권유 금지. " +
          "marketNews(여러 매체가 함께 다룬 오늘 시장 헤드라인)가 있고 그 사건이 지수 방향을 설명하면, note 첫 문장에 그 사건을 사실로 짚어라 — 헤드라인에 없는 인과·전망 창작 금지. 설명하지 못하면 무시하라. " +
          'JSON만 출력: {"movers":[{"name":"...","why":"..."}],"note":"..."}',
      },
      { role: "user", content: JSON.stringify(data) },
    ],
    temperature: 0.4,
    timeoutMs: LLM_TIMEOUT_MS,
    trace: "feed-briefing",
  });
  if (!res.ok || !res.content) return null;
  const parsed = parseJsonBlock<{ movers?: Array<{ name?: string; why?: string }>; note?: string }>(res.content);
  if (!parsed) return null;
  const whyBySymbol = new Map<string, string>();
  for (const item of parsed.movers ?? []) {
    const why = safeWhy(item.why);
    if (item.name && why) whyBySymbol.set(item.name, why);
  }
  const note = safeNote(parsed.note);
  return { whyBySymbol, ...(note ? { note } : {}) };
}

/** 규칙 폴백 노트 — 실데이터 breadth 만으로 정직하게. */
function ruleNote(rows: readonly DiscoveryMarketRow[], market: "미국" | "한국"): string {
  const priced = rows.filter((row) => typeof row.changePct === "number");
  const up = priced.filter((row) => row.changePct! > 0).length;
  const down = priced.filter((row) => row.changePct! < 0).length;
  if (up === 0 && down === 0) return `${market} 시장의 큰 방향은 없었어요.`;
  if (up > down * 1.5) return `${market} 시장은 오른 종목이 뚜렷하게 많았던 하루예요.`;
  if (down > up * 1.5) return `${market} 시장은 내린 종목이 많았던 하루예요.`;
  return `${market} 시장은 오르고 내린 종목이 팽팽했어요.`;
}

/** 섹터 펄스 — 지수 기여 최대 섹터 1줄(실데이터). 종목수×|평균|로 랭크(소수 섹터의 착시 방지). */
function computeSectorPulse(rows: readonly DiscoveryMarketRow[]): string | undefined {
  const bySector = new Map<string, number[]>();
  for (const row of rows.slice(0, MOVER_UNIVERSE)) {
    if (typeof row.changePct !== "number") continue;
    const sector = row.sectorHint ?? sectorOf(row.canonical);
    if (!sector || sector === "기타 업종") continue;
    const arr = bySector.get(sector) ?? [];
    arr.push(row.changePct);
    bySector.set(sector, arr);
  }
  let best: { sector: string; avg: number; count: number; weight: number } | undefined;
  for (const [sector, changes] of bySector) {
    if (changes.length < 5) continue; // 소수 섹터가 지수 원인 행세하지 않게
    const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
    const weight = changes.length * Math.abs(avg);
    if (!best || weight > best.weight) best = { sector, avg, count: changes.length, weight };
  }
  if (!best || Math.abs(best.avg) < 1) return undefined;
  return `${best.sector} ${best.count}종목이 평균 ${signedPct(best.avg)} — 오늘 지수를 ${best.avg > 0 ? "끌어올린" : "누른"} 쪽이에요.`;
}

/** 종목과 무관한 기사가 "왜"로 붙는 오염 방지 — 제목에 종목명(또는 앞 토큰)이 있어야 재료로 인정. */
function relevantTitle(articles: ReadonlyArray<{ title: string }>, name: string): string | undefined {
  const normalized = name.replace(/\s+/g, "");
  const token = normalized.slice(0, 4);
  const shortName = normalized.length <= 3; // "SK"가 "SK하이닉스" 기사에 붙는 오염 방지 — 짧은 이름은 경계 필수
  const hit = articles.find((a) => {
    const title = a.title.replace(/\s+/g, "");
    const idx = title.indexOf(token);
    if (idx < 0) return false;
    if (!shortName) return true;
    const next = title[idx + token.length];
    return !next || !/[가-힣A-Za-z0-9]/.test(next);
  });
  return hit?.title?.trim() || undefined;
}

/**
 * SEC EDGAR 전용(2026-07-15 User Zero: "IBM 실적 배경이 전혀 안 보인다").
 * Yahoo 심볼별 RSS는 프로덕션 egress 차단으로 사실상 항상 빈 배열이라 "왜"가 나올 수 없었다.
 * SEC는 Yahoo와 무관하고, 8-K Item 코드로 실적/구조조정 등 실제 사유를 구분한다(전부 한국어 — 영문 폴백 없음).
 */
async function moverMaterialTitleUs(symbol: string): Promise<string | undefined> {
  const filings = await fetchRecentSecFilings(symbol, 3).catch(() => []);
  const hit = filings.find((f) => f.insiderPurchase) ?? filings[0];
  return hit?.label;
}

async function moverMaterialTitleKr(naverCode: string | undefined, name: string): Promise<string | undefined> {
  if (!naverCode) return undefined;
  const articles = await fetchNaverStockNews(naverCode, 5).catch(() => []);
  return relevantTitle(articles, name);
}

/** 등락 방향과 모순되는 "왜"(예: -14% 종목에 "주가 상승") 폐기 — LLM 압축 오류 방어. */
function directionConflict(why: string, changePct: number): boolean {
  if (changePct < 0 && /상승|급등|강세|올랐/.test(why)) return true;
  if (changePct > 0 && /하락|급락|약세|내렸/.test(why)) return true;
  return false;
}

function moverFacts(
  movers: readonly MoverInput[],
  whyByName: ReadonlyMap<string, string>,
  { koreanMaterialFallback = false } = {}
): DeckContentFact[] {
  return movers.map((m) => {
    // LLM 압축이 1순위, 없으면(미설정·실패) 한국어 재료 제목을 그대로 — 영어 제목은 폴백 금지.
    const fallback = koreanMaterialFallback ? safeWhy(m.materialTitle) : undefined;
    const candidate = whyByName.get(m.name) ?? fallback;
    const why = candidate && !directionConflict(candidate, m.changePct) ? candidate : undefined;
    return {
      label: m.name,
      value: signedPct(m.changePct),
      ...(why ? { detail: why } : {}),
    };
  });
}

function indexFacts(indices: ReadonlyArray<{ label: string; changePct: number }>): DeckContentFact[] {
  return indices.map((i) => ({ label: `${i.label} 지수`, value: signedPct(i.changePct) }));
}

/**
 * 스테일 세션 가드 — 소스가 준 거래일이 오늘(KST)과 다르면 true.
 * 전 거래일 데이터가 "오늘의 국장"으로 발행된 2026-07-13 사건의 최후 방어선.
 * 거래일 미제공(undefined)은 통과 — 가드는 확인 가능한 불일치만 막는다(fail-closed는 호출부).
 * 휴장일(월요일 새벽 등)엔 거래일=전 거래일이라 자연히 발행이 스킵된다(정직한 무카드).
 */
export function isStaleSession(tradedAt: string | undefined, today: string): boolean {
  return typeof tradedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tradedAt) && tradedAt !== today;
}

/**
 * KR 지수 발행 차단 사유(없으면 null) — 거래일 불일치 + 장 시작 전(PREOPEN).
 * PREOPEN 사각지대(2026-07-14 실측): 네이버가 localTradedAt=현재시각(오늘)·등락률 0.00 껍데기를 줘서
 * 거래일 가드만으로는 통과된다 → marketStatus 로 차단. 미제공 status 는 통과(확인 가능한 것만 막는다).
 */
export function krPublishBlockReason(
  quotes: ReadonlyArray<{ label: string; tradedAt?: string; marketStatus?: string }>,
  today: string
): string | null {
  for (const q of quotes) {
    if (isStaleSession(q.tradedAt, today)) return `${q.label} 거래일(${q.tradedAt}) ≠ 오늘(${today}) — 스테일 데이터`;
    if (q.marketStatus === "PREOPEN") return `${q.label} 장 시작 전(PREOPEN) — 등락률 0.00 껍데기 데이터`;
  }
  return null;
}

function briefingDateLabel(date: string): string {
  const [, m, d] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
  return m && d ? `${Number(m)}월 ${Number(d)}일` : date;
}

/** ① 간밤의 미장 브리핑 — 아침 크론. US 프리웜 캐시 + Yahoo RSS 재료(크론 시점) + LLM 1콜. */
export async function buildUsBriefing(): Promise<FeedBriefingRow | null> {
  const rows = await readUsMarketQuoteRows();
  if (rows.length === 0) return null;
  const moverRows = pickMovers(rows);
  const movers: MoverInput[] = [];
  for (const row of moverRows) {
    const materialTitle = await moverMaterialTitleUs(row.symbol);
    movers.push({
      name: row.canonical,
      symbol: row.symbol,
      changePct: row.changePct!,
      ...(materialTitle ? { materialTitle } : {}),
    });
  }
  // fresh: 캐시 우회 — 브리핑은 크론 시점 실측만(2026-07-13 전 거래일 데이터 사건과 동일 계열 방지).
  const macro = await fetchMacro({ fresh: true }).catch(() => []);
  const indices = macro
    .filter((q) => ["spx", "ndq", "sox"].includes(q.key) && typeof q.change === "number")
    .map((q) => ({ label: q.label, changePct: q.change as number }));
  const ai = await synthesizeBriefingCopy("미국", movers, indices).catch(() => null);
  const note = ai?.note ?? ruleNote(rows, "미국");
  const date = kstDate();
  return {
    card: {
      kind: "content",
      id: `content:briefing:us:${date}`,
      contentType: "briefing",
      scope: "world",
      headline: `간밤의 미장 요약 — ${briefingDateLabel(date)}`,
      // koreanMaterialFallback: true — materialTitle 은 이제 SEC 라벨(한국어)뿐이라 LLM 실패해도 안전.
      facts: [...moverFacts(movers, ai?.whyBySymbol ?? new Map(), { koreanMaterialFallback: true }), ...indexFacts(indices)],
      note,
      source: "미장 시세·수집 뉴스",
      asOf: date,
    },
  };
}

/**
 * 오늘 시장 전반 사건 헤드라인 — 국장 핫이슈 클러스터(다매체·결정론)의 헤드라인+관련 제목.
 * 브리핑 노트 LLM의 '왜' 재료. 실패/없음 → [] (노트는 기존 경로로 정직 폴백).
 */
async function todayMarketEventHeadlines(): Promise<string[]> {
  const { buildHotIssueCards } = await import("./feed-extras");
  const cards = await buildHotIssueCards().catch(() => []);
  const ko = cards.find((card) => card.scope === "domestic");
  if (!ko) return [];
  return [ko.headline, ...ko.facts.map((f) => String(f.value))].filter(Boolean).slice(0, 4);
}

/** ① 오늘의 국장 브리핑 — 장마감 크론. 네이버 시세 + 종목뉴스 재료 + LLM 1콜. 급변동일 고정. */
export async function buildKrBriefing(): Promise<FeedBriefingRow | null> {
  const date = kstDate();
  // fresh: 캐시 우회 — 브리핑은 반드시 크론 시점의 실측이어야 한다(2026-07-13 전 거래일 데이터 사건).
  const macro = await fetchMacro({ fresh: true }).catch(() => []);
  const krQuotes = macro.filter((q) => ["kospi", "kosdaq"].includes(q.key));
  // 발행 가드(fail-closed) — 스테일 거래일·장 시작 전(PREOPEN)이면 발행하지 않는다. 틀린 카드보다 무카드.
  const blockReason = krPublishBlockReason(krQuotes, date);
  if (blockReason) {
    console.error(`[feed-briefing] KR 브리핑 발행 차단 — ${blockReason}`);
    // self-heal: 같은 날 앞서 잘못 발행된 행(장전 껍데기 등)이 남아 있으면 걷어낸다.
    // 가드 차단이 확실할 때만 삭제 — 일시 장애(rows 부족)에는 손대지 않는다.
    await deleteFeedContent(`briefing:kr:${date}`).catch(() => {});
    return null;
  }
  const rows = await fetchKrMarketRows().catch((): DiscoveryMarketRow[] => []);
  if (rows.length === 0) return null;
  const moverRows = pickMovers(rows);
  const movers: MoverInput[] = [];
  for (const row of moverRows) {
    const materialTitle = await moverMaterialTitleKr(row.naverCode, row.canonical);
    movers.push({
      name: row.canonical,
      changePct: row.changePct!,
      ...(materialTitle ? { materialTitle } : {}),
    });
  }
  const indices = krQuotes
    .filter((q) => typeof q.change === "number")
    .map((q) => ({ label: q.label, changePct: q.change as number }));
  const kospiChange = indices.find((i) => i.label.includes("코스피") || i.label.toUpperCase().includes("KOSPI"))?.changePct;
  const bigMove = typeof kospiChange === "number" && Math.abs(kospiChange) >= BIG_MOVE_PCT;
  const sectorPulse = computeSectorPulse(rows);
  // 시장 전반 사건 헤드라인(다매체 클러스터) — 폭락/급등의 '왜'가 노트에 실리도록 LLM 입력에 연결(WO-21 Phase 1).
  const marketNews = await todayMarketEventHeadlines().catch(() => []);
  const ai = await synthesizeBriefingCopy("한국", movers, indices, sectorPulse, marketNews).catch(() => null);
  const baseNote = ai?.note ?? ruleNote(rows, "한국");
  // 급변동일 — 원인(섹터 펄스) 확장. 전부 실데이터.
  const note = bigMove && sectorPulse ? `크게 출렁인 날이에요. ${sectorPulse} ${baseNote}` : baseNote;
  return {
    card: {
      kind: "content",
      id: `content:briefing:kr:${date}`,
      contentType: "briefing",
      scope: "domestic",
      headline: `오늘의 국장 요약 — ${briefingDateLabel(date)}`,
      facts: [...moverFacts(movers, ai?.whyBySymbol ?? new Map(), { koreanMaterialFallback: true }), ...indexFacts(indices)],
      note,
      source: "네이버 시세·종목뉴스",
      asOf: date,
    },
    ...(bigMove ? { pinned: true } : {}),
    ...(sectorPulse ? { sectorPulse } : {}),
  };
}

// ── 장중 급변 펄스 (WO-21 Phase 1) ───────────────────────────────────────────
// 폭락/급등이 "그날 마감 후"가 아니라 장중에 피드에 뜨게 한다. LLM 없음(결정론) — 장중 크론 전용.

/** 장중 급변 임계(%) — 코스피/코스닥. 서킷브레이커(-8%)보다 훨씬 이른 감지선. */
const PULSE_KOSPI_PCT = 2;
const PULSE_KOSDAQ_PCT = 2.5;

export interface KrMarketPulseInput {
  date: string;
  /** KST 관측 시각 "10:30" — 카드가 스스로 시점을 밝힌다(정직한 시점). */
  timeLabel: string;
  indices: ReadonlyArray<{ key: "kospi" | "kosdaq"; label: string; changePct: number }>;
  movers: ReadonlyArray<{ name: string; changePct: number }>;
  /** 다매체가 함께 다루는 오늘 사건 헤드라인(실데이터) — 있으면 노트에 사실로 병기. */
  eventHeadline?: string;
}

/** 급변 펄스 카드 합성(순수) — 임계 미달이면 null(억지 생성 금지). 판단·전망·위로 없음. */
export function composeKrMarketPulse(input: KrMarketPulseInput): FeedBriefingRow | null {
  const kospi = input.indices.find((i) => i.key === "kospi");
  const kosdaq = input.indices.find((i) => i.key === "kosdaq");
  const trigger =
    kospi && Math.abs(kospi.changePct) >= PULSE_KOSPI_PCT
      ? kospi
      : kosdaq && Math.abs(kosdaq.changePct) >= PULSE_KOSDAQ_PCT
        ? kosdaq
        : undefined;
  if (!trigger) return null;
  const dirWord = trigger.changePct < 0 ? "급락" : "급등";
  const noteParts = [
    `장중 ${input.timeLabel} 기준으로 ${trigger.label}가 크게 ${trigger.changePct < 0 ? "내리는" : "오르는"} 중이에요.`,
    ...(input.eventHeadline ? [`여러 매체가 함께 다루는 소식: ${input.eventHeadline}`] : []),
    "마감 후 '오늘의 국장 요약'으로 갱신돼요.",
  ];
  return {
    card: {
      kind: "content",
      id: `content:briefing:kr-pulse:${input.date}`,
      contentType: "briefing",
      scope: "domestic",
      headline: `${trigger.label} ${dirWord} 중 — 장중 ${input.timeLabel}`,
      facts: [
        ...input.indices.map((i) => ({ label: `${i.label} 지수`, value: signedPct(i.changePct) })),
        ...input.movers.slice(0, 3).map((m) => ({ label: m.name, value: signedPct(m.changePct) })),
      ],
      note: noteParts.join(" "),
      source: "네이버 시세(장중)",
      asOf: input.date,
    },
    pinned: true,
  };
}

/** 장중 급변 감지 — pulse 크론(장중 시간당). 임계 미달·스테일·휴장이면 null. */
export async function buildKrMarketPulse(): Promise<FeedBriefingRow | null> {
  const date = kstDate();
  const macro = await fetchMacro({ fresh: true }).catch(() => []);
  const indices = macro
    .filter((q) => ["kospi", "kosdaq"].includes(q.key) && typeof q.change === "number")
    .map((q) => ({
      key: q.key as "kospi" | "kosdaq",
      label: q.label,
      changePct: q.change as number,
      ...(q.tradedAt ? { tradedAt: q.tradedAt } : {}),
      ...(q.marketStatus ? { marketStatus: q.marketStatus } : {}),
    }));
  if (indices.length === 0) return null;
  // 발행 가드 — 휴장·장 시작 전(스테일/PREOPEN 껍데기)이면 발화하지 않는다.
  if (krPublishBlockReason(indices, date)) return null;
  const timeLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  // 임계 미달이면 시세 페이지 fetch 전에 빠지도록 — 먼저 지수만으로 판정.
  const probe = composeKrMarketPulse({ date, timeLabel, indices, movers: [] });
  if (!probe) return null;
  const rows = await fetchKrMarketRows().catch((): DiscoveryMarketRow[] => []);
  const movers = pickMovers(rows, 3)
    .filter((row) => typeof row.changePct === "number")
    .map((row) => ({ name: row.canonical, changePct: row.changePct! }));
  const eventHeadline = (await todayMarketEventHeadlines().catch(() => []))[0];
  return composeKrMarketPulse({ date, timeLabel, indices, movers, ...(eventHeadline ? { eventHeadline } : {}) });
}

interface MentionSnapshot {
  date: string;
  counts: Record<string, number>;
}

/** ② 버즈 스토리 — 언급 급증 사건. 장마감 크론에서 스냅샷 저장 + 카드 빌드. */
export async function buildBuzzStory(): Promise<FeedBriefingRow | null> {
  const attention = await computeStockAttentionSignals().catch(() => ({}) as Record<string, { mentionCount: number; mentionScore: number; newsEventLabel?: string; newsEventSource?: string }>);
  const date = kstDate();
  const counts: Record<string, number> = {};
  for (const [stock, signal] of Object.entries(attention)) counts[stock] = signal.mentionCount;
  await writeFeedContent(`mention-snapshot:${date}`, { date, counts } satisfies MentionSnapshot).catch(() => {});

  // 급증 판정 — 지난 스냅샷 평균 대비. 히스토리 부족하면 절대 언급 하한(정직한 폴백).
  const history = (await readFeedContentByPrefix<MentionSnapshot>("mention-snapshot:", 8)).filter((s) => s.row.date !== date);
  const avgFor = (stock: string): number | undefined => {
    const values = history.map((s) => s.row.counts[stock] ?? 0);
    if (values.length < 3) return undefined;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  const candidates = Object.entries(attention)
    .filter(([, signal]) => (signal.newsEventLabel ?? "").trim().length >= 8)
    .map(([stock, signal]) => {
      const avg = avgFor(stock);
      const spike = typeof avg === "number" ? (avg > 0 ? signal.mentionCount / avg : signal.mentionCount) : undefined;
      return { stock, signal, spike };
    })
    .filter((c) =>
      typeof c.spike === "number" ? c.spike >= BUZZ_SPIKE_RATIO && c.signal.mentionCount >= 4 : c.signal.mentionCount >= BUZZ_MIN_MENTIONS
    )
    .sort((a, b) => b.signal.mentionCount - a.signal.mentionCount);
  const top = candidates[0];
  if (!top) return null; // 오늘 떠든 사건 없음 — 카드 0(정직)

  const rows = await fetchKrMarketRows().catch((): DiscoveryMarketRow[] => []);
  const rowByName = new Map(rows.map((row) => [row.canonical, row]));
  const anchorRow = rowByName.get(top.stock);
  const sector = sectorOf(top.stock);
  const related = relatedTo({ kind: "event", ticker: top.stock, ...(sector ? { theme: sector } : {}) })
    .filter((node) => node.ticker !== top.stock && node.country === "KR")
    .slice(0, 3);
  const facts: DeckContentFact[] = [
    {
      label: top.stock,
      value: typeof anchorRow?.changePct === "number" ? signedPct(anchorRow.changePct) : `언급 ${top.signal.mentionCount}건`,
      detail: "사건의 중심",
    },
    ...related.map((node) => {
      const row = rowByName.get(node.ticker);
      return {
        label: node.label,
        value: typeof row?.changePct === "number" ? signedPct(row.changePct) : "—",
        detail: node.reason,
      };
    }),
  ];

  // 사건 요약 — 수집 기사 기반 LLM 2~3문장(크론 1콜), 폴백은 사건 헤드라인 그대로.
  let note: string | undefined;
  if (isAiConfigured()) {
    const articles = anchorRow?.naverCode ? await fetchNaverStockNews(anchorRow.naverCode, 5).catch(() => []) : [];
    const res = await callAI({
      messages: [
        {
          role: "system",
          content:
            "아래 기사 제목·요약(실데이터)만 근거로 이 사건이 무슨 일인지, 왜 시장이 떠드는지 한국어 2~3문장으로 정리하라. " +
            "입력에 없는 수치·사실 금지, 추측 인과 금지(기사에 있는 사실만), 매수·매도 권유 금지. 문장만 출력.",
        },
        {
          role: "user",
          content: JSON.stringify({
            event: top.signal.newsEventLabel,
            articles: articles.slice(0, 4).map((a) => ({ title: a.title, summary: a.summary ?? null })),
          }),
        },
      ],
      temperature: 0.3,
      timeoutMs: LLM_TIMEOUT_MS,
      trace: "feed-buzz",
    }).catch(() => ({ ok: false as const, content: "" }));
    if (res.ok && res.content) {
      const clean = res.content.replace(/\s+/g, " ").trim();
      if (clean.length >= 20 && clean.length <= 300 && !hasForbiddenCopy(clean)) note = clean;
    }
  }

  return {
    card: {
      kind: "content",
      id: `content:buzz:${date}`,
      contentType: "buzz",
      scope: "domestic",
      headline: top.signal.newsEventLabel!,
      facts,
      ...(note ? { note } : {}),
      source: top.signal.newsEventSource ?? "수집 뉴스 · 언급량",
      asOf: date,
    },
  };
}

function isoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const RECAP_UNIVERSE = 120;
const RECAP_CONCURRENCY = 6;

/** ③ 주간 회고 "일주일 전에 샀으면" — 주 1회 크론. KR 상위 유니버스 5거래일 등락 UP3/DOWN3. */
export async function buildWeeklyRecap(): Promise<FeedBriefingRow | null> {
  const rows = (await fetchKrMarketRows().catch((): DiscoveryMarketRow[] => [])).filter((row) => row.naverCode);
  if (rows.length === 0) return null;
  const universe = rows.slice(0, RECAP_UNIVERSE);
  const changes: Array<{ row: DiscoveryMarketRow; weeklyPct: number }> = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= universe.length) return;
      const row = universe[index]!;
      const daily = await fetchStockDaily(row.naverCode!, 16).catch(() => ({ closes: [] as number[] }));
      const closes = daily.closes;
      if (closes.length < 6) continue;
      const last = closes[closes.length - 1]!;
      const weekAgo = closes[closes.length - 6]!;
      if (weekAgo <= 0) continue;
      changes.push({ row, weeklyPct: ((last - weekAgo) / weekAgo) * 100 });
    }
  }
  await Promise.all(Array.from({ length: RECAP_CONCURRENCY }, () => worker()));
  if (changes.length < 20) return null;

  const sorted = [...changes].sort((a, b) => b.weeklyPct - a.weeklyPct);
  const winners = sorted.slice(0, 3);
  const losers = sorted.slice(-3).reverse();
  const factFor = async (entry: { row: DiscoveryMarketRow; weeklyPct: number }): Promise<DeckContentFact> => {
    const title = await moverMaterialTitleKr(entry.row.naverCode, entry.row.canonical);
    const why = title && title.length <= 60 && !hasForbiddenCopy(title) ? title : undefined;
    return {
      label: entry.row.canonical,
      value: signedPct(entry.weeklyPct),
      ...(why ? { detail: why } : {}),
    };
  };
  const facts: DeckContentFact[] = [];
  for (const entry of [...winners, ...losers]) facts.push(await factFor(entry));

  const week = isoWeek();
  return {
    card: {
      kind: "content",
      id: `content:recap:${week}`,
      contentType: "recap",
      scope: "domestic",
      headline: "일주일 전에 샀으면, 지금 내 계좌는",
      facts,
      note: "지난 5거래일 등락이에요. 이미 지나간 수익률은 다음 기회의 근거가 아니라 복기 재료예요.",
      source: "네이버 일봉 · 주간 등락",
      asOf: kstDate(),
    },
  };
}

// ── 요청 경로 read (캐시만) ──────────────────────────────────────────────────

export interface TodayFeedContent {
  cards: DeckContentCard[];
  pinnedIds: Set<string>;
  /** MARKET NOTE(국내 지수 카드) 해석 1줄. */
  indexNote?: string;
}

/** daily-30 빌드 시 호출 — DB 캐시만 읽는다(외부 fetch 0). */
export async function readTodayFeedContent(): Promise<TodayFeedContent> {
  const date = kstDate();
  const week = isoWeek();
  const yesterday = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // KST 기준 어제
  const prevWeek = isoWeek(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [us, kr, pulse, buzz, recap] = await Promise.all([
    readFeedContent<FeedBriefingRow>(`briefing:us:${date}`),
    readFeedContent<FeedBriefingRow>(`briefing:kr:${date}`),
    readFeedContent<FeedBriefingRow>(`briefing:kr-pulse:${date}`),
    readFeedContent<FeedBriefingRow>(`buzz:${date}`),
    readFeedContent<FeedBriefingRow>(`recap:${week}`),
  ]);
  // 피드 공백 메우기(2026-07-17): 버즈는 장마감(close)에야 생성 — 오늘분이 없으면 어제분(asOf 그대로, 정직)으로.
  // 회고는 금요일 빌드 후 주가 바뀌면 키가 사라져 월~목 공백이었다 — 지난주분으로 폴백해 주 내내 노출.
  const buzzRow = buzz?.card ? buzz : await readFeedContent<FeedBriefingRow>(`buzz:${yesterday}`).catch(() => null);
  const recapRow = recap?.card ? recap : await readFeedContent<FeedBriefingRow>(`recap:${prevWeek}`).catch(() => null);
  // 장중 펄스는 마감 브리핑이 생기면 그쪽이 정본 — 함께 노출하지 않는다.
  const rowsFound = [us, kr, kr?.card ? null : pulse, buzzRow, recapRow].filter((row): row is FeedBriefingRow => !!row?.card);
  const pinnedIds = new Set(rowsFound.filter((row) => row.pinned).map((row) => row.card.id));
  const indexNote = kr?.sectorPulse;
  return {
    cards: rowsFound.map((row) => row.card),
    pinnedIds,
    ...(indexNote ? { indexNote } : {}),
  };
}

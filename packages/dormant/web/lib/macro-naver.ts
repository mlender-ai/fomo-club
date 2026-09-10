/**
 * MACRO-01 §A·§B — **국내 소스에서 거시 지표를 받는다.**
 *
 * ## 왜 FRED 만으로는 안 되나
 *
 * FRED 는 공개 도메인이고 키가 없어도 되지만 **발표가 늦다.** 2026-09-01 실측:
 *
 * ```
 * 지표          FRED            네이버          차이
 * WTI 유가      08-25 $83.90    08-31 $85.76    6일
 * 원달러        08-28 1,379.41  08-31 1,369.50  3일
 * ```
 *
 * `국제 유가 · 8월 25일 기준` 이 6일 전 값이었던 원인이 이것이다 — 우리 크론이 실패한 게
 * 아니라 **소스가 거기까지밖에 없었다.** `DCOILWTICO` 는 EIA 주간 발표를 따라가므로 구조적으로
 * 늦는다. 크론을 더 자주 돌려도 안 고쳐진다.
 *
 * 그리고 애초에 FRED 에 **없는 것**들이 있다 — 코스피·코스닥·국고채·회사채. 우리 종목은
 * 대부분 국내인데 정작 국내 지표가 하나도 없었다.
 *
 * ## 세 갈래를 쓴다
 *
 * | 갈래 | 엔드포인트 | 무엇 |
 * |---|---|---|
 * | 지수 | `m.stock.naver.com/api/index/{code}/price` | 코스피·코스닥 |
 * | 환율 | `m.stock.naver.com/front-api/marketIndex/prices` | 원달러·원엔 |
 * | 표 | `finance.naver.com/marketindex/*DailyQuote.naver` | 국고채·회사채·유가·금 |
 *
 * 앞 둘은 JSON 이고 마지막은 **EUC-KR HTML 표**다. 표를 파싱하는 게 마음에 들지는 않지만,
 * 국고채·회사채 일별 시세를 키 없이 주는 곳이 여기 말고 없다. 파서가 깨지면 조용히 비는 게
 * 아니라 **사유를 남기고 그 지표만 빠진다**(§B-4 알림이 그걸 본다).
 */

import { TextDecoder } from "node:util";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 한 관측. 날짜는 `YYYY-MM-DD`, 오름차순으로 돌려준다. */
export interface MacroPoint {
  date: string;
  value: number;
}

const TIMEOUT_MS = 20_000;

async function getText(url: string, { euckr = false }: { euckr?: boolean } = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: euckr ? "text/html" : "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!euckr) return res.text();
  // 레거시 표는 EUC-KR 이다. UTF-8 로 읽으면 날짜 칸까지 깨져 파서가 통째로 헛돈다.
  return new TextDecoder("euc-kr").decode(await res.arrayBuffer());
}

/** `1,369.50` · `195,350.83` → 숫자. 쉼표를 지운다. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** 오래된 → 최신으로 세우고 같은 날짜는 하나만 남긴다. */
function normalize(points: MacroPoint[]): MacroPoint[] {
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) continue;
    if (!Number.isFinite(p.value)) continue;
    byDate.set(p.date, p.value);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 지수 — 코스피·코스닥                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

interface NaverIndexRow {
  localTradedAt?: unknown;
  closePrice?: unknown;
}

export function parseNaverIndexRows(payload: unknown): MacroPoint[] {
  if (!Array.isArray(payload)) return [];
  const out: MacroPoint[] = [];
  for (const row of payload as NaverIndexRow[]) {
    if (typeof row?.localTradedAt !== "string" || typeof row?.closePrice !== "string") continue;
    const value = parseNumber(row.closePrice);
    if (value === null) continue;
    out.push({ date: row.localTradedAt, value });
  }
  return out;
}

/**
 * 해외 지수 행 — 날짜가 `2026-08-31T17:09:33-04:00` 처럼 **시각까지** 온다.
 *
 * 앞 10자만 자른다. 현지 마감 시각이지 우리 타임존이 아니므로 `Date` 로 파싱해서 변환하면
 * 하루가 밀린다 — 뉴욕 오후 5시는 한국 다음 날 아침이다. 그 지수의 **거래일**이 우리가
 * 원하는 값이므로 문자열을 그대로 자른다.
 */
export function parseNaverWorldIndexRows(payload: unknown): MacroPoint[] {
  if (!Array.isArray(payload)) return [];
  const out: MacroPoint[] = [];
  for (const row of payload as NaverIndexRow[]) {
    if (typeof row?.localTradedAt !== "string" || typeof row?.closePrice !== "string") continue;
    const value = parseNumber(row.closePrice);
    if (value === null) continue;
    out.push({ date: row.localTradedAt.slice(0, 10), value });
  }
  return out;
}

/** 해외 지수(S&P500 `.INX` · 나스닥 `.IXIC` · VIX `.VIX`) 일별 종가. */
export async function fetchNaverWorldIndexSeries(code: string, pages: number): Promise<MacroPoint[]> {
  const rows: MacroPoint[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const text = await getText(
      `https://api.stock.naver.com/index/${encodeURIComponent(code)}/price?pageSize=10&page=${page}`
    );
    const parsed = parseNaverWorldIndexRows(JSON.parse(text) as unknown);
    if (parsed.length === 0) break;
    rows.push(...parsed);
  }
  return normalize(rows);
}

/** 지수 일별 종가. 한 페이지 10개씩이라 `pages` 만큼 넘긴다. */
export async function fetchNaverIndexSeries(code: string, pages: number): Promise<MacroPoint[]> {
  const rows: MacroPoint[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const text = await getText(
      `https://m.stock.naver.com/api/index/${encodeURIComponent(code)}/price?pageSize=10&page=${page}`
    );
    const parsed = parseNaverIndexRows(JSON.parse(text) as unknown);
    if (parsed.length === 0) break; // 더 없는 페이지 — 조용히 멈춘다
    rows.push(...parsed);
  }
  return normalize(rows);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 환율                                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export function parseNaverMarketIndexRows(payload: unknown): MacroPoint[] {
  const result = (payload as { result?: unknown })?.result;
  if (!Array.isArray(result)) return [];
  const out: MacroPoint[] = [];
  for (const row of result as NaverIndexRow[]) {
    if (typeof row?.localTradedAt !== "string" || typeof row?.closePrice !== "string") continue;
    const value = parseNumber(row.closePrice);
    if (value === null) continue;
    out.push({ date: row.localTradedAt, value });
  }
  return out;
}

/** 환율 일별 종가. `pageSize` 하한이 10이다(그보다 작게 부르면 400). */
export async function fetchNaverExchangeSeries(reutersCode: string, pages: number): Promise<MacroPoint[]> {
  const rows: MacroPoint[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const text = await getText(
      `https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=${encodeURIComponent(reutersCode)}&page=${page}&pageSize=10`
    );
    const parsed = parseNaverMarketIndexRows(JSON.parse(text) as unknown);
    if (parsed.length === 0) break;
    rows.push(...parsed);
  }
  return normalize(rows);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 레거시 표 — 국고채·회사채·유가·금                                            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * `일별 시세` 표를 읽는다. 행 모양:
 *
 * ```html
 * <tr class="up">
 *   <td class="date"> 2026.08.31 </td>
 *   <td class="num"> 85.76 </td>
 *   …
 * ```
 *
 * **첫 `num` 칸만** 쓴다 — 나머지는 등락폭·등락률이라 종가가 아니다. `<tr>` 에 class 가
 * 붙어 있으므로 여는 태그를 `<tr[^>]*>` 로 잡는다(`<tr>` 로만 잡으면 한 행도 못 찾는다).
 */
export function parseNaverDailyQuoteTable(html: string): MacroPoint[] {
  const out: MacroPoint[] = [];
  for (const row of html.split(/<tr[^>]*>/i).slice(1)) {
    const dateMatch = row.match(/<td[^>]*class="date"[^>]*>([\s\S]*?)<\/td>/i);
    if (!dateMatch) continue;
    const rawDate = dateMatch[1]!.replace(/<[^>]+>/g, "").trim();
    const iso = rawDate.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (!iso) continue;
    const numMatch = row.match(/<td[^>]*class="num"[^>]*>([\s\S]*?)<\/td>/i);
    if (!numMatch) continue;
    const value = parseNumber(numMatch[1]!.replace(/<[^>]+>/g, "").trim());
    if (value === null) continue;
    out.push({ date: `${iso[1]}-${iso[2]}-${iso[3]}`, value });
  }
  return out;
}

/** 레거시 표 종류 — 지표마다 경로가 다르다. */
export type NaverQuoteKind = "interest" | "world" | "gold";

const QUOTE_PATH: Record<NaverQuoteKind, (code: string, page: number) => string> = {
  interest: (code, page) =>
    `https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=${code}&page=${page}`,
  // `fdtc=2` 는 해외 시세 탭이다. 빼면 빈 표가 온다.
  world: (code, page) =>
    `https://finance.naver.com/marketindex/worldDailyQuote.naver?marketindexCd=${code}&fdtc=2&page=${page}`,
  gold: (code, page) =>
    `https://finance.naver.com/marketindex/goldDailyQuote.naver?marketindexCd=${code}&page=${page}`,
};

export async function fetchNaverQuoteSeries(
  kind: NaverQuoteKind,
  code: string,
  pages: number
): Promise<MacroPoint[]> {
  const rows: MacroPoint[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const html = await getText(QUOTE_PATH[kind](code, page), { euckr: true });
    const parsed = parseNaverDailyQuoteTable(html);
    if (parsed.length === 0) break;
    rows.push(...parsed);
  }
  return normalize(rows);
}

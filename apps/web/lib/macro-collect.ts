/**
 * MACRO-01 §A·§B — **거시 지표를 숫자로 가져온다.**
 *
 * ## 왜 뉴스 기사가 아니라 숫자인가
 *
 * 기사에는 라이선스가 붙지만 **공공 통계 숫자에는 안 붙는다.**
 *
 * ## 왜 소스가 둘인가 (2026-09-01 개정)
 *
 * 종전에는 FRED 하나로 5종을 받았고, 사실상 유가 한 장만 카드가 됐다. 문제가 둘이었다.
 *
 * | 문제 | 실측 |
 * |---|---|
 * | FRED 가 늦다 | WTI: FRED `08-25 $83.90` vs 네이버 `08-31 $85.76` — **6일 차이** |
 * | FRED 에 없다 | 코스피·코스닥·국고채·회사채 — 우리 종목 대부분이 국내인데 |
 *
 * `국제 유가 · 8월 25일 기준` 이 6일 전 값이었던 원인이 이것이다. **우리 크론이 실패한 게
 * 아니라 소스가 거기까지밖에 없었다.** `DCOILWTICO` 는 EIA 발표 주기를 따라가므로 크론을
 * 더 자주 돌려도 안 고쳐진다. 그래서 국내에서 받을 수 있는 것은 네이버에서 받고, 미국
 * 것만 FRED 에 남긴다.
 *
 * ## 파생 지표는 계산한다
 *
 * `creditspread`(회사채 3년 − 국고채 3년)와 `yieldcurve`(미 국채 10년 − 2년)는 받아오는 게
 * 아니라 두 시리즈에서 만든다. **한쪽만 있는 날은 만들지 않는다** — 어제 국고채에서 오늘
 * 회사채를 빼면 그건 스프레드가 아니라 아무 숫자다.
 */

import type { MacroIndicatorId } from "@fomo/core/keyword-cards/macro-move";
import {
  fetchNaverExchangeSeries,
  fetchNaverIndexSeries,
  fetchNaverQuoteSeries,
  fetchNaverWorldIndexSeries,
  type MacroPoint,
} from "./macro-naver";
import { fetchTreasuryYields } from "./macro-treasury";

/**
 * **FRED 를 안 쓴다.**
 *
 * 원래 미국 지표만 FRED 에 남기려 했는데, 실제로 굽혀 보니 화요일에 **미국 지표 6종이
 * 전부 「4일 전 기준」** 이라 신선도 게이트에 걸렸다(2026-09-01 실측). 지표를 15종으로
 * 늘려 놓고 그중 6종이 주 초에 죽으면 늘린 의미가 없다.
 *
 * 원본이 더 빠르다:
 *
 * | 지표 | FRED | 원본 | 원본 소스 |
 * |---|---|---|---|
 * | 미 국채 10년 | 08-28 | **08-31** | 재무부 일별 CSV |
 * | S&P 500 | 08-28 | **08-31** | 네이버 해외지수 |
 * | VIX | 08-28 | **08-31** | 네이버 해외지수 |
 *
 * 옮겨 실은 것을 받을 이유가 없다. FRED 는 공개 도메인이라 좋았지만 **느린 게 문제였다.**
 */

/** 네이버에서 받는 것 — 갈래마다 엔드포인트가 다르다. */
const NAVER_JOBS: ReadonlyArray<{
  id: MacroIndicatorId;
  run: (pages: number) => Promise<MacroPoint[]>;
  /** 페이지당 행 수가 달라 필요한 페이지 수가 다르다. */
  pages: number;
}> = [
  { id: "kospi", run: (p) => fetchNaverIndexSeries("KOSPI", p), pages: 12 },
  { id: "kosdaq", run: (p) => fetchNaverIndexSeries("KOSDAQ", p), pages: 12 },
  { id: "usdkrw", run: (p) => fetchNaverExchangeSeries("FX_USDKRW", p), pages: 12 },
  { id: "jpykrw", run: (p) => fetchNaverExchangeSeries("FX_JPYKRW", p), pages: 12 },
  { id: "ktb3y", run: (p) => fetchNaverQuoteSeries("interest", "IRR_GOVT03Y", p), pages: 17 },
  { id: "corp3y", run: (p) => fetchNaverQuoteSeries("interest", "IRR_CORP03Y", p), pages: 17 },
  { id: "oil", run: (p) => fetchNaverQuoteSeries("world", "OIL_CL", p), pages: 17 },
  { id: "gold", run: (p) => fetchNaverQuoteSeries("gold", "CMDT_GC", p), pages: 17 },
  { id: "sp500", run: (p) => fetchNaverWorldIndexSeries(".INX", p), pages: 12 },
  { id: "nasdaq", run: (p) => fetchNaverWorldIndexSeries(".IXIC", p), pages: 12 },
  { id: "vix", run: (p) => fetchNaverWorldIndexSeries(".VIX", p), pages: 12 },
];

/** 미 재무부에서 받는 것 — 열 이름으로 찾는다(위치로 세면 만기가 추가될 때 통째로 어긋난다). */
const TREASURY_JOBS: ReadonlyArray<{ id: MacroIndicatorId; column: string }> = [
  { id: "ust10y", column: "10 Yr" },
  { id: "ust2y", column: "2 Yr" },
];

/** 얼마나 거슬러 받나 — 추이선(20관측)과 연속 판정에 넉넉한 길이. */
const LOOKBACK_DAYS = 120;

/**
 * **오늘 값은 버린다 — 아직 안 끝난 거래일이다.**
 *
 * 네이버 환율·금값은 장중에도 오늘 날짜로 값을 준다. 굽는 크론은 09:10 KST 에 도는데 그때
 * 원화 시장은 문 연 지 10분이다. 그 10분치를 종가처럼 쓰면:
 *
 * - 카드가 하루에도 몇 번씩 뒤집힌다 (실측: 원엔 누적 -1.607% ↔ -1.29% 를 오갔다)
 * - 「4일째 내리고 있어요」가 장 마감 때 사실이 아니게 될 수 있다
 *
 * 우리는 하루 한 번 굽고 그 카드가 종일 서 있다. 그러면 **끝난 거래일만 말해야** 한다.
 * 하루 늦어지는 대신 뒤집히지 않는다.
 */
function dropToday(points: MacroPoint[], today: string): MacroPoint[] {
  return points.filter((p) => p.date < today);
}

export interface MacroCollection {
  asOf: string;
  /** 지표별 관측(오래된 → 최신). */
  series: Partial<Record<MacroIndicatorId, MacroPoint[]>>;
  errors: string[];
}

function shiftIso(date: string, days: number): string {
  const base = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(base)) return date;
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 두 시리즈의 차 — **같은 날짜끼리만** 뺀다.
 *
 * 한쪽에만 있는 날은 버린다. 어제 국고채에서 오늘 회사채를 빼면 그건 스프레드가 아니라
 * 아무 숫자다.
 */
export function spreadSeries(minuend: MacroPoint[], subtrahend: MacroPoint[]): MacroPoint[] {
  const by = new Map(subtrahend.map((p) => [p.date, p.value]));
  const out: MacroPoint[] = [];
  for (const p of minuend) {
    const other = by.get(p.date);
    if (other === undefined) continue;
    out.push({ date: p.date, value: p.value - other });
  }
  return out;
}

/** 지표 전부를 받는다. 실패한 지표는 **사유를 남기고 건너뛴다** — 조용히 비우지 않는다. */
export async function collectMacro(today: string): Promise<MacroCollection> {
  const errors: string[] = [];
  const series: MacroCollection["series"] = {};
  const from = shiftIso(today, -LOOKBACK_DAYS);
  const year = today.slice(0, 4);

  // ── 미 재무부 — 국채 금리 ──
  for (const job of TREASURY_JOBS) {
    try {
      const points = dropToday(
        (await fetchTreasuryYields(year, job.column)).filter((p) => p.date >= from),
        today
      );
      if (points.length === 0) { errors.push(`treasury ${job.id}: 관측 0`); continue; }
      series[job.id] = points;
    } catch (error) {
      errors.push(`treasury ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ── 네이버 — 국내 지표·유가·금·해외지수 ──
  for (const job of NAVER_JOBS) {
    try {
      const points = dropToday(await job.run(job.pages), today);
      if (points.length === 0) { errors.push(`naver ${job.id}: 관측 0`); continue; }
      series[job.id] = points;
    } catch (error) {
      errors.push(`naver ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ── 파생 — 회사채 가산금리 · 미 장단기 금리차 ──
  const derive = (id: MacroIndicatorId, a: MacroPoint[] | undefined, b: MacroPoint[] | undefined, label: string) => {
    if (!a || !b) { errors.push(`${label}: 재료 시리즈 없음`); return; }
    const spread = spreadSeries(a, b);
    if (spread.length === 0) { errors.push(`${label}: 겹치는 날짜 0`); return; }
    series[id] = spread;
  };
  derive("creditspread", series.corp3y, series.ktb3y, "creditspread(회사채−국고채)");
  derive("yieldcurve", series.ust10y, series.ust2y, "yieldcurve(10년−2년)");

  return { asOf: today, series, errors };
}

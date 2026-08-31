/**
 * WO-RESET-09 §A-3 — **거시 지표를 숫자로 가져온다.**
 *
 * ## 왜 뉴스 기사가 아니라 숫자인가
 *
 * 기사에는 라이선스가 붙지만 **공공 통계 숫자에는 안 붙는다.** FRED(세인트루이스 연은)는
 * 공개 도메인이고 API 키 없이 CSV 를 준다 — 실측(2026-08-29, 6종 전부 200):
 *
 * ```
 * DEXKOUS      원달러 환율      1,385.01  (08-21)
 * DCOILWTICO   WTI 유가         83.90     (08-25)
 * FEDFUNDS     미 기준금리      3.63      (07-01)
 * DGS10        미 국채 10년     4.67      (08-27)
 * SP500        S&P 500          7,711.76  (08-28)
 * VIXCLS       변동성 지수      14.51     (08-27)
 * ```
 *
 * 기존 `fred.ts` 가 이미 이 엔드포인트를 쓴다 — 같은 규약을 따른다.
 */

import type { MacroIndicatorId } from "@fomo/core/keyword-cards/macro-link";

const FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; FomoClubBot/1.0)" };

/** 우리 지표 → FRED 시리즈. 실측으로 확인한 것만 적는다. */
export const FRED_SERIES_BY_INDICATOR: Record<MacroIndicatorId, string> = {
  usdkrw: "DEXKOUS",
  oil: "DCOILWTICO",
  ust10y: "DGS10",
  fedfunds: "FEDFUNDS",
  vix: "VIXCLS",
};

/** 얼마나 거슬러 받나 — 추이선(20관측)과 연속 판정에 넉넉한 길이. */
const LOOKBACK_DAYS = 120;

export interface MacroCollection {
  asOf: string;
  /** 지표별 관측(오래된 → 최신). */
  series: Partial<Record<MacroIndicatorId, Array<{ date: string; value: number }>>>;
  errors: string[];
}

/**
 * FRED CSV 파싱. 헤더 한 줄 + `날짜,값`.
 *
 * 결측은 `.` 로 온다 — **버린다.** 0 으로 읽으면 환율이 0원이 되고 그 한 줄이 추이선을
 * 통째로 망가뜨린다.
 */
export function parseFredCsv(csv: string): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(",");
    if (!date || !raw) continue;
    const trimmed = raw.trim();
    if (trimmed === "." || trimmed === "") continue;
    const value = Number(trimmed);
    if (!Number.isFinite(value)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) continue;
    out.push({ date: date.trim(), value });
  }
  return out;
}

function shiftIso(date: string, days: number): string {
  const base = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(base)) return date;
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** 지표 전부를 받는다. 실패한 지표는 **사유를 남기고 건너뛴다** — 조용히 비우지 않는다. */
export async function collectMacro(today: string): Promise<MacroCollection> {
  const errors: string[] = [];
  const series: MacroCollection["series"] = {};
  const from = shiftIso(today, -LOOKBACK_DAYS);

  for (const [id, seriesId] of Object.entries(FRED_SERIES_BY_INDICATOR)) {
    try {
      const res = await fetch(`${FRED_CSV}?id=${seriesId}&cosd=${from}`, {
        headers: UA,
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!res.ok) { errors.push(`fred ${seriesId}: HTTP ${res.status}`); continue; }
      const points = parseFredCsv(await res.text());
      if (points.length === 0) { errors.push(`fred ${seriesId}: 관측 0`); continue; }
      series[id as MacroIndicatorId] = points;
    } catch (error) {
      errors.push(`fred ${seriesId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { asOf: today, series, errors };
}

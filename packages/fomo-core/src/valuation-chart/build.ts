import { frameOf } from "../archetype/classify";
import type { ArchetypeCode, ChartAxes, ChartBarSeries, ChartLineMetric } from "../archetype/types";
import type { BandStat, FactSheet } from "../fundamentals/types";
import { bandCaption, barSeriesCaption, estimateCaption, fallbackCaption } from "./caption";
import type {
  ChartBar,
  ChartUnavailableReason,
  EstimateMeta,
  ValuationChartData,
} from "./types";

/**
 * 값의 상태 차트 빌더 (WO-SUB-04).
 *
 * 축은 **독트린에서 로드한다** — 이 파일에 유형별 표를 두지 않는다. 02R 이 유형 목록을 바꾸면
 * `doctrine.json` 행이 바뀌고 이 코드는 그대로다.
 *
 * 그리지 못하는 경우가 정상이라는 전제로 짰다. 없는 구간을 채우거나 보간하지 않고,
 * 못 그리면 `renderable: false` 로 **영역 자체를 감춘다**(빈 박스로 남기지 않는다).
 */

/**
 * 실적 막대 최소 칸수. 2칸 이하는 "추이"가 아니라 점이다 — 차트를 그리지 않는다.
 * (예상 막대는 이 계산에 넣지 않는다. 컨센서스만으로 채운 3칸은 실적 추이가 아니다.)
 */
const MIN_ACTUAL_BARS = 3;

/** 배수 선을 그릴 수 없는 사유를 캡션이 아니라 데이터로 남긴다. */
function hidden(
  symbol: string,
  archetype: ArchetypeCode,
  rulesetVersion: string,
  currency: "KRW" | "USD",
  reason: ChartUnavailableReason
): ValuationChartData {
  return {
    symbol,
    archetype,
    ruleset_version: rulesetVersion,
    bars: [],
    line: null,
    bar_metric: null,
    bar_label: null,
    line_metric: null,
    line_label: null,
    currency,
    estimate_meta: { present: false, source: null, as_of: null, analyst_count: null },
    band: null,
    warning: null,
    captions: [],
    renderable: false,
    unavailable_reason: reason,
  };
}

/** "2026-12-31" → "26". 회계연도 끝 두 자리만 쓴다(축이 좁다). */
function yearLabel(periodEnd: string): string {
  return periodEnd.slice(2, 4);
}

/**
 * 컨센서스가 준 기간 라벨을 축 라벨로 정규화한다.
 *
 * 소스가 `"202612"`·`"2026-12"`·`"2026"` 같은 원본 코드를 준다. 그대로 쓰면 실적 막대
 * (`21 22 23 24 25`)와 **자릿수가 다른 라벨이 축에 섞여** 차트가 잘못 읽힌다(실측: 카드
 * 화면에서 예상 막대만 `202612` 로 나왔다). 4자리 연도를 찾아 2자리로 줄인다.
 */
function estimateLabel(raw: string): string | null {
  const year = raw.match(/(19|20)\d{2}/);
  return year ? year[0].slice(2, 4) : (/^\d{2}$/.test(raw.trim()) ? raw.trim() : null);
}

/**
 * 막대 시계열 해석.
 *
 * **팩트시트에 없는 시계열은 만들지 않는다.** `null` 을 돌려주면 차트가 숨겨진다.
 *
 * 확보된 것 (2026-08-03 확장):
 *  · `annual_revenue` · `quarterly_operating_income` — `fiscal` 절
 *  · `quarterly_cash_balance` · `annual_equity` — `balance.cash_quarters`·`equity_quarters`.
 *    파이프라인이 이미 분기별로 수집하고 있었는데 `assemble` 이 최신값만 남기고 버리던 것을
 *    노출했다. 새 소스를 붙인 것이 아니다.
 *
 * `annual_dps`(MATURE_INCOME) 는 2026-08-06 에 열렸다 — 네이버 연간표가 `주당배당금` 행을
 * 그대로 준다(총액 역산이 아니다). US 는 SEC 연간 기간값 헬퍼가 없어 아직 빈 배열이다.
 *
 * 아직 없는 것: `annual_net_interest_income`(BANK — 자기자본 축으로 교체됨).
 * **없는 것을 다른 지표로 바꿔 그리지 않는다.**
 */
function resolveBars(factsheet: FactSheet, series: ChartBarSeries): ChartBar[] | null {
  if (series === "annual_revenue") {
    return factsheet.fiscal.annual
      .filter((row) => row.revenue !== null)
      .map((row) => ({
        label: yearLabel(row.period_end),
        value: row.revenue,
        kind: "actual" as const,
        source: row.source,
        as_of: row.period_end,
      }));
  }
  if (series === "quarterly_cash_balance") {
    return factsheet.balance.cash_quarters.map((point) => ({
      label: point.period,
      value: point.value,
      kind: "actual" as const,
      source: point.source,
      as_of: point.period_end,
    }));
  }
  if (series === "annual_equity") {
    // 연간 막대다 — 회계연도말(12월 분기)만 남긴다. 분기를 섞으면 "연간"이 아니게 된다.
    return factsheet.balance.equity_quarters
      .filter((point) => point.period_end.slice(5, 7) === "12")
      .map((point) => ({
        label: yearLabel(point.period_end),
        value: point.value,
        kind: "actual" as const,
        source: point.source,
        as_of: point.period_end,
      }));
  }
  if (series === "annual_dps") {
    /**
     * 주당배당금 — **소스가 주당 기준으로 직접 준 값만 쓴다**(2026-08-06).
     * 배당총액 ÷ 현재 주식수로 만들지 않는다: 과거 연도에 현재 주식수를 대면 분할·증자 이력이
     * 있는 종목에서 틀린 값이 나온다. `valuation.dps_annual` 은 연간 시계열이라 필터가 필요 없다.
     */
    return factsheet.valuation.dps_annual.map((point) => ({
      label: yearLabel(point.period_end),
      value: point.value,
      kind: "actual" as const,
      source: point.source,
      as_of: point.period_end,
    }));
  }
  if (series === "quarterly_operating_income") {
    return factsheet.fiscal.quarters
      .filter((row) => row.operating_income !== null)
      .map((row) => ({
        label: row.period,
        value: row.operating_income,
        kind: "actual" as const,
        source: row.source,
        as_of: row.period_end,
      }));
  }
  return null;
}

/** 예상 막대 — 컨센서스가 있을 때만. **추세 연장으로 만들지 않는다**(§4 규칙 2). */
function estimateBars(factsheet: FactSheet, series: ChartBarSeries, lastActual: string | null): ChartBar[] {
  if (series !== "annual_revenue") return [];
  const { consensus } = factsheet;
  if (!consensus.available || !consensus.source) return [];
  const values = [consensus.revenue_fy1, consensus.revenue_fy2, consensus.revenue_fy3];
  const bars: ChartBar[] = [];
  const baseYear = lastActual === null ? null : Number.parseInt(lastActual, 10);
  for (const [index, value] of values.entries()) {
    if (value === null) continue;
    // 라벨은 컨센서스가 준 기간명을 우선하고, 없으면 마지막 실적 연도에서 이어 붙인다.
    const fromSource = consensus.periods[index];
    const label =
      (fromSource === undefined ? null : estimateLabel(fromSource)) ??
      (baseYear === null ? null : String(baseYear + index + 1).padStart(2, "0"));
    if (label === null) continue;
    bars.push({
      label,
      value,
      kind: "estimate",
      source: consensus.source,
      as_of: consensus.as_of ?? "",
    });
  }
  return bars;
}

function metricValue(factsheet: FactSheet, metric: ChartLineMetric): number | null {
  const v = factsheet.valuation;
  switch (metric) {
    case "per_ttm":
      return v.per_ttm;
    case "per_forward":
      return v.per_forward;
    case "pbr":
      return v.pbr;
    case "psr_ttm":
      return v.psr_ttm;
    case "dividend_yield":
      return v.dividend_yield;
  }
}

function bandOf(factsheet: FactSheet, metric: ChartLineMetric | null): BandStat | null {
  if (metric === null) return null;
  const band = factsheet.valuation.band_5y;
  if (metric === "per_ttm" || metric === "per_forward") return band.per;
  if (metric === "pbr") return band.pbr;
  if (metric === "psr_ttm") return band.psr;
  return null;
}

/** 축이 요구하는 지표를 고른다. 1순위가 없으면 대체 지표로 내려가고 그 사실을 캡션에 남긴다. */
function resolveLineMetric(
  factsheet: FactSheet,
  axes: ChartAxes
): { metric: ChartLineMetric | null; label: string | null; caption: string | null } {
  if (axes.line_metric === null) return { metric: null, label: null, caption: null };
  if (metricValue(factsheet, axes.line_metric) !== null) {
    return { metric: axes.line_metric, label: axes.line_label, caption: null };
  }
  const fallback = axes.line_fallback_metric;
  if (fallback !== null && metricValue(factsheet, fallback) !== null) {
    return {
      metric: fallback,
      label: fallback.toUpperCase(),
      caption: fallbackCaption(axes.line_label ?? axes.line_metric, fallback.toUpperCase()),
    };
  }
  return { metric: null, label: null, caption: null };
}

/**
 * 값을 읽는 프레임(WO-SUB-HOOK D8 · 4-2) — **차트와 독립**으로 밴드 캡션·유형 경고문만 뽑는다.
 *
 * ## 왜 따로 필요한가
 *
 * 디테일 "재무 한눈에"에 PER 19.55배가 숫자로만 있었다. 이 배치의 출발점이 "숫자만 주면
 * 정반대로 읽는다"였는데, 04 가 만든 밴드 위치 캡션과 유형별 경고문은 **차트 안에만** 있었다.
 * 차트가 안 그려지는 종목(막대 부족·미분류)에서는 경고문까지 같이 사라져 INV-11 이 화면에서
 * 무효가 된다. 그래서 캡션·경고문을 차트 렌더 가능 여부와 분리해 만든다.
 */
export interface ValuationFrameNotes {
  /** 밴드 위치 캡션 등 — 없으면 빈 배열(없는 말을 만들지 않는다). */
  captions: string[];
  /** 유형별 경고문(디테일 전체 문안). 독트린에서 로드한다. */
  warning: string | null;
  /** 밴드 기준 지표 라벨(PER/PBR/PSR). 화면이 어떤 수치 옆에 붙일지 판단한다. */
  band_label: string | null;
}

export function buildValuationFrameNotes(
  factsheet: FactSheet,
  archetype: ArchetypeCode
): ValuationFrameNotes {
  if (archetype === "UNCLASSIFIED") return { captions: [], warning: null, band_label: null };
  const frame = frameOf(archetype);
  const axes = frame.chart_axes;
  const line = axes === null ? { metric: null, label: null, caption: null } : resolveLineMetric(factsheet, axes);
  const band = bandOf(factsheet, line.metric);
  const captions: string[] = [];
  if (line.caption) captions.push(line.caption);
  const bandText = line.label === null ? null : bandCaption(band, line.label);
  if (bandText) captions.push(bandText);
  /**
   * CTX-05 §4-2 는 "밴드가 없으면 밴드를 보라는 경고문을 띄우지 않는다" 를 요구한다.
   * **여기서는 아직 적용하지 않았다** — 기존 불변식과 충돌하기 때문이다.
   *
   * WO-SUB-HOOK D8 은 정반대를 명시한다: 차트가 안 그려지는 종목에서 경고문까지 사라지면
   * INV-11 이 화면에서 무효가 되므로, 이 함수는 **차트 렌더 가능 여부와 무관하게** 경고문을
   * 남기도록 일부러 분리돼 있다(위 주석 참조). 실제로 `BANK_FINANCIAL` 회귀 테스트가 그것을 고정한다.
   *
   * 두 요구가 같은 줄에서 부딪히므로 사람 판단이 필요하다. 캡션 문구는 §4-2 대로 고쳐
   * "못 준다" 를 분명히 했고, 경고문 억제는 판단 후에 붙인다.
   */
  return { captions, warning: frame.warning_full, band_label: line.label };
}

export function buildValuationChart(
  factsheet: FactSheet,
  archetype: ArchetypeCode,
  rulesetVersion: string
): ValuationChartData {
  const currency = factsheet.currency === "KRW" ? "KRW" : "USD";

  // 1. UNCLASSIFIED 폴백을 **가장 먼저** 처리한다. 02R 전환기에 미분류가 늘어도 여기서 걸린다.
  if (archetype === "UNCLASSIFIED") {
    return hidden(factsheet.symbol, archetype, rulesetVersion, currency, "unclassified");
  }

  const frame = frameOf(archetype);
  const axes = frame.chart_axes;
  if (axes === null) {
    return hidden(factsheet.symbol, archetype, rulesetVersion, currency, "no_axes");
  }

  // 2. 팩트시트가 그 시계열을 못 주면 숨긴다 — 다른 지표로 바꿔 그리지 않는다.
  const actualBars = resolveBars(factsheet, axes.bar_series);
  if (actualBars === null) {
    return hidden(factsheet.symbol, archetype, rulesetVersion, currency, "bar_series_unavailable");
  }
  if (actualBars.length === 0) {
    return hidden(factsheet.symbol, archetype, rulesetVersion, currency, "no_bar_data");
  }
  /**
   * 막대가 모자라면 숨긴다 (WO-SUB-HOOK D6 · 완료 조건 6).
   *
   * 실측: 빅텍 카드에 `매출` 라벨과 짧은 선 하나만 있었다. `renderable: true` 였지만 막대가
   * 1칸이라 추세가 없었고, 화면에는 "그리다 만 차트"로 보였다. 한 칸짜리 막대는 값의 위치를
   * 말하지 못한다 — **라벨만 남기느니 영역을 감춘다.** 예상 막대로 칸을 채워 3칸을 만들지도
   * 않는다(컨센서스는 실적이 아니다).
   */
  if (actualBars.length < MIN_ACTUAL_BARS) {
    return hidden(factsheet.symbol, archetype, rulesetVersion, currency, "too_few_bars");
  }

  const lastActualLabel = actualBars[actualBars.length - 1]?.label ?? null;
  const estimates = estimateBars(factsheet, axes.bar_series, lastActualLabel);
  const bars = [...actualBars, ...estimates];

  const line = resolveLineMetric(factsheet, axes);
  const band = bandOf(factsheet, line.metric);

  const estimateMeta: EstimateMeta = {
    present: estimates.length > 0,
    source: estimates.length > 0 ? factsheet.consensus.source : null,
    as_of: estimates.length > 0 ? factsheet.consensus.as_of : null,
    analyst_count: estimates.length > 0 ? factsheet.consensus.analyst_count : null,
  };

  const captions: string[] = [];
  if (line.caption) captions.push(line.caption);
  const bandText = line.label === null ? null : bandCaption(band, line.label);
  if (bandText) captions.push(bandText);
  const estimateText = estimateCaption(estimateMeta, estimates[0]?.label ?? null);
  if (estimateText) captions.push(estimateText);
  // 막대 정체는 **맨 뒤**에 붙인다. 카드(compact)는 첫 캡션만 보여주므로 앞에 넣으면
  // 밴드 위치 문장을 밀어낸다 — 카드에서는 차트 안 축 라벨이 같은 사실을 말한다.
  const barText = barSeriesCaption(axes.bar_label);
  if (barText) captions.push(barText);

  return {
    symbol: factsheet.symbol,
    archetype,
    ruleset_version: rulesetVersion,
    bars,
    /**
     * 배수 **시계열**은 아직 팩트시트에 없다 — `valuation` 은 현재 스칼라만 들고 있고
     * 5년 밴드는 백분위(p20/p50/p80)로만 남는다. 없는 시계열을 현재값으로 채워 수평선을
     * 그리면 "배수가 5년간 변하지 않았다"는 거짓말이 된다. 그래서 `null` 로 둔다.
     * 밴드 위치는 캡션과 밴드 마커가 대신 말한다.
     */
    line: null,
    bar_metric: axes.bar_series,
    bar_label: axes.bar_label,
    line_metric: line.metric,
    line_label: line.label,
    currency,
    estimate_meta: estimateMeta,
    band,
    // 경고문은 독트린에서 로드한다 — 코드에 문안을 두지 않는다.
    warning: frame.warning_full,
    captions,
    renderable: true,
    unavailable_reason: null,
  };
}

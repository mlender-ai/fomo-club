import type { FactSheet } from "../fundamentals/types";
import doctrineJson from "./doctrine.json";
import { inIndustrySet, industrySetsFor, BIO_REVENUE_FLOOR, RULESET_VERSION, THRESHOLDS } from "./ruleset";
import type {
  ArchetypeCode,
  ArchetypeDecision,
  ArchetypeDoctrine,
  ArchetypeFrame,
  ArchetypeHistory,
  ArchetypeResult,
  UnclassifiedReason,
} from "./types";

/**
 * 아키타입 분류기 (WO-SUB-02 §6).
 *
 * **규칙 기반. LLM 사용 금지 — 예외 없음.** 순수 함수다(네트워크·시각·난수 없음).
 * 같은 팩트시트면 항상 같은 분류가 나온다.
 *
 * 판정 순서는 첫 매치에서 종료한다. 순서 자체가 정책이다 —
 * 예컨대 은행은 적자여도 은행이고, 적자 바이오는 성장률을 보기 전에 바이오다.
 */

export const DOCTRINE: ArchetypeDoctrine = doctrineJson as ArchetypeDoctrine;

/**
 * 연간 통계를 신뢰하려면 필요한 최소 관측 연수. θ_cyclical 을 도출한 라벨셋이 5개년이므로 같은 값을 쓴다.
 * 이보다 적으면 통계를 쓰지 않고 업종 코드 단독으로 판정한다(독트린 §4-3).
 */
export const STDEV_MIN_YEARS = 5;

const FRAMES = new Map<ArchetypeCode, ArchetypeFrame>(DOCTRINE.archetypes.map((frame) => [frame.code, frame]));

/** 독트린에서 프레임을 읽는다. 경고문·금지 지표는 **반드시 이 경로로만** 가져간다(하드코딩 금지). */
export function frameOf(code: ArchetypeCode): ArchetypeFrame {
  const frame = FRAMES.get(code);
  if (!frame) throw new Error(`독트린에 없는 아키타입: ${code}`);
  return frame;
}

/** 이 유형에서 렌더가 금지된 필드 경로 — WO-SUB-09 INV-06 이 참조한다. */
export function forbiddenPaths(code: ArchetypeCode): string[] {
  return frameOf(code).forbidden_metrics.map((entry) => entry.path);
}

/** 이 유형에서 렌더하려면 경고문이 필수인 필드 경로 — INV-11 이 참조한다. */
export function warningRequiredPaths(code: ArchetypeCode): string[] {
  return frameOf(code).requires_warning_metrics.map((entry) => entry.path);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function inputsOf(factsheet: FactSheet): ArchetypeResult["inputs"] {
  return {
    scheme: factsheet.classification.scheme,
    industry: factsheet.classification.industry,
    coverage_flag: factsheet.fiscal.coverage_flag,
    net_income_ttm: factsheet.fiscal.ttm.net_income,
    revenue_ttm: factsheet.fiscal.ttm.revenue,
    revenue_yoy: factsheet.growth.revenue_yoy,
    revenue_cagr_3y: factsheet.growth.revenue_cagr_3y,
    operating_stdev_annual: factsheet.margin.operating_stdev_annual,
    operating_stdev_annual_years: factsheet.margin.operating_stdev_annual_years,
    dividend_yield: factsheet.valuation.dividend_yield,
    pbr: factsheet.valuation.pbr,
    net_cash_ratio: ratio(factsheet.balance.net_cash, factsheet.market_data.market_cap),
  };
}

function unclassified(factsheet: FactSheet, reason: UnclassifiedReason): ArchetypeResult {
  return {
    code: "UNCLASSIFIED",
    ruleset_version: RULESET_VERSION,
    reason,
    matched_rule: `unclassified:${reason}`,
    stdev_confirmed: false,
    inputs: inputsOf(factsheet),
  };
}

function classified(
  factsheet: FactSheet,
  code: ArchetypeCode,
  matchedRule: string,
  stdevConfirmed = false
): ArchetypeResult {
  return {
    code,
    ruleset_version: RULESET_VERSION,
    reason: null,
    matched_rule: matchedRule,
    stdev_confirmed: stdevConfirmed,
    inputs: inputsOf(factsheet),
  };
}

/**
 * 시클리컬 판정.
 *
 * 통계가 있으면 임계값으로 확인한다. **통계가 없으면 업종 코드 단독으로 판정한다** —
 * KR 은 분기·연간 관측이 구조적으로 부족해(네이버 5분기·3개년) 통계를 요구하면 국내 시클리컬이
 * 전부 다른 유형으로 떨어진다. 이 유형에 한해 WO §4 원칙 3(오분류는 UNCLASSIFIED 쪽으로)을
 * **반대로 적용**한다 — 근거는 오분류 비용의 비대칭이다(독트린 §4-3).
 *  · 과잉 포함: 불필요한 PER 경고를 봄 → 오독을 유발하지 않는다
 *  · 과소 포함: 정유·철강에 경고 없이 PER 제시 → 독트린이 막으려던 바로 그 오독이 발생한다
 * 통계로 확인되지 않은 판정은 `stdev_confirmed: false` 로 남겨 사후 채점에서 분리 집계한다.
 */
function cyclicalVerdict(stdev: number | null, years: number): { cyclical: boolean; confirmed: boolean } {
  // 관측 연수가 임계값 도출 표본(5개년)에 못 미치면 통계를 신뢰하지 않는다.
  // KR 은 네이버 연간 3개뿐이라 표본표준편차가 구조적으로 작게 나온다 — 실측: POSCO·현대차·현대제철·
  // 팬오션이 전부 θ 아래로 떨어져 UNCLASSIFIED/TURNAROUND_LOSS 로 갔다(골든셋 KR 시클리컬 20개 중 14개).
  // 3개년 통계로 5개년 기준 임계값을 재는 것은 다른 자를 대는 것이다.
  if (stdev === null || years < STDEV_MIN_YEARS) return { cyclical: true, confirmed: false };
  return { cyclical: stdev > THRESHOLDS.cyclical_operating_stdev_annual_pp, confirmed: true };
}

export function classifyArchetype(factsheet: FactSheet): ArchetypeResult {
  // 0. 데이터 부족 선차단 — 프레임을 씌울 근거가 없으면 씌우지 않는다.
  if (factsheet.fiscal.coverage_flag === "none") return unclassified(factsheet, "no_fiscal");
  const scheme = factsheet.classification.scheme;
  const industry = factsheet.classification.industry;
  if (!industry || !factsheet.classification.sector) return unclassified(factsheet, "no_sector");
  if (!industrySetsFor(scheme)) return unclassified(factsheet, "unknown_scheme");

  const currency = factsheet.currency;
  const bioFloor = BIO_REVENUE_FLOOR[currency];
  const netIncome = factsheet.fiscal.ttm.net_income;
  const revenue = factsheet.fiscal.ttm.revenue;

  // 1. 섹터 우선 — 은행은 적자여도 은행이다(자산·부채 구조가 사업이므로 다른 자를 댈 수 없다).
  if (inIndustrySet(scheme, industry, "bank")) return classified(factsheet, "BANK_FINANCIAL", "sector:bank");
  if (inIndustrySet(scheme, industry, "biotech") && revenue !== null && revenue < bioFloor) {
    return classified(factsheet, "BIOTECH_PIPELINE", "sector:biotech+revenue<floor");
  }

  // 2. 시클리컬 — **적자 판정보다 앞선다.**
  //
  // 지시서 §6-1 은 손익 상태(적자)를 시클리컬보다 먼저 본다. 골든셋 100종목 실측에서 그 순서가
  // 최대 오분류원이었다: 다운사이클 구간의 화학·철강·정유는 **적자이므로** `TURNAROUND_LOSS` 로 갔다
  // (LG화학·롯데케미칼·CLF·AA 등 9건). 그런데 사이클 업종의 적자는 "전환에 실패할 수도 있는 구조적 적자"가
  // 아니라 **사이클의 저점**이다 — 유형을 나누는 사실 자체가 다르다.
  //
  // 게다가 이 오분류는 위험한 방향이다. `TURNAROUND_LOSS` 프레임은 "흑자 전환 여부"를 핵심 변수로 제시하는데,
  // 시클리컬에서 봐야 하는 것은 "지금 사이클의 어디인가"다. 잘못된 프레임을 씌우는 쪽이므로 원칙 3 위반이다.
  // 그래서 순서를 바꿨다 — 근거는 독트린 §5-4.
  //
  // 단 **성장 단계의 적자는 사이클 저점이 아니다.** 매출이 급증하면서 적자인 기업(전기차 신생사 등)은
  // 업종이 사이클 업종이어도 제품 가격 사이클로 설명되지 않는다 — 실측: RIVN·LCID 가 "Auto Manufacturing"
  // 이라는 이유로 `CYCLICAL_COMMODITY` 로 갔다(골든셋 위험 오분류 2건). 더 구체적인 규칙이 이긴다.
  const hypergrowthLoss =
    netIncome !== null &&
    netIncome < 0 &&
    factsheet.growth.revenue_yoy !== null &&
    factsheet.growth.revenue_yoy > THRESHOLDS.hypergrowth_revenue_yoy_pct;
  if (!hypergrowthLoss && inIndustrySet(scheme, industry, "cyclical")) {
    const verdict = cyclicalVerdict(factsheet.margin.operating_stdev_annual, factsheet.margin.operating_stdev_annual_years);
    if (verdict.cyclical) {
      return classified(factsheet, "CYCLICAL_COMMODITY", "industry:cyclical+stdev", verdict.confirmed);
    }
  }

  // 3. 손익 상태 — 적자면 밸류에이션 배수를 쓸 수 없어 유형이 갈린다.
  if (netIncome !== null && netIncome < 0) {
    const yoy = factsheet.growth.revenue_yoy;
    if (yoy !== null && yoy > THRESHOLDS.hypergrowth_revenue_yoy_pct) {
      return classified(factsheet, "HYPERGROWTH_UNPROFITABLE", "loss+revenue_yoy>θ");
    }
    return classified(factsheet, "TURNAROUND_LOSS", "loss");
  }

  // 4. 제약 — 매출이 있는 제약은 개발단계 바이오와 다른 자를 쓴다.
  if (inIndustrySet(scheme, industry, "pharma") && revenue !== null && revenue >= bioFloor) {
    return classified(factsheet, "PHARMA_STABLE", "industry:pharma+revenue>=floor");
  }

  // 5. 성숙·배당 — 배당이 높고 성장이 낮은 상태.
  const dividendYield = factsheet.valuation.dividend_yield;
  const cagr = factsheet.growth.revenue_cagr_3y;
  if (
    dividendYield !== null &&
    dividendYield > THRESHOLDS.mature_dividend_yield_pct &&
    cagr !== null &&
    cagr < THRESHOLDS.low_growth_cagr_pct
  ) {
    return classified(factsheet, "MATURE_INCOME", "dividend>θ+cagr<θ");
  }

  // 6. 성장·흑자.
  if (cagr !== null && cagr > THRESHOLDS.growth_cagr_pct && netIncome !== null && netIncome > 0) {
    return classified(factsheet, "QUALITY_COMPOUNDER", "cagr>θ+profit");
  }

  // 7. 자산형.
  const pbr = factsheet.valuation.pbr;
  const netCashRatio = ratio(factsheet.balance.net_cash, factsheet.market_data.market_cap);
  if (pbr !== null && pbr < 1 && netCashRatio !== null && netCashRatio > THRESHOLDS.asset_net_cash_ratio) {
    return classified(factsheet, "ASSET_DEEP_VALUE", "pbr<1+net_cash_ratio>θ");
  }

  // 8. 기본값 — 분류 실패는 정상 결과다.
  return unclassified(factsheet, "no_rule_matched");
}

/**
 * 히스테리시스 (§6-3) — 임계값 근처에서 분기마다 분류가 튀는 것을 막는다.
 *
 * 새 분류는 **2회 연속** 관측돼야 확정된다. 단 두 경우는 즉시 반영한다.
 *  · `UNCLASSIFIED` → 특정 유형 (데이터가 생긴 것)
 *  · 특정 유형 → `UNCLASSIFIED` (데이터가 사라진 것)
 * 진동이 아니라 데이터 상태 변화이므로 지연시키면 오히려 거짓을 유지하게 된다.
 *
 * 룰셋 버전이 바뀌면 이력을 무효화하고 새 분류를 즉시 확정한다 — 다른 규칙으로 만든 이력과
 * 연속성을 따지는 것은 의미가 없다.
 */
export function applyHysteresis(result: ArchetypeResult, history: ArchetypeHistory | null): ArchetypeDecision {
  const raw = result.code;
  const fresh = (code: ArchetypeCode): ArchetypeHistory => ({
    confirmed: code,
    pending: null,
    pending_streak: 0,
    ruleset_version: result.ruleset_version,
  });

  if (!history || history.ruleset_version !== result.ruleset_version) {
    return { code: raw, raw, pending_change: null, history: fresh(raw), result };
  }
  if (history.confirmed === raw) {
    return { code: raw, raw, pending_change: null, history: fresh(raw), result };
  }
  // 데이터가 생기거나 사라진 전환은 즉시 반영한다.
  if (history.confirmed === "UNCLASSIFIED" || raw === "UNCLASSIFIED") {
    return { code: raw, raw, pending_change: null, history: fresh(raw), result };
  }

  const streak = history.pending === raw ? history.pending_streak + 1 : 1;
  if (streak >= 2) {
    return { code: raw, raw, pending_change: null, history: fresh(raw), result };
  }
  return {
    code: history.confirmed,
    raw,
    pending_change: raw,
    history: { confirmed: history.confirmed, pending: raw, pending_streak: streak, ruleset_version: result.ruleset_version },
    result,
  };
}

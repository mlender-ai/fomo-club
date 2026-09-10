/**
 * 아키타입 분류 상수 (WO-SUB-02 §6-2). **버전이 찍힌 상수 파일.**
 *
 * 임계값이 바뀌면 과거 분류의 의미가 달라지므로, 판단 원장에 `ruleset_version` 을 함께 기록해야 한다.
 * 이 파일을 고칠 때는 반드시 버전을 올리고 독트린 §7 버전 이력에 영향 범위를 적는다.
 */

/**
 * 분류 규칙의 버전.
 *
 * 독트린 버전(`doctrine.json#version`)과 **다른 축이다** — 독트린은 축·문안·금지 지표의 정본이고
 * 이 값은 규칙의 버전이다. v1.1.0(BANK 막대축 교체)은 축만 바뀌어 이 값을 올리지 않았다.
 * v1.2.0 은 `STABLE_EARNINGS` 규칙이 추가돼 **분류 결과가 달라지므로** 올린다
 * (`applyHysteresis` 가 이력을 무효화하고 새 분류를 즉시 확정한다 — 다른 규칙으로 만든
 * 이력과 연속성을 따지는 것은 의미가 없다).
 */
export const RULESET_VERSION = "archetype-v1.2.0";

/**
 * 절대금액 임계값은 **통화별로 분리한다**(WO §11 실패 모드 "통화 무시한 절대금액 임계값").
 * 바이오 매출 하한: 판매 중인 제품이 있다고 볼 최소 매출.
 *  · USD 1,000만 달러 — 미국 임상 단계 바이오텍의 기술이전·용역 수익 수준을 넘는 선
 *  · KRW 300억 원 — 국내 신약 개발사가 원료·용역 매출로 올리는 수준을 넘는 선
 */
export const BIO_REVENUE_FLOOR = {
  USD: 10_000_000,
  KRW: 30_000_000_000,
} as const;

export const THRESHOLDS = {
  /** 매출 전년동기 증가율(%) — 고성장·적자 판정. */
  hypergrowth_revenue_yoy_pct: 40,
  /**
   * 영업이익률 **연간** 표본표준편차(%p) — 시클리컬 판정.
   *
   * 왜 분기(`operating_stdev_8q`)가 아니라 연간인가: 분기 통계는 계절성이 경기순환성을 덮어쓴다.
   * 실측(2026-07-28, 라벨 40종목): INTU(소프트웨어) 18.7%p > CLF(철강) 3.75%p.
   * 게다가 KR 은 분기 통계가 구조적으로 `null` 이다(네이버 분기 5개 상한).
   *
   * 왜 3.0 인가: 업종 게이트를 통과한 종목만을 모수로 재면 —
   *  · 라벨 시클리컬 14종목의 최저값이 3.19 → 3.0 은 전원을 통과시킨다(재현율 100%)
   *  · 사이클 업종이지만 마진이 계약으로 고정된 예외 4종목 중 PPG(1.55)를 배제한다
   * 자세한 근거·한계는 `docs/archetype/DOCTRINE_archetype_frames.md` §5.
   */
  cyclical_operating_stdev_annual_pp: 3.0,
  /** 배당수익률(%) — 성숙·배당 판정. */
  mature_dividend_yield_pct: 3,
  /** 3년 매출 CAGR(%) 하한 — 이보다 낮으면 저성장. */
  low_growth_cagr_pct: 5,
  /** 3년 매출 CAGR(%) 상한 — 이보다 높으면 성장주. */
  growth_cagr_pct: 15,
  /** 순현금 / 시가총액 — 자산형 판정. */
  asset_net_cash_ratio: 0.3,
} as const;

/**
 * 업종 집합은 **분류 스킴별로 분리한다**(WO §11 "산업 분류 스킴을 하나로 뭉갬").
 * 문자열은 전부 실측 응답에서 그대로 가져왔다 — 추측한 업종명으로 집합을 만들면 매칭이 조용히 실패한다.
 *  · `nasdaq_industry` — `api.nasdaq.com/api/quote/{sym}/summary` 의 `Industry`
 *  · `naver_industry`  — `m.stock.naver.com/api/stocks/industry` 의 79개 그룹명
 */
export type ClassificationScheme = "nasdaq_industry" | "naver_industry";

interface IndustrySets {
  bank: readonly string[];
  biotech: readonly string[];
  pharma: readonly string[];
  cyclical: readonly string[];
  utility: readonly string[];
}

const NASDAQ: IndustrySets = {
  bank: [
    "Major Banks",
    "Savings Institutions",
    "Banks",
    "Finance: Consumer Services",
    "Investment Bankers/Brokers/Service",
    "Investment Managers",
    "Property-Casualty Insurers",
    "Life Insurance",
    "Accident &Health Insurance",
    "Specialty Insurers",
    "Diversified Financial Services",
    "Finance Companies",
    "Real Estate Investment Trusts",
  ],
  biotech: [
    "Biotechnology: Biological Products (No Diagnostic Substances)",
    "Biotechnology: In Vitro & In Vivo Diagnostic Substances",
    "Biotechnology: Commercial Physical & Biological Resarch",
    "Biotechnology: Laboratory Analytical Instruments",
  ],
  pharma: ["Biotechnology: Pharmaceutical Preparations", "Major Pharmaceuticals", "Medicinal Chemicals & Botanical Products"],
  cyclical: [
    "Semiconductors",
    "Electronic Components",
    "Steel/Iron Ore",
    "Metal Mining",
    "Precious Metals",
    "Aluminum",
    "Major Chemicals",
    "Paints/Coatings",
    "Agricultural Chemicals",
    "Containers/Packaging",
    "Forest Products",
    "Integrated oil Companies",
    "Oil Refining/Marketing",
    "Oil & Gas Production",
    "Coal Mining",
    "Oilfield Services/Equipment",
    "Marine Transportation",
    "Construction/Ag Equipment/Trucks",
    "Industrial Machinery/Components",
    "Auto Manufacturing",
    "Homebuilding",
  ],
  utility: [
    "Electric Utilities: Central",
    "Natural Gas Distribution",
    "Water Supply",
    "Power Generation",
    "Oil/Gas Transmission",
    "Telecommunications Equipment",
  ],
};

const NAVER: IndustrySets = {
  bank: ["은행", "증권", "손해보험", "생명보험", "기타금융", "카드", "창업투자", "부동산"],
  biotech: ["생물공학", "생명과학도구및서비스", "건강관리기술"],
  pharma: ["제약", "건강관리장비및용품", "건강관리업체및서비스"],
  cyclical: [
    "반도체와반도체장비",
    "디스플레이장비및부품",
    "디스플레이패널",
    "화학",
    "철강",
    "비철금속",
    "석유와가스",
    "조선",
    "해운사",
    "기계",
    "건설",
    "건축자재",
    "건축제품",
    "종이와목재",
    "포장재",
    "자동차",
    "자동차부품",
    "전기장비",
    "에너지장비및서비스",
    "항공사",
    "항공화물운송과물류",
  ],
  utility: ["전기유틸리티", "복합유틸리티", "무선통신서비스", "다각화된통신서비스", "운송인프라", "도로와철도운송"],
};

const BY_SCHEME: Readonly<Record<ClassificationScheme, IndustrySets>> = {
  nasdaq_industry: NASDAQ,
  naver_industry: NAVER,
};

/** 스킴을 모르면 어떤 집합에도 매치시키지 않는다 — 추측 매칭이 오분류의 입구다. */
export function industrySetsFor(scheme: string | null | undefined): IndustrySets | null {
  if (scheme === "nasdaq_industry" || scheme === "naver_industry") return BY_SCHEME[scheme];
  return null;
}

export function inIndustrySet(
  scheme: string | null | undefined,
  industry: string | null | undefined,
  key: keyof IndustrySets
): boolean {
  const sets = industrySetsFor(scheme);
  const name = industry?.trim();
  if (!sets || !name) return false;
  return sets[key].includes(name);
}

/**
 * 시클리컬 업종이지만 마진이 계약으로 고정돼 이 유형이 아닌 것으로 확인된 종목 —
 * 실측에서 stdev 게이트가 걸러내지 못한 알려진 한계다(독트린 §5-3).
 * **자동 예외 처리에 쓰지 않는다.** 문서화와 재검토 등재용 목록이다.
 */
export const KNOWN_CYCLICAL_GATE_MISSES: readonly string[] = ["LIN", "APD", "TXN"];

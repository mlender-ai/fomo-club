/**
 * 보일러플레이트 필터 (WO-SUB-06 §5-2 처리 3 · 커밋 3).
 *
 * ## 무엇을 거르나
 *
 * 공시 위험요소 섹션은 **모든 기업에 해당하는 문구**로 절반이 채워져 있다("경쟁이 치열합니다",
 * "경제 상황에 영향을 받습니다"). 그걸 그대로 종목 고유 리스크로 내보내면 §10 실패 모드
 * "위험요소 섹션의 보일러플레이트를 그대로 노출" 이 된다 — 소스는 진짜인데 정보가 0 인 문장이다.
 *
 * ## 유형 리스크와 섞지 않는다
 *
 * 이 필터는 **§5-2 공시 추출 경로 전용**이다. 독트린의 유형 리스크에는 적용하지 않는다.
 * 실제로 독트린에는 `quality-competition`("새로 들어오는 회사가 늘거나 가격 경쟁이 붙으면…")
 * 항목이 있고, 이 필터의 `경쟁` 패턴과 문구 계열이 겹친다. 둘은 다른 것이다:
 *
 *  · 유형 리스크는 **"이 유형에 흔히 해당한다"고 고지를 붙여** 일반론임을 밝히고 내보낸다
 *  · 종목 고유 리스크는 **이 회사만의 사실이라고 주장**하므로 일반론이면 거짓이 된다
 *
 * 그래서 필터를 공용 유틸로 만들지 않는다. 하나로 합치면 독트린 확정 항목이 조용히 지워진다.
 *
 * ## 사전은 작게 시작한다
 *
 * §11 지침: "처음엔 작게 시작하고 골든셋 결과를 보며 키울 것." 과하게 잡으면 종목 고유 리스크가
 * 함께 지워지는데, 그 손실은 커버리지 숫자로만 보이고 무엇이 지워졌는지는 안 보인다.
 * 그래서 `filterBoilerplate` 는 **지워진 항목과 사유를 함께 돌려준다**(조용한 절단 금지).
 */

export type BoilerplateRule =
  | "generic_competition"
  | "generic_macro"
  | "generic_regulation"
  | "generic_disaster"
  | "generic_personnel"
  | "generic_cyber"
  | "generic_ip"
  | "no_specifics";

interface RulePattern {
  rule: BoilerplateRule;
  pattern: RegExp;
  /** 사전에 왜 들어왔는지 — 키울 때 중복·과잉을 판단하는 근거. */
  note: string;
}

/**
 * 사전 v1. 각 패턴은 **주어가 특정되지 않은 일반 서술**만 잡는다.
 * 회사·제품·수치가 붙은 문장은 아래 `no_specifics` 규칙에서 살아남는다.
 */
const PATTERNS: readonly RulePattern[] = [
  {
    rule: "generic_competition",
    pattern: /(경쟁이?\s*(치열|심화|격화)|시장\s*경쟁.{0,8}(있|하)|경쟁\s*업체가?\s*(많|증가))/,
    note: "어느 상장사나 쓰는 문구. 경쟁 리스크는 '누가·어떤 제품에서'가 붙어야 사실이 된다",
  },
  {
    rule: "generic_macro",
    pattern: /(경기\s*(변동|침체|둔화).{0,12}(영향|따라)|경제\s*(상황|환경).{0,12}영향|국내외\s*경제|거시\s*경제.{0,10}영향|금리[·, ]?환율[·, ]?유가)/,
    note: "매크로 노출은 전 종목 공통이라 이 회사를 설명하지 않는다",
  },
  {
    rule: "generic_regulation",
    pattern: /(법규?의?\s*제정.{0,8}개정|관련\s*법령.{0,10}변경.{0,10}(영향|있)|정부\s*정책.{0,10}변화.{0,10}영향)/,
    note: "규제 변화 일반론. 어떤 규제가 어느 품목에 걸리는지가 없으면 정보가 0",
  },
  {
    rule: "generic_disaster",
    pattern: /(천재지변|자연재해|전쟁.{0,6}테러|감염병.{0,10}확산.{0,10}영향|예측할\s*수\s*없는\s*사유)/,
    note: "불가항력 조항. 위험요소 섹션의 법률 방어 문구지 관측 가능한 리스크가 아니다",
  },
  {
    rule: "generic_personnel",
    pattern: /(우수?\s*인력.{0,10}(확보|유치|이탈)|핵심\s*인력.{0,10}(이탈|의존).{0,12}(있|영향))/,
    note: "인력 리스크 일반론. 특정 인물·조직 사실이 없으면 전 기업 공통",
  },
  {
    rule: "generic_cyber",
    pattern: /(해킹|사이버\s*공격|정보\s*보안\s*사고).{0,16}(가능성|우려|발생할\s*수)/,
    note: "보안 사고 가능성은 모든 기업에 열려 있다. 실제 사고·과징금은 사실이므로 남는다",
  },
  {
    rule: "generic_ip",
    pattern: /(지식재산권?.{0,10}(침해|분쟁).{0,14}(가능성|우려)|특허\s*분쟁.{0,10}(발생할\s*수|가능성))/,
    note: "IP 분쟁 가능성 일반론. 계류 중인 특정 소송은 사실이므로 남는다",
  },
];

/**
 * 수치·고유명사가 하나도 없는 짧은 일반문.
 *
 * 위 패턴을 피해가는 보일러플레이트가 남기 때문에 마지막 그물로 둔다. 숫자·퍼센트·연도·
 * 영문 고유명사 중 아무것도 없고 길이가 짧으면 이 회사를 설명하는 문장이 아니다.
 */
const SPECIFIC_MARKER = /\d|[A-Z][A-Za-z]{2,}/;
const NO_SPECIFICS_MAX_CHARS = 45;

export interface BoilerplateHit {
  rule: BoilerplateRule;
  matched: string;
}

/** 문장 1개의 보일러플레이트 판정. 빈 배열이면 종목 고유 리스크 후보로 남는다. */
export function boilerplateHits(text: string): BoilerplateHit[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [{ rule: "no_specifics", matched: "" }];
  const hits: BoilerplateHit[] = [];
  for (const { rule, pattern } of PATTERNS) {
    const match = clean.match(pattern);
    if (match) hits.push({ rule, matched: match[0] });
  }
  if (hits.length === 0 && clean.length <= NO_SPECIFICS_MAX_CHARS && !SPECIFIC_MARKER.test(clean)) {
    hits.push({ rule: "no_specifics", matched: clean.slice(0, 24) });
  }
  return hits;
}

export function isBoilerplate(text: string): boolean {
  return boilerplateHits(text).length > 0;
}

export interface BoilerplateFilterResult<T> {
  kept: T[];
  /** 지워진 항목 + 사유. 리포트·문서에 남긴다 — 무엇이 지워졌는지 안 보이면 사전을 키울 수 없다. */
  dropped: Array<{ item: T; hits: BoilerplateHit[] }>;
}

/** 후보 목록에서 보일러플레이트를 걸러낸다. 지워진 것을 버리지 않고 사유와 함께 돌려준다. */
export function filterBoilerplate<T>(items: readonly T[], textOf: (item: T) => string): BoilerplateFilterResult<T> {
  const kept: T[] = [];
  const dropped: Array<{ item: T; hits: BoilerplateHit[] }> = [];
  for (const item of items) {
    const hits = boilerplateHits(textOf(item));
    if (hits.length === 0) kept.push(item);
    else dropped.push({ item, hits });
  }
  return { kept, dropped };
}

/** 사전 규칙 목록 — 생성 문서(`docs/risk/BOILERPLATE_FILTER.md`)가 이걸 렌더한다. */
export function boilerplateRules(): Array<{ rule: BoilerplateRule; source: string; note: string }> {
  return [
    ...PATTERNS.map((entry) => ({ rule: entry.rule, source: entry.pattern.source, note: entry.note })),
    {
      rule: "no_specifics" as BoilerplateRule,
      source: `길이 ≤ ${NO_SPECIFICS_MAX_CHARS}자 AND 숫자·영문 고유명사 없음`,
      note: "위 패턴을 피해가는 일반문의 마지막 그물. 수치나 고유명사가 있으면 통과시킨다",
    },
  ];
}

/**
 * WO-SUB-00 §4-1 — 카드 함량 3라벨 판정(순수 함수).
 *
 * 렌더 텍스트가 아니라 **카드 페이로드(JSON)** 를 기준으로 판정한다(재현성).
 * 판정 규칙 자체를 테스트로 봉인한다 — 규칙이 흔들리면 기준선도 흔들린다.
 */

/** 회사소개 원문 복붙으로 볼 유사도 임계값. 이상이면 "정보 없음"으로 친다. */
export const COPYPASTE_JACCARD = 0.8;

/** 정규화 — 공백·구두점·대소문자 차이를 제거한 토큰 집합. */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

export function jaccard(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

/** 페이로드에서 재무 사실로 인정할 수치 필드(가격·등락률은 제외 — 그건 시세지 재무가 아니다). */
export const FINANCIAL_KEYS = [
  "revenue",
  "operatingIncome",
  "netIncome",
  "revenueGrowth",
  "per",
  "pbr",
  "psr",
  "dividendYield",
  "marketCap",
  "operatingMargin",
] as const;

export interface CardPayloadLike {
  /** 사업 설명으로 쓰이는 자리(현재 스키마: conviction.whyCompany). */
  businessText?: string | null;
  /** 외부 회사소개 원문(있으면 복붙 여부 판정에 쓴다). */
  externalDescription?: string | null;
  /** 페이로드에서 발견된 재무 수치 — 값이 null 이면 결측으로 친다. */
  financialValues?: Record<string, number | null | undefined>;
  /** 수치를 어떻게 읽어야 하는지 서술한 문장(밴드 위치·업종 경고 등). */
  frameText?: string | null;
}

export interface SubstanceLabels {
  has_business_context: boolean;
  has_financial_fact: boolean;
  has_frame: boolean;
  /** 판정 근거 — 문서에 그대로 인용할 수 있게 남긴다. */
  reasons: string[];
}

export function labelCard(card: CardPayloadLike): SubstanceLabels {
  const reasons: string[] = [];

  const business = card.businessText?.trim() ?? "";
  let hasBusiness = business.length > 0;
  if (!hasBusiness) {
    reasons.push("business: 사업 설명 필드가 비어 있음");
  } else if (card.externalDescription?.trim()) {
    const sim = jaccard(business, card.externalDescription);
    if (sim >= COPYPASTE_JACCARD) {
      hasBusiness = false;
      reasons.push(`business: 외부 회사소개 원문과 유사도 ${sim.toFixed(2)} ≥ ${COPYPASTE_JACCARD} → 복붙으로 판정`);
    } else {
      reasons.push(`business: 원문 대비 유사도 ${sim.toFixed(2)} → 자체 서술로 인정`);
    }
  } else {
    reasons.push("business: 비교할 외부 원문 없음 — 존재만으로 인정");
  }

  const values = card.financialValues ?? {};
  const present = FINANCIAL_KEYS.filter((k) => typeof values[k] === "number" && Number.isFinite(values[k] as number));
  const hasFinancial = present.length > 0;
  reasons.push(hasFinancial ? `financial: ${present.join(", ")}` : "financial: 재무 수치 0개(필드 부재 또는 null)");

  const frame = card.frameText?.trim() ?? "";
  const hasFrame = frame.length > 0;
  reasons.push(hasFrame ? "frame: 해석 문장 존재" : "frame: 수치 해석 문장 없음");

  return {
    has_business_context: hasBusiness,
    has_financial_fact: hasFinancial,
    has_frame: hasFrame,
    reasons,
  };
}

export function ratio(items: readonly SubstanceLabels[], key: keyof SubstanceLabels): number {
  if (items.length === 0) return 0;
  const n = items.filter((i) => i[key] === true).length;
  return (n / items.length) * 100;
}

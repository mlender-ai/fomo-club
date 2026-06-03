// 투자 조언으로 오인될 수 있는 금칙어 목록 (규제 준수)

export const FORBIDDEN_TERMS_BLOCKED: string[] = [
  // 매매 신호
  "매수", "매도", "buy", "sell",
  "사세요", "파세요", "사야", "팔아야",
  // 수익 보장
  "수익 보장", "guaranteed return", "guaranteed profit",
  "반드시 오른다", "반드시 내린다", "확실히", "확실한",
  "무조건 상승", "무조건 하락",
  // 투자 추천
  "투자 추천", "investment advice", "투자 조언",
  "투자하세요", "투자를 권합니다",
  // 타이밍 직접 제시
  "지금 사기 좋은", "지금 팔기 좋은",
  "매수 타이밍", "매도 타이밍",
];

export const FORBIDDEN_TERMS_RISK: string[] = [
  "좋은 타이밍", "적기입니다", "최적의 시기",
  "강한 매수세", "강한 매도세",
  "수익률 %", "% 상승 예상", "% 하락 예상",
  // 신호 드라이버 판정어가 출력에 에코될 때 대비 (방향성 우열 암시)
  "상승 우위", "하락 우위", "방향 우위",
];

export const REQUIRED_DISCLAIMER =
  "이 해석은 투자 조언이 아닙니다. 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.";

export type SafetyCheckResult = "CLEAN" | "RISK" | "BLOCKED";

export interface SafetyCheckReport {
  result: SafetyCheckResult;
  matchedTerms: string[];
  text: string;
}

export function checkSafety(text: string): SafetyCheckReport {
  const lower = text.toLowerCase();

  const blockedMatches = FORBIDDEN_TERMS_BLOCKED.filter((term) =>
    lower.includes(term.toLowerCase())
  );
  if (blockedMatches.length > 0) {
    return { result: "BLOCKED", matchedTerms: blockedMatches, text };
  }

  const riskMatches = FORBIDDEN_TERMS_RISK.filter((term) =>
    lower.includes(term.toLowerCase())
  );
  if (riskMatches.length > 0) {
    return { result: "RISK", matchedTerms: riskMatches, text };
  }

  return { result: "CLEAN", matchedTerms: [], text };
}

export function sanitizeInterpretation(text: string): string {
  let sanitized = text;
  for (const term of FORBIDDEN_TERMS_BLOCKED) {
    const regex = new RegExp(term, "gi");
    sanitized = sanitized.replace(regex, "***");
  }
  return sanitized;
}

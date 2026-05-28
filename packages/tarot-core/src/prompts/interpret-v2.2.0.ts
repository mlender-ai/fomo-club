import type { DrawnCard, MarketSnapshot } from "../types.js";
import { buildInterpretationPromptV2_1 } from "./interpret-v2.1.0.js";

// 프롬프트 버전: v2.2.0
// 핵심 변경: MarketSnapshot에 재무 지표 컨텍스트 추가 (선택적 확장)
// v2.1.0 대비: 기업 규모/재무 건전성/성장성을 심리 언어로 추가 번역
// 구조적 확장 — 미구현 시 v2.1.0과 동일하게 동작
export const PROMPT_VERSION_2_2 = "2.2.0";

// 재무 지표 확장 컨텍스트 — MarketSnapshot의 optional 필드로 전달
export interface FinancialContext {
  profitMargins?: number | null;     // 순이익률
  grossMargins?: number | null;      // 매출총이익률
  revenueGrowth?: number | null;     // 매출 성장률
  returnOnEquity?: number | null;    // ROE
  returnOnAssets?: number | null;    // ROA
  debtToEquity?: number | null;      // 부채비율
  currentRatio?: number | null;      // 유동비율
  freeCashflow?: number | null;      // 잉여현금흐름 (부호만 사용)
}

function translateProfitability(ctx: FinancialContext): string | null {
  const { profitMargins, grossMargins } = ctx;
  if (profitMargins == null && grossMargins == null) return null;

  const parts: string[] = [];

  if (profitMargins != null) {
    if (profitMargins > 0.2) parts.push("매출 대비 높은 수익을 지키는 기업 — 가격 결정력이 강한 상태");
    else if (profitMargins > 0.1) parts.push("안정적인 수익 구조를 가진 기업");
    else if (profitMargins > 0) parts.push("수익이 나고 있지만 여유가 많지 않은 구조");
    else parts.push("지금 수익보다 성장에 투자하는 단계 — 미래를 위해 오늘을 쓰는 기업");
  }

  if (grossMargins != null) {
    if (grossMargins > 0.5) parts.push("원가 경쟁력이 매우 높아 이익 구조가 탄탄한 편");
    else if (grossMargins > 0.3) parts.push("평균적인 원가 경쟁력");
    else parts.push("원가 부담이 있어 비용 관리가 중요한 기업");
  }

  return parts.join(". ");
}

function translateGrowth(ctx: FinancialContext): string | null {
  const { revenueGrowth } = ctx;
  if (revenueGrowth == null) return null;

  if (revenueGrowth > 0.3) return "가파르게 성장 중 — 시장이 아직 성장 가능성을 믿는 단계";
  if (revenueGrowth > 0.1) return "꾸준히 성장하는 기업 — 지속 가능한 성장세";
  if (revenueGrowth > 0) return "성장이 더디지만 안정적인 흐름 유지 중";
  if (revenueGrowth > -0.1) return "성장이 잠시 멈춘 시점 — 새 방향을 찾는 전환기";
  return "매출이 줄어드는 시점 — 구조적 변화가 필요한 신호";
}

function translateFinancialHealth(ctx: FinancialContext): string | null {
  const { debtToEquity, currentRatio, freeCashflow } = ctx;
  const signals: string[] = [];

  if (debtToEquity != null) {
    if (debtToEquity < 30) signals.push("부채 부담이 거의 없는 탄탄한 재무 구조");
    else if (debtToEquity < 100) signals.push("부채를 적당히 활용하는 균형 잡힌 구조");
    else if (debtToEquity < 200) signals.push("부채 의존도가 높아 금리 변동에 민감한 구조");
    else signals.push("높은 레버리지 — 상승 시 폭발적이지만 하락 시 위험이 큰 구조");
  }

  if (currentRatio != null) {
    if (currentRatio > 2) signals.push("단기 지불 능력이 충분한 재무 여유");
    else if (currentRatio > 1) signals.push("단기 부채를 감당할 수 있는 수준");
    else signals.push("단기 유동성 관리가 필요한 시점");
  }

  if (freeCashflow != null) {
    if (freeCashflow > 0) signals.push("영업 활동에서 현금이 흘러들어오는 건강한 현금흐름");
    else signals.push("현금을 적극 투자 중 — 성장을 위해 현금을 쓰는 시기");
  }

  return signals.length > 0 ? signals.join(". ") : null;
}

function translateEfficiency(ctx: FinancialContext): string | null {
  const { returnOnEquity, returnOnAssets } = ctx;
  const signals: string[] = [];

  if (returnOnEquity != null) {
    if (returnOnEquity > 0.2) signals.push("주주 자본을 효율적으로 활용해 높은 수익을 내는 기업");
    else if (returnOnEquity > 0.1) signals.push("평균 이상의 자본 효율성");
    else if (returnOnEquity > 0) signals.push("자본 대비 수익이 낮은 편 — 효율 개선 여지");
    else signals.push("자본을 아직 수익으로 전환 못 하는 단계");
  }

  if (returnOnAssets != null) {
    if (returnOnAssets > 0.1) signals.push("보유 자산을 잘 활용하는 효율적인 기업");
    else if (returnOnAssets > 0.05) signals.push("보통 수준의 자산 활용 효율");
    else signals.push("자산 활용 효율이 낮아 개선이 필요한 구간");
  }

  return signals.length > 0 ? signals.join(". ") : null;
}

function buildFinancialPsychology(ctx: FinancialContext): string {
  const lines: string[] = [];

  const profitability = translateProfitability(ctx);
  if (profitability) lines.push(`수익 구조: ${profitability}`);

  const growth = translateGrowth(ctx);
  if (growth) lines.push(`성장 동력: ${growth}`);

  const health = translateFinancialHealth(ctx);
  if (health) lines.push(`재무 체력: ${health}`);

  const efficiency = translateEfficiency(ctx);
  if (efficiency) lines.push(`운영 효율: ${efficiency}`);

  return lines.map(l => `- ${l}`).join("\n");
}

/**
 * v2.2.0 프롬프트 빌더.
 * ctx가 없거나 모든 필드가 null이면 v2.1.0과 동일한 출력.
 */
export function buildInterpretationPromptV2_2(
  market: MarketSnapshot,
  cards: DrawnCard[],
  ctx?: FinancialContext
): string {
  const basePrompt = buildInterpretationPromptV2_1(market, cards);

  if (!ctx) return basePrompt;

  const financialLines = buildFinancialPsychology(ctx);
  if (!financialLines) return basePrompt;

  // v2.1.0 프롬프트의 "## 뽑힌 카드" 섹션 앞에 재무 컨텍스트를 삽입
  return basePrompt.replace(
    "## 뽑힌 카드",
    `## 이 기업의 재무적 심리 풍경\n${financialLines}\n\n## 뽑힌 카드`
  );
}

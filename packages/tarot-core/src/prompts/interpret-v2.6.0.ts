import type { DrawnCard, MarketSnapshot } from "../types.js";
import { buildInterpretationPromptV2_5 } from "./interpret-v2.5.0.js";
import type { FinancialContext } from "./interpret-v2.2.0.js";

// 프롬프트 버전: v2.6.0
// 핵심 변경: "3초 직관" 레이어 — 홈 첫인상에서 감정이 즉시 읽히도록 headline 강화 (#373)
// 측정 지표: FOMO Index 직관 이해도(3초 안에). 홈 화면에서 사용자가 처음 마주하는 텍스트는 headline이며,
//           스크롤 전 단 한 줄로 "지금 시장 감정"이 전달돼야 한다.
// 1. 감정 선행 — headline의 첫 어절이 곧 지배 감정. 설명절/도입절을 앞세우지 않는다.
// 2. 한 호흡 스캔 — 곁눈질로도 읽히도록 군더더기·수식 종속절을 덜어낸다.
// v2.5.0 대비: 몰입·리프레임(detail) / 패의 결·안티-클리셰(headline) / 슬롯 스토리텔링은 그대로 유지,
//             headline 규칙에 "첫인상 가독성" 한 결만 덧댄다.
export const PROMPT_VERSION_2_6 = "2.6.0";

// v2.4.0이 심은 안티-클리셰 headline 규칙(=v2.5에도 그대로 존재) 위에 "3초 직관" 한 줄을 덧댄다.
const HEADLINE_RULE_V2_4 = `   - headline: 15자 이내, 투자자가 "맞아!"를 외치는 공감형 문장
     - 안티-클리셰: "~의 에너지가 흐릅니다", "변화의 바람", "새로운 시작", "우주의 기운", "운명의 카드"처럼 카드 일반론으로 시작하는 문장은 무효. 반드시 '지금 이 종목을 든 사람의 구체적 감정·행동 충동'에서 출발한다.`;

const HEADLINE_RULE_V2_6 = `${HEADLINE_RULE_V2_4}
     - 3초 직관(첫인상 가독성): 홈 화면에서 사용자가 가장 먼저, 스크롤 전에 보는 한 줄이다. 곁눈질 3초 안에 '지금의 감정'이 잡혀야 한다. 문장의 첫 어절에 지배 감정·충동을 둔다("팔고 싶은…", "놓칠까 봐…", "버티는…"). 시간·조건을 먼저 까는 도입절("지금처럼 ~한 때에는", "오늘 같은 날") 금지. 수식 종속절을 덜어 한 호흡에 읽히게 한다.`;

/**
 * v2.6.0 프롬프트 빌더. 시그니처는 v2.5.0 호환.
 * - 모든 카드 수에 headline "3초 직관" 가독성 레이어 적용.
 * - 몰입·리프레임(v2.5)/패의 결·안티-클리셰(v2.4)/슬롯 스토리텔링(v2.3)은 그대로 유지.
 */
export function buildInterpretationPromptV2_6(
  market: MarketSnapshot,
  cards: DrawnCard[],
  ctx?: FinancialContext
): string {
  const base = buildInterpretationPromptV2_5(market, cards, ctx);
  return base.replace(HEADLINE_RULE_V2_4, HEADLINE_RULE_V2_6);
}

import type { DrawnCard, MarketSnapshot } from "../types.js";
import { buildInterpretationPromptV2_2, type FinancialContext } from "./interpret-v2.2.0.js";

// 프롬프트 버전: v2.3.0
// 핵심 변경: THREE_CARD 스프레드에서 과거/현재/미래 각 슬롯을
//            실제 종목 데이터(최근 흐름·감성·연간 위치)로 연결하는 서사 레이어 추가.
// v2.2.0 대비: single/three-card 공통 기반은 그대로 유지하고,
//              three-card 해석 원칙 6번을 데이터 기반 서사로 강화.
export const PROMPT_VERSION_2_3 = "2.3.0";

// 최근 흐름을 "과거 카드"가 반영할 심리적 배경으로 번역
function translatePastNarrative(market: MarketSnapshot): string {
  if (market.changePercent >= 5) {
    return "최근 급등이 만들어낸 탐욕과 흥분 — 과거 카드는 그 기세가 어디서 왔는지 물어봅니다";
  }
  if (market.changePercent >= 2) {
    return "꾸준히 오르는 기대감이 쌓여온 흐름 — 과거 카드는 그 믿음의 뿌리를 드러냅니다";
  }
  if (market.changePercent >= 0) {
    return "보합 속에서도 조용히 방향을 탐색해온 흐름 — 과거 카드는 그 침묵이 무엇을 의미했는지 보여줍니다";
  }
  if (market.changePercent >= -2) {
    return "슬그머니 내리는 불안이 쌓인 최근 — 과거 카드는 그 실망의 기원을 짚습니다";
  }
  if (market.changePercent >= -5) {
    return "두려움이 확산된 하락 구간 — 과거 카드는 그 공포가 시작된 지점을 되짚습니다";
  }
  return "급락이 남긴 상처와 혼란 — 과거 카드는 그 충격이 어떤 의미였는지 해석합니다";
}

// 52주 위치와 현재 심리 상태를 "현재 카드"의 맥락으로 번역
function translatePresentNarrative(market: MarketSnapshot): string {
  const pos = market.fiftyTwoWeekPosition;
  const sentiment = market.sentimentScore;

  const posDesc =
    pos === undefined         ? "방향을 가늠하는 자리"
    : pos >= 0.8              ? "1년 중 가장 높은 곳 근처에 선 자리"
    : pos >= 0.6              ? "1년 흐름에서 위쪽에 위치한 자리"
    : pos >= 0.4              ? "1년 흐름의 중간, 어디로도 갈 수 있는 자리"
    : pos >= 0.2              ? "1년 흐름 하단에 내려온 자리"
    :                           "1년 중 가장 낮은 곳 근처에 놓인 자리";

  const sentDesc =
    sentiment === undefined        ? ""
    : sentiment > 0.3              ? ", 뉴스 분위기는 긍정적"
    : sentiment < -0.3             ? ", 뉴스 분위기는 부정적"
    :                                ", 뉴스 분위기는 중립";

  return `${posDesc}${sentDesc} — 현재 카드는 지금 이 위치에서 당신이 느끼는 감정의 이름을 붙여줍니다`;
}

// 시장 국면과 모멘텀을 "미래 카드"가 제시할 방향성과 연결
function translateFutureNarrative(market: MarketSnapshot): string {
  const condition = market.condition;

  const conditionDesc: Record<string, string> = {
    bullish:       "상승 에너지가 살아있는 국면 — 미래 카드는 그 에너지를 어떻게 맞이할지 제안합니다",
    bearish:       "하락 압력이 지속되는 국면 — 미래 카드는 어떤 자세로 버텨낼지 이야기합니다",
    neutral:       "방향을 모르는 횡보 국면 — 미래 카드는 이 불확실성을 어떻게 품어야 하는지 보여줍니다",
    volatile:      "격렬하게 흔들리는 변동 국면 — 미래 카드는 그 진동 속에서 중심을 잡는 법을 전합니다",
    consolidating: "폭풍 전 고요한 수렴 국면 — 미래 카드는 다음 큰 움직임 앞에서 무엇을 준비할지 알려줍니다",
  };

  return conditionDesc[condition] ?? "앞으로 펼쳐질 흐름 — 미래 카드는 당신이 마주할 선택을 비춰줍니다";
}

function buildThreeCardStoryContext(market: MarketSnapshot): string {
  return [
    `[과거 카드 맥락] ${translatePastNarrative(market)}`,
    `[현재 카드 맥락] ${translatePresentNarrative(market)}`,
    `[미래 카드 맥락] ${translateFutureNarrative(market)}`,
  ].map(l => `- ${l}`).join("\n");
}

function isThreeCardSpread(cards: DrawnCard[]): boolean {
  return cards.length === 3 && cards.some((c) => c.slot !== undefined);
}

/**
 * v2.3.0 프롬프트 빌더.
 * THREE_CARD 스프레드일 때만 종목 데이터 기반 과거/현재/미래 서사 레이어를 추가.
 * single 카드거나 ctx 없으면 v2.2.0과 동일.
 */
export function buildInterpretationPromptV2_3(
  market: MarketSnapshot,
  cards: DrawnCard[],
  ctx?: FinancialContext
): string {
  const basePrompt = buildInterpretationPromptV2_2(market, cards, ctx);

  if (!isThreeCardSpread(cards)) return basePrompt;

  const storyContext = buildThreeCardStoryContext(market);

  // "## 해석 원칙" 앞에 THREE_CARD 스토리텔링 컨텍스트 삽입
  return basePrompt.replace(
    "## 해석 원칙",
    `## 이 종목의 과거·현재·미래 서사 맥락 (THREE_CARD 전용)
각 카드 해석 시 아래 맥락을 카드의 심리 언어와 연결하세요.
숫자·지표명을 그대로 언급하지 말고, 제시된 심리 언어 그대로 활용하세요.

${storyContext}

## 해석 원칙`
  );
}

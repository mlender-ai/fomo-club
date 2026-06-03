import type { DrawnCard, MarketSnapshot } from "../types.js";
import { buildInterpretationPromptV2_4 } from "./interpret-v2.4.0.js";
import type { FinancialContext } from "./interpret-v2.2.0.js";
import { computeSignal, type Signal } from "../signal/computeSignal.js";

// 프롬프트 버전: v2.5.0
// 핵심 변경: 결정론적 신호 엔진(computeSignal)을 백단 "척추"로 주입.
// - 흐름의 상태(정성 라벨) + 시간축 + 정량 드라이버(사실)를 프롬프트에 넣어 해석을 데이터에 접지.
// - 점수/등급 숫자 자체는 사용자에게 노출 금지(내부 척추). 미래 예측·매매 권유 금지.
// v2.4 대비: 안티-클리셰·패의 결은 유지하고, "왜 지금 이 패가 이 종목에 맞는지"를 구체 사실로 접지.
export const PROMPT_VERSION_2_5 = "2.5.0";

function stateLine(s: Signal): string {
  switch (s.state) {
    case "bullish":
      return s.score >= 80
        ? "지금 이 종목은 뚜렷한 상승 흐름의 한가운데에 있습니다"
        : "지금 이 종목은 상승 쪽으로 기운 흐름에 있습니다";
    case "bearish":
      return s.score <= 20
        ? "지금 이 종목은 뚜렷한 하락 흐름에 눌려 있습니다"
        : "지금 이 종목은 하락 쪽으로 기운 흐름에 있습니다";
    case "volatile":
      return "지금 이 종목은 변동성이 큰, 방향이 출렁이는 흐름에 있습니다";
    case "consolidating":
      return "지금 이 종목은 방향을 정하지 못하고 다지는 흐름에 있습니다";
    default:
      return "지금 이 종목은 어느 쪽으로도 확실히 기울지 않은 중립 흐름에 있습니다";
  }
}

function buildSignalSection(market: MarketSnapshot, ctx?: FinancialContext): string {
  const s = computeSignal(market, ctx);
  const top = s.drivers.slice(0, 3);
  if (top.length === 0) return "";

  const lines: string[] = [
    "## 흐름의 상태 (신호 척추 — 내부 근거)",
    "> 아래는 해석을 데이터에 접지하기 위한 내부 근거다. 점수·등급 숫자 자체는 사용자에게 출력하지 마라.",
    `- ${stateLine(s)}`,
  ];
  if (s.trajectory.length > 0) {
    lines.push("### 시간축");
    for (const t of s.trajectory) lines.push(`- ${t}`);
  }
  lines.push("### 이 흐름을 만든 근거 (사실 — 매매 신호 아님)");
  for (const d of top) lines.push(`- ${d.detail}`);
  lines.push("");
  return lines.join("\n") + "\n";
}

const GROUNDING_RULE = `
## 접지 규칙 (v2.5 — 가장 중요)
- headline·summary·detail 은 위 "이 흐름을 만든 근거(드라이버)" 중 **1-2개의 구체적 사실**(예: 200일선 회복, 매출성장, RSI 위치)에 반드시 접지한다. 추상적 일반론("에너지가 흐른다")만으로 끝내지 말고, 카드의 상징을 그 구체 사실과 엮어 "왜 지금 이 패가 이 종목에 들어맞는지"를 또렷하게 말한다.
- 단, **금지**: (1) 미래 가격·수익률 예측("오를 것", "% 상승"), (2) 매수·매도·보유 권유나 타이밍 제시, (3) 점수·등급 숫자 자체를 출력, (4) 드라이버의 판정어("상승 구간", "과열권" 등)를 그대로 옮기지 말고 카드 상징의 언어로 바꿔 말한다, (5) 현재 시점을 매매·진입의 '적기'로 규정하는 어떤 비유도 금지. 위 근거는 "지금까지·현재의 사실"을 묘사하는 재료일 뿐이다.
- 결과: 막연한 위로가 아니라 데이터에 발 붙인 날카로운 해석. 그러나 끝까지 '해석'이지 '조언'이 아니다.
`;

/**
 * v2.5.0 프롬프트 빌더. 시그니처는 v2.4 호환.
 * - 신호 척추 섹션을 "## 뽑힌 카드" 앞에 삽입하고, 접지 규칙을 말미에 덧붙인다.
 * - 드라이버가 하나도 없으면(지표 부재) v2.4와 동일하게 동작 + 접지 규칙만 추가.
 */
export function buildInterpretationPromptV2_5(
  market: MarketSnapshot,
  cards: DrawnCard[],
  ctx?: FinancialContext,
): string {
  const base = buildInterpretationPromptV2_4(market, cards, ctx);
  const signalSection = buildSignalSection(market, ctx);
  const enhanced = signalSection ? base.replace("## 뽑힌 카드", `${signalSection}## 뽑힌 카드`) : base;
  return enhanced + GROUNDING_RULE;
}

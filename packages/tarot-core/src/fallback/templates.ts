import type { TarotCardId, TarotCardOrientation } from "../types.js";

// AI 호출 실패 시 사용하는 프리빌트 해석 텍스트
// 사용자에게 폴백 여부를 노출하지 않는다

export interface FallbackTemplate {
  headline: string;
  summary: string;
  detail: string;
}

type FallbackKey = `${TarotCardId}:${TarotCardOrientation}`;

/** 종목 컨텍스트. 제공 시 폴백 텍스트에 종목/섹터 정보를 녹인다. */
export interface FallbackContext {
  ticker?: string;
  sector?: string;
  /** "bullish" | "bearish" | "neutral" | "volatile" | "consolidating" */
  condition?: string;
}

function conditionHint(condition?: string): string {
  switch (condition) {
    case "bullish": return "최근 상승 흐름을 타고 있는 이 종목";
    case "bearish": return "하락 압력을 받고 있는 이 종목";
    case "volatile": return "변동성이 높은 이 종목";
    case "consolidating": return "수렴/횡보 중인 이 종목";
    default: return "현재 흐름의 이 종목";
  }
}

const FALLBACK_TEMPLATES: Partial<Record<FallbackKey, (ctx?: FallbackContext) => FallbackTemplate>> = {
  "the-fool:upright": (ctx) => ({
    headline: "새로운 여정의 기운",
    summary: `바보 카드가 정방향으로 나타났습니다. ${conditionHint(ctx?.condition)}에는 예측하기 어려운 새로운 에너지가 흐르고 있습니다. 익숙한 경로를 벗어난 움직임이 감지됩니다.`,
    detail: `바보는 출발점을 상징합니다. 지금 이 순간은 과거의 패턴이 끝나고 새로운 국면이 열리는 시점일 수 있습니다.${ctx?.sector ? ` ${ctx.sector} 섹터 특유의 주기적 전환 에너지가 이 카드와 공명합니다.` : ""} 무한한 가능성이 앞에 펼쳐져 있지만, 동시에 알 수 없는 위험도 존재합니다. 타로는 서두름보다 열린 눈으로 상황을 바라볼 것을 권합니다. 이 해석은 투자 조언이 아닙니다.`,
  }),
  "the-fool:reversed": (ctx) => ({
    headline: "준비 없는 도약의 경고",
    summary: `역방향 바보는 충동적 행동에 대한 경고를 담고 있습니다. ${conditionHint(ctx?.condition)}에 정보가 불충분하거나 타이밍이 무르익지 않았을 수 있습니다.`,
    detail: `역방향 바보 카드는 무모함과 준비 부족을 상징합니다.${ctx?.ticker ? ` ${ctx.ticker}을(를) 둘러싼 에너지에서` : " 지금 이 에너지 속에서는"} 경솔한 행동보다 한 걸음 물러서 상황을 재점검하는 것이 현명할 수 있습니다. 타로는 관찰과 성찰의 시간을 권합니다. 이 해석은 투자 조언이 아닙니다.`,
  }),
  "the-tower:upright": (ctx) => ({
    headline: "구조가 흔들리는 에너지",
    summary: `탑 카드가 나타났습니다. ${conditionHint(ctx?.condition)}에 급격한 변화와 기존 구조의 재편을 상징하는 강렬한 에너지가 흐릅니다.`,
    detail: `탑 카드는 번개가 탑을 치는 순간을 담고 있습니다. 오랫동안 쌓아온 것들이 흔들리거나 재편될 수 있는 시점입니다.${ctx?.sector ? ` ${ctx.sector} 분야에서는 이런 전환이 새로운 구조를 만들어내는 계기가 되기도 합니다.` : ""} 충격 이후에 오는 정화와 재건의 가능성도 함께 담겨 있습니다. 이 해석은 투자 조언이 아닙니다.`,
  }),
  "the-star:upright": (ctx) => ({
    headline: "어둠 뒤 빛나는 신호",
    summary: `별 카드는 회복과 희망의 에너지를 전합니다. ${conditionHint(ctx?.condition)}에 어두운 국면 이후 새로운 방향성이 보이기 시작하는 시점입니다.`,
    detail: `별 카드는 폭풍우가 지나간 밤하늘에 빛나는 별을 상징합니다. 혼란스러웠던 흐름이 정리되고 장기적인 관점에서의 가능성이 열리는 에너지입니다.${ctx?.ticker ? ` ${ctx.ticker}의 최근 거래량 변화가 이 에너지의 단서가 될 수 있습니다.` : ""} 서두르지 않고 흐름을 따라가는 지혜가 필요한 시점입니다. 이 해석은 투자 조언이 아닙니다.`,
  }),
  "the-moon:upright": (ctx) => ({
    headline: "안개 속 보이지 않는 것들",
    summary: `달 카드는 불확실성과 숨겨진 정보를 경고합니다. ${conditionHint(ctx?.condition)}의 표면 아래에 드러나지 않은 요소들이 있을 수 있습니다.`,
    detail: `달빛 아래에서는 모든 것이 선명하지 않습니다.${ctx?.sector ? ` ${ctx.sector} 섹터에서 공개되지 않은 변수들이 흐름에 영향을 줄 수 있습니다.` : ""} 지금 이 흐름 속에는 아직 드러나지 않은 정보나 감정적 판단이 개입될 여지가 있습니다. 타로는 성급한 결론보다 더 많은 정보가 나타날 때까지 관망하는 지혜를 권합니다. 이 해석은 투자 조언이 아닙니다.`,
  }),
};

export function getFallbackInterpretation(
  cardId: TarotCardId,
  orientation: TarotCardOrientation,
  ctx?: FallbackContext
): FallbackTemplate {
  const key: FallbackKey = `${cardId}:${orientation}`;
  const factory = FALLBACK_TEMPLATES[key];

  if (factory) return factory(ctx);

  // 카드별 템플릿이 없을 때 범용 폴백 — 종목 맥락을 가능한 반영
  const tickerClause = ctx?.ticker ? ` ${ctx.ticker}을(를) 둘러싼 에너지는 아직 말을 아끼고 있습니다.` : "";
  return {
    headline: "흐름이 말을 건네는 순간",
    summary: `타로 카드가 현재의 에너지를 담아 메시지를 전합니다.${tickerClause} 이 순간의 흐름을 차분히 바라볼 것을 권합니다.`,
    detail: `카드가 전하는 메시지는 항상 지금 이 순간에 가장 필요한 통찰을 담고 있습니다.${ctx?.sector ? ` ${ctx.sector} 섹터의 특성과 함께 이 에너지를 읽어보세요.` : ""} 숫자와 차트 너머에 존재하는 흐름을 느껴보세요. 타로는 결정을 대신하지 않으며, 스스로의 직관을 깨우는 거울입니다. 이 해석은 투자 조언이 아닙니다.`,
  };
}

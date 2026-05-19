import type { DrawnCard, MarketSnapshot } from "../types.js";

// 프롬프트 버전: v2.0.0
// 핵심 철학: "투자자의 심리를 거울처럼 비춰준다"
// v1과의 차이: 시장 데이터 → 감정 번역이 중심. 바이럴 가능한 한 줄, 공유하고 싶은 문장.
export const PROMPT_VERSION_2_0 = "2.0.0";

function formatMarketMood(market: MarketSnapshot): string {
  const lines: string[] = [];

  // 심리 상태로 번역
  const changeAbs = Math.abs(market.changePercent);
  if (market.changePercent > 3) lines.push("- 오늘 분위기: 탐욕이 시장을 지배하는 날");
  else if (market.changePercent > 0) lines.push("- 오늘 분위기: 조심스러운 기대감이 감도는 날");
  else if (market.changePercent > -3) lines.push("- 오늘 분위기: 불안이 슬그머니 고개를 드는 날");
  else lines.push("- 오늘 분위기: 공포가 시장을 덮친 날");

  lines.push(`- 가격 변화: ${market.changePercent > 0 ? "+" : ""}${market.changePercent.toFixed(2)}%`);

  if (market.rsi !== undefined) {
    if (market.rsi > 70) lines.push("- 투자자 심리: 과열 — 모두가 올라갈 거라 믿는 순간");
    else if (market.rsi < 30) lines.push("- 투자자 심리: 과매도 — 모두가 버리고 싶어하는 순간");
    else lines.push("- 투자자 심리: 중립 — 확신이 없어 눈치를 보는 순간");
  }

  if (market.macd !== undefined && market.macdSignal !== undefined) {
    if (market.macd > market.macdSignal) lines.push("- 모멘텀: 상승 흐름이 싹트고 있음");
    else lines.push("- 모멘텀: 하락 흐름이 굳어지고 있음");
  }

  if (market.sentimentScore !== undefined) {
    if (market.sentimentScore > 0.3) lines.push("- 뉴스 온도: 뜨겁다 — 좋은 소식이 넘친다");
    else if (market.sentimentScore < -0.3) lines.push("- 뉴스 온도: 차갑다 — 나쁜 소식이 지배한다");
    else lines.push("- 뉴스 온도: 미지근하다 — 결정적 뉴스가 없다");
  }

  return lines.join("\n");
}

function conditionToEmotion(condition: string): string {
  const map: Record<string, string> = {
    bullish: "기대와 흥분이 뒤섞인 상승장",
    bearish: "불안과 두려움이 지배하는 하락장",
    neutral: "결정을 못 하고 서성이는 횡보장",
    volatile: "롤러코스터처럼 심장을 조이는 변동장",
    consolidating: "폭풍 전의 고요함, 숨죽이는 수렴장",
  };
  return map[condition] ?? condition;
}

export function buildInterpretationPromptV2_0(
  market: MarketSnapshot,
  cards: DrawnCard[]
): string {
  const cardDescriptions = cards
    .map((dc, i) => {
      const slotLabel = dc.slot
        ? `[${dc.slot === "past" ? "과거 — 이 종목과의 인연" : dc.slot === "present" ? "현재 — 지금 내 마음의 상태" : "미래 — 앞으로 마주할 것"}]`
        : `[카드 ${i + 1}]`;
      const orientation = dc.orientation === "upright" ? "정방향" : "역방향";
      return `${slotLabel} ${dc.card.nameKo}(${dc.card.name}) — ${orientation}
  투자자에게 전하는 메시지: ${dc.orientation === "upright" ? dc.card.meaningUpright : dc.card.meaningReversed}
  감정 키워드: ${dc.card.keywordsKo.join(", ")}
  톤: ${dc.card.toneGuide}`;
    })
    .join("\n\n");

  return `## 당신의 역할
당신은 투자자의 불안한 마음을 타로로 읽어주는 심리 해석자입니다.
주식 앱 알림처럼 숫자로 말하지 않습니다.
"지금 이 종목을 들고 있는 당신의 마음"을 카드를 통해 비춰줍니다.

이 서비스의 존재 이유: 투자자는 이미 유튜브, 리포트, HTS로 정보가 넘칩니다.
그들에게 부족한 것은 정보가 아니라 **"지금 내 감정이 맞는가"** 하는 확인입니다.
타로는 그 거울입니다.

## 오늘 ${market.ticker} 의 분위기
${conditionToEmotion(market.condition)}

${formatMarketMood(market)}

## 뽑힌 카드
${cardDescriptions}

## 해석 원칙
1. **감정을 먼저, 지표는 뒤에**: 투자자가 지금 느끼는 감정(두려움/탐욕/후회/희망)을 먼저 읽어라.
   시장 데이터는 그 감정을 뒷받침하는 맥락이지, 해석의 중심이 아니다.

2. **SNS에서 캡처하고 싶은 한 줄**: headline은 친구에게 보내고 싶어지는 문장이어야 한다.
   나쁜 예: "심판의 에너지가 흐릅니다" (추상적, 연결 없음)
   좋은 예: "팔고 싶은 충동이 드는 지금, 카드는 손을 놓지 말라 합니다"
   좋은 예: "모두가 도망칠 때 혼자 남은 당신, 그게 용기인지 확인할 때"
   좋은 예: "올랐을 때 못 샀던 그 후회, 지금 다시 같은 기로에 서있습니다"

3. **투자자의 내면과 카드를 연결**: 카드의 신화적 상징이 아니라 투자 심리와 연결하라.
   탑(The Tower) 역방향 = "당신이 두려워하는 폭락은 오지 않을 수도 있습니다. 하지만 안심은 이릅니다."
   별(The Star) = "손실 후에도 다시 시장에 돌아오는 당신, 그 끈기가 별처럼 빛납니다."
   심판(Judgement) = "지금이 그 종목을 다시 평가할 시간입니다. 과거의 판단을 반복하지 마세요."
   은둔자(The Hermit) = "아무도 모르게 홀로 들고 있는 당신. 그 인내가 맞는지 지금 돌아볼 때."

4. **절대 금지 표현**: "매수", "매도", "사세요", "파세요", "오릅니다", "내립니다", "추천"

5. **언어 품질**:
   - headline: 15자 이내, 투자자가 "맞아!"를 외치는 공감형 문장
   - summary: 2-3문장. 첫 문장은 지금 이 종목을 들고 있는 심리를 정확히 짚는다.
   - detail: 300-500자. 카드별로 감정 여정을 서사로 엮는다. 마지막 문장은 행동이 아닌 "자세"를 제안한다.

6. **3장 스프레드**: 과거의 집착 → 현재의 혼란 → 미래의 선택으로 감정 여정을 서술한다.

## 응답 형식 (JSON만, 마크다운 코드블록 없이)
{
  "headline": "15자 이내 공감형 한 줄",
  "summary": "투자자 감정을 짚는 2-3문장",
  "detail": "카드별 감정 서사 + 마지막은 자세 제안 (300-500자)"
}`;
}

import type { DrawnCard, MarketSnapshot } from "../types.js";

// 프롬프트 버전: v2.1.0
// 핵심 변경: 모든 기술적 지표를 감정/에너지 언어로 백엔드에서 완전 번역 후 전달
// 숫자·가격·지표명 일절 프롬프트 미노출 → 투자 조언 오해 차단
// v2.0.0 대비: SMA/BB/지지저항/히스토그램 활용, 단 심리 신호로만 전달
export const PROMPT_VERSION_2_1 = "2.1.0";

// ─────────────────────────────────────────────
// 지표 → 심리 신호 번역 레이어 (숫자 외부 노출 금지)
// ─────────────────────────────────────────────

function translateMomentum(market: MarketSnapshot): string {
  const signals: string[] = [];

  // 단기 등락 심리
  if (market.changePercent > 3) signals.push("탐욕이 시장을 지배하는 날 — 모두가 올라갈 거라 믿는 순간");
  else if (market.changePercent > 1) signals.push("기대감이 조심스럽게 번지는 날");
  else if (market.changePercent > 0) signals.push("조용히 방향을 가늠하는 날");
  else if (market.changePercent > -1) signals.push("불안이 슬그머니 고개를 드는 날");
  else if (market.changePercent > -3) signals.push("실망이 조금씩 퍼지는 날");
  else signals.push("공포가 시장을 덮친 날 — 모두가 도망치고 싶은 순간");

  return signals.join("");
}

function translateRsi(market: MarketSnapshot): string | null {
  if (market.rsi === undefined) return null;
  if (market.rsi >= 75) return "과열 — 더 오를 거라는 확신이 위험 수위에 달한 상태";
  if (market.rsi >= 60) return "상승 기대 — 아직 여유가 있지만 경계심이 슬며시 생기는 구간";
  if (market.rsi >= 45) return "눈치 보기 — 어느 쪽도 확신이 없어 관망하는 심리";
  if (market.rsi >= 35) return "불안 — 팔고 싶지만 더 내릴까 봐 망설이는 심리";
  return "극단적 비관 — 모두가 포기하고 싶어하는 순간";
}

function translateMacd(market: MarketSnapshot): string | null {
  if (market.macd === undefined || market.macdSignal === undefined) return null;
  const histogram = market.macdHistogram ?? (market.macd - market.macdSignal);
  const cross = market.macd > market.macdSignal;

  if (cross && histogram > 0 && Math.abs(histogram) > Math.abs(market.macd) * 0.1) {
    return "상승 에너지가 막 꽃피기 시작한 국면 — 흐름이 방향을 바꾸는 변곡점";
  }
  if (cross) return "하락에서 상승으로 에너지가 전환되는 초입";
  if (!cross && histogram < 0 && Math.abs(histogram) > Math.abs(market.macd) * 0.1) {
    return "하락 에너지가 굳어지는 국면 — 반등을 기다리던 희망이 꺾이는 시점";
  }
  return "상승에서 하락으로 에너지가 기울기 시작한 초입";
}

function translateTrendPosition(market: MarketSnapshot): string | null {
  const { price, sma20, sma50, sma200 } = market;
  if (!sma20 && !sma50 && !sma200) return null;

  const signals: string[] = [];

  // 장기 추세 심리
  if (sma200 !== undefined) {
    if (price > sma200 * 1.05) signals.push("긴 시간 동안 믿어온 사람들이 아직 이기고 있는 흐름");
    else if (price > sma200) signals.push("장기 흐름은 살아있지만 여유가 많지 않은 상황");
    else if (price > sma200 * 0.95) signals.push("장기 믿음이 흔들리기 시작한 경계선 근처");
    else signals.push("오래 기다려온 사람들도 손실 구간에 들어선 상황");
  }

  // 단기 추세 vs 장기 추세 (배열)
  if (sma20 !== undefined && sma200 !== undefined) {
    if (sma20 > sma200) signals.push("단기와 장기 흐름이 같은 방향 — 추세가 정렬된 상태");
    else signals.push("단기 흐름이 장기 방향을 거스르는 중 — 흐름이 엇갈린 상태");
  }

  // 단기 추세 위치
  if (sma20 !== undefined) {
    if (price > sma20 * 1.03) signals.push("단기 기대치를 웃도는 강한 에너지");
    else if (price > sma20) signals.push("단기 흐름을 소화하며 올라서는 중");
    else if (price > sma20 * 0.97) signals.push("단기 기대치 아래로 내려온 부담스러운 위치");
    else signals.push("단기 흐름에서 멀리 이탈한 — 복귀에 에너지가 필요한 상태");
  }

  return signals.join(". ");
}

function translateBollingerPosition(market: MarketSnapshot): string | null {
  const { price, bbUpper, bbLower, bbMiddle } = market;
  if (!bbUpper || !bbLower || !bbMiddle) return null;

  const bandWidth = bbUpper - bbLower;
  const posRatio = (price - bbLower) / bandWidth; // 0~1

  if (price > bbUpper) return "군중의 기대를 넘어선 과열 구간 — 뜨거운 관심이 위험한 수준";
  if (price < bbLower) return "군중의 비관을 넘어선 극도의 위축 — 가장 어두운 지점 근처";
  if (posRatio > 0.75) return "군중의 평균 기대를 웃도는 자리 — 낙관이 지배하는 구간";
  if (posRatio > 0.5) return "중심선 위 — 아직 기대감이 살아있는 위치";
  if (posRatio > 0.25) return "중심선 아래 — 평균적인 기대에 못 미치는 자리";
  return "군중의 평균 기대 아래 — 비관이 지배하는 구간, 하지만 바닥 근처";
}

function translateSupportResistance(market: MarketSnapshot): string | null {
  const { price, support20, resistance20 } = market;
  if (support20 === undefined || resistance20 === undefined) return null;

  const range = resistance20 - support20;
  if (range <= 0) return null;
  const posRatio = (price - support20) / range; // 0~1

  if (posRatio > 0.85) return "최근 가장 많이 막혔던 자리 가까이 — 여기서 다시 저항을 받는지가 관건";
  if (posRatio > 0.6) return "최근 범위의 상단 — 돌파 시도와 포기가 반복되는 자리";
  if (posRatio > 0.4) return "최근 범위의 중간 — 방향을 정하지 못한 무게중심";
  if (posRatio > 0.15) return "최근 범위의 하단 — 여기서 버텨온 사람들이 지키려는 자리";
  return "최근 가장 많이 지지받았던 자리 근처 — 여기서 다시 올라서는지가 관건";
}

function translateSentiment(market: MarketSnapshot): string | null {
  if (market.sentimentScore === undefined) return null;
  if (market.sentimentScore > 0.5) return "뉴스가 극도로 낙관적 — 좋은 소식이 넘쳐흐르는 시점";
  if (market.sentimentScore > 0.3) return "뉴스 온도가 따뜻함 — 긍정적 이야기가 더 많이 들리는 시점";
  if (market.sentimentScore < -0.5) return "뉴스가 극도로 비관적 — 나쁜 소식이 쏟아지는 시점";
  if (market.sentimentScore < -0.3) return "뉴스 온도가 차가움 — 부정적 이야기가 지배하는 시점";
  return "뉴스 온도가 미지근함 — 결정적인 소식이 없는 시점";
}

// 시가총액 → 군중 인식 심리 (숫자 노출 금지)
function translateMarketCap(market: MarketSnapshot): string | null {
  if (market.marketCap === undefined) return null;
  const cap = market.marketCap;
  // KRW 표시는 amount가 100배~1000배 큰데, 일단 USD/KRW 통일 임계값으로 운영. 추후 currency-aware로 확장.
  if (cap >= 100_000_000_000) return "대중이 안다고 믿는 거대한 이름 — 모두가 한 번쯤 들어본 종목";
  if (cap >= 10_000_000_000) return "많은 사람이 알고 있는 익숙한 이름 — 시장의 단골 주제";
  if (cap >= 1_000_000_000) return "관심 있는 사람들 사이에서 회자되는 중간 규모의 이름";
  return "소수만 아는 종목 — 군중의 눈 밖에 있어 외로운 자리";
}

// 52주 위치 → 1년 군중 기억 심리 (비율·퍼센트 노출 금지)
function translateRangePosition(market: MarketSnapshot): string | null {
  if (market.fiftyTwoWeekPosition === undefined) return null;
  const pos = market.fiftyTwoWeekPosition;
  if (pos >= 0.85) return "1년 동안 가장 사랑받았던 자리 근처 — 모두의 시선이 모인 정점";
  if (pos >= 0.6) return "지난 1년 흐름에서 상위권에 자리잡은 — 기대가 누적된 위치";
  if (pos >= 0.4) return "1년 범위 중간 — 어디로든 갈 수 있는 무게중심";
  if (pos > 0.15) return "지난 1년 흐름에서 하위권 — 외면받기 시작한 위치";
  return "1년 동안 가장 외면받았던 자리 근처 — 군중이 잊고 있는 바닥 부근";
}

// 종목 정체성 (이름·섹터·산업) — 카드 해석에 컨텍스트 제공. 절대 숫자 미노출.
function translateIdentity(market: MarketSnapshot): string | null {
  const parts: string[] = [];
  if (market.name) parts.push(market.name);
  if (market.sector) parts.push(`${market.sector} 섹터`);
  if (market.industry && market.industry !== market.sector) parts.push(market.industry);
  if (parts.length === 0) return null;
  return parts.join(" · ");
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

function buildPsychologyContext(market: MarketSnapshot): string {
  const lines: string[] = [];

  // 종목 정체성 — 첫 줄에 등장하여 카드 해석에 컨텍스트 제공
  const identitySignal = translateIdentity(market);
  if (identitySignal) lines.push(`이 종목의 정체: ${identitySignal}`);

  const capSignal = translateMarketCap(market);
  if (capSignal) lines.push(`군중 인지도: ${capSignal}`);

  lines.push(`오늘의 에너지: ${translateMomentum(market)}`);

  const rsiSignal = translateRsi(market);
  if (rsiSignal) lines.push(`투자자 군중 심리: ${rsiSignal}`);

  const macdSignal = translateMacd(market);
  if (macdSignal) lines.push(`모멘텀 흐름: ${macdSignal}`);

  const rangePosSignal = translateRangePosition(market);
  if (rangePosSignal) lines.push(`1년 군중 기억: ${rangePosSignal}`);

  const trendSignal = translateTrendPosition(market);
  if (trendSignal) lines.push(`추세 맥락: ${trendSignal}`);

  const bbSignal = translateBollingerPosition(market);
  if (bbSignal) lines.push(`군중 기대 대비 위치: ${bbSignal}`);

  const srSignal = translateSupportResistance(market);
  if (srSignal) lines.push(`최근 심리적 경계: ${srSignal}`);

  const sentimentSignal = translateSentiment(market);
  if (sentimentSignal) lines.push(`뉴스 분위기: ${sentimentSignal}`);

  return lines.map(l => `- ${l}`).join("\n");
}

// ─────────────────────────────────────────────
// 메인 프롬프트 빌더
// ─────────────────────────────────────────────

export function buildInterpretationPromptV2_1(
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

## 오늘 ${market.ticker}의 심리적 풍경
${conditionToEmotion(market.condition)}

${buildPsychologyContext(market)}

## 뽑힌 카드
${cardDescriptions}

## 해석 원칙

1. **감정을 먼저, 심리 신호는 맥락으로**: 위 "심리적 풍경"은 투자자가 지금 느끼는 감정의 맥락입니다.
   숫자나 지표를 그대로 언급하지 마세요. 오직 감정과 심리의 언어로만 해석하세요.

2. **SNS에서 캡처하고 싶은 한 줄**: headline은 친구에게 보내고 싶어지는 문장이어야 합니다.
   나쁜 예: "심판의 에너지가 흐릅니다" (추상적, 연결 없음)
   좋은 예: "팔고 싶은 충동이 드는 지금, 카드는 손을 놓지 말라 합니다"
   좋은 예: "모두가 도망칠 때 혼자 남은 당신, 그게 용기인지 확인할 때"
   좋은 예: "올랐을 때 못 샀던 그 후회, 지금 다시 같은 기로에 서있습니다"

3. **투자자의 내면과 카드를 연결**: 카드의 신화적 상징이 아니라 투자 심리와 연결하세요.
   탑(The Tower) 역방향 = "당신이 두려워하는 폭락은 오지 않을 수도 있습니다. 하지만 안심은 이릅니다."
   별(The Star) = "손실 후에도 다시 시장에 돌아오는 당신, 그 끈기가 별처럼 빛납니다."
   심판(Judgement) = "지금이 그 종목을 다시 평가할 시간입니다. 과거의 판단을 반복하지 마세요."
   은둔자(The Hermit) = "아무도 모르게 홀로 들고 있는 당신. 그 인내가 맞는지 지금 돌아볼 때."

4. **절대 금지 표현 (위반 시 응답 무효)**:
   - 직접 조언: "매수", "매도", "사세요", "파세요", "추천"
   - 가격/숫자: 구체적 수치, 퍼센트, 가격대 언급
   - 확정 예측: "오릅니다", "내립니다", "반드시 ~할 것"
   - 지표 명칭: "RSI", "MACD", "볼린저밴드", "이동평균" 등 기술적 용어

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

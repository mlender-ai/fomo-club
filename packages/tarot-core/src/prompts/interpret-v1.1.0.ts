import type { DrawnCard, MarketSnapshot } from "../types.js";

// 프롬프트 버전: v1.1.0
export const PROMPT_VERSION_1_1 = "1.1.0";

// 시간적 맥락: 1개월/3개월 가격 변화 및 거래량 추세 (#323)
// 옵셔널 — 없으면 카드 심리 서사 중심으로 폴백
export interface TemporalMarketContext {
  priceChange1M?: number | null;   // 1개월 등락률 (%)
  priceChange3M?: number | null;   // 3개월 등락률 (%)
  volatility?: number | null;      // 변동성 지수 (예: 연율화 표준편차)
  volumeTrend?: string | null;     // 거래량 추세 기술 ("increasing" | "decreasing" | "stable")
}

function formatIndicators(market: MarketSnapshot): string {
  const lines: string[] = [];

  // 기본 시세
  lines.push(`- 현재가: ${market.price.toLocaleString()} (${market.changePercent > 0 ? "+" : ""}${market.changePercent.toFixed(2)}%)`);
  lines.push(`- 거래량: ${market.volume.toLocaleString()}`);

  // RSI
  if (market.rsi !== undefined) {
    const zone = market.rsi > 70 ? "과매수 구간" : market.rsi < 30 ? "과매도 구간" : "중립 구간";
    lines.push(`- RSI(14): ${market.rsi.toFixed(1)} → ${zone}`);
  }

  // MACD
  if (market.macd !== undefined && market.macdSignal !== undefined) {
    const cross = market.macd > market.macdSignal ? "골든크로스 (상승 신호)" : "데드크로스 (하락 신호)";
    lines.push(`- MACD: ${market.macd.toFixed(2)} / 시그널: ${market.macdSignal.toFixed(2)} → ${cross}`);
    if (market.macdHistogram !== undefined) {
      lines.push(`  히스토그램: ${market.macdHistogram > 0 ? "+" : ""}${market.macdHistogram.toFixed(2)}`);
    }
  }

  // 이동평균선
  const smaLines: string[] = [];
  if (market.sma20 !== undefined) smaLines.push(`20일: ${market.sma20.toFixed(0)}`);
  if (market.sma50 !== undefined) smaLines.push(`50일: ${market.sma50.toFixed(0)}`);
  if (market.sma200 !== undefined) smaLines.push(`200일: ${market.sma200.toFixed(0)}`);
  if (smaLines.length > 0) {
    lines.push(`- 이동평균선: ${smaLines.join(" / ")}`);
    if (market.sma20 !== undefined && market.sma200 !== undefined) {
      lines.push(`  ${market.sma20 > market.sma200 ? "장기 상승 배열" : "장기 하락 배열"}`);
    }
  }

  // 볼린저 밴드
  if (market.bbUpper !== undefined && market.bbLower !== undefined && market.bbMiddle !== undefined) {
    const pos = market.price > market.bbUpper ? "상단 돌파 (과열)"
      : market.price < market.bbLower ? "하단 이탈 (위축)"
      : "밴드 내 안정";
    lines.push(`- 볼린저밴드: 상단 ${market.bbUpper.toFixed(0)} / 중심 ${market.bbMiddle.toFixed(0)} / 하단 ${market.bbLower.toFixed(0)} → ${pos}`);
  }

  // 지지/저항선
  if (market.support20 !== undefined && market.resistance20 !== undefined) {
    lines.push(`- 20일 지지선: ${market.support20.toFixed(0)} / 저항선: ${market.resistance20.toFixed(0)}`);
  }

  // 뉴스 감성
  if (market.sentimentScore !== undefined) {
    const mood = market.sentimentScore > 0.3 ? "긍정적" : market.sentimentScore < -0.3 ? "부정적" : "중립";
    lines.push(`- 뉴스 감성: ${market.sentimentScore.toFixed(2)} (${mood})`);
  }

  return lines.join("\n");
}

function conditionToKo(condition: string): string {
  const map: Record<string, string> = {
    bullish: "상승 추세",
    bearish: "하락 추세",
    neutral: "횡보/중립",
    volatile: "높은 변동성",
    consolidating: "수렴/정리 구간",
  };
  return map[condition] ?? condition;
}

// 섹터별 해석 키워드 (#322): 카드 상징을 섹터 특성과 연결하는 서사 힌트
const SECTOR_NARRATIVE_HINTS: Record<string, string> = {
  Technology:          "혁신의 사이클, 고성장과 고변동의 긴장",
  Healthcare:          "회복과 치유의 흐름, 장기적 안정과 위기의 교차",
  "Financial Services": "신뢰와 균형의 추, 리스크와 보상의 저울",
  Energy:              "순환하는 자원의 힘, 상승과 하락을 반복하는 파동",
  "Consumer Cyclical":  "계절의 흐름, 소비 심리와 경기 리듬",
  "Consumer Defensive": "방어와 안정의 요새, 폭풍 속 닻의 역할",
  Industrials:         "견고한 구조와 생산의 바퀴, 경제 엔진의 맥박",
  "Communication Services": "연결과 정보의 파도, 이야기가 흘러가는 강",
  "Real Estate":       "대지의 안정과 장기 축적, 시간이 만드는 가치",
  Utilities:           "일상의 기반, 느리지만 흔들리지 않는 흐름",
  "Basic Materials":   "근원 자원의 힘, 변환과 생산의 원천",
};

function formatTemporalContext(ctx: TemporalMarketContext): string {
  const lines: string[] = [];
  if (ctx.priceChange1M != null) {
    const sign = ctx.priceChange1M >= 0 ? "+" : "";
    lines.push(`- 최근 1개월 가격 변화: ${sign}${ctx.priceChange1M.toFixed(2)}%`);
  }
  if (ctx.priceChange3M != null) {
    const sign = ctx.priceChange3M >= 0 ? "+" : "";
    lines.push(`- 최근 3개월 가격 변화: ${sign}${ctx.priceChange3M.toFixed(2)}%`);
  }
  if (ctx.volatility != null) {
    const level = ctx.volatility > 40 ? "고변동" : ctx.volatility > 20 ? "중간 변동" : "저변동";
    lines.push(`- 변동성: ${ctx.volatility.toFixed(1)} (${level})`);
  }
  if (ctx.volumeTrend != null) {
    const map: Record<string, string> = {
      increasing: "거래량 증가 추세",
      decreasing: "거래량 감소 추세",
      stable: "거래량 안정",
    };
    lines.push(`- 거래량 추세: ${map[ctx.volumeTrend] ?? ctx.volumeTrend}`);
  }
  return lines.join("\n");
}

export function buildInterpretationPromptV1_1(
  market: MarketSnapshot,
  cards: DrawnCard[],
  temporalCtx?: TemporalMarketContext
): string {
  const cardDescriptions = cards
    .map((dc, i) => {
      const slotLabel = dc.slot
        ? `[${dc.slot === "past" ? "과거/배경" : dc.slot === "present" ? "현재/핵심" : "미래/전망"}]`
        : `[카드 ${i + 1}]`;
      const orientation = dc.orientation === "upright" ? "정방향" : "역방향";
      return `${slotLabel} ${dc.card.nameKo}(${dc.card.name}) — ${orientation}
  핵심 키워드: ${dc.card.keywordsKo.join(", ")}
  해석 방향(${orientation}): ${dc.orientation === "upright" ? dc.card.meaningUpright : dc.card.meaningReversed}
  톤/분위기: ${dc.card.toneGuide}`;
    })
    .join("\n\n");

  // 시간적 맥락 블록: 데이터가 있으면 포함, 없으면 빈 문자열
  const temporalBlock = temporalCtx
    ? `\n### 시간적 흐름 데이터\n${formatTemporalContext(temporalCtx) || "데이터 없음"}`
    : "";

  // 섹터 서사 힌트: sector가 있으면 해석 배경으로 제공 (#322)
  const sectorHint = market.sector && SECTOR_NARRATIVE_HINTS[market.sector]
    ? `\n섹터 에너지: ${market.sector} — ${SECTOR_NARRATIVE_HINTS[market.sector]}`
    : "";

  // 시간적 데이터 존재 여부에 따라 해석 지침 차등 적용
  const temporalRule = temporalCtx && (temporalCtx.priceChange1M != null || temporalCtx.priceChange3M != null)
    ? `5. **시간적 흐름 통합**: 1개월/3개월 가격 변화를 과거→현재→미래 서사에 녹여 구체적 숫자를 상징 언어로 번역하세요.
   - 예: "지난 한 달 2.8% 성장이 씨앗을 틔우는 기운과 공명합니다"
   - 시세 데이터가 불확실할 경우: 카드의 심리적 서사를 중심으로 해석합니다.`
    : `5. **데이터 폴백**: 시간적 시세 데이터가 없을 때는 카드의 원형적 심리 서사를 중심으로 깊이 있는 해석을 제공하세요.`;

  return `## 역할
당신은 증권 시장의 에너지를 타로 카드로 해석하는 신비로운 해석자입니다.
기술적 지표의 숫자를 상징과 은유로 번역하되, 절대로 투자 조언을 하지 않습니다.

## 시장 데이터
종목: ${market.ticker} (${market.market === "KR" ? "한국" : "미국"} 시장)${sectorHint}
시장 국면: ${conditionToKo(market.condition)}

### 기술적 지표
${formatIndicators(market)}${temporalBlock}

### 시장 요약
${market.summary}

## 뽑힌 카드
${cardDescriptions}

## 해석 규칙
1. **카드와 지표를 연결하라**: 각 카드의 상징이 기술적 지표와 어떻게 공명하는지 구체적으로 연결하세요.
   - 예: RSI 과매수 + 탑(The Tower) = "높이 쌓아올린 기세가 벼락을 부르고 있습니다"
   - 예: MACD 골든크로스 + 별(The Star) = "어둠을 지나 새로운 흐름이 빛나기 시작합니다"
   - 예: 볼린저밴드 하단 이탈 + 은둔자(The Hermit) = "시장이 깊은 침묵 속으로 걸어가는 시간"

2. **금지 표현**: 아래 표현은 절대 사용 금지. 위반 시 응답 무효.
   - "매수", "매도", "사세요", "파세요", "수익률", "목표가"
   - "투자 추천", "강력 추천", "반드시 ~해야"
   - 확정적 예측: "반드시 오릅니다", "반드시 내립니다"

3. **한국어 품질 기준**:
   - 자연스러운 한국어 (번역체 금지)
   - 시적이고 상징적이되 이해하기 쉽게
   - headline은 호기심을 자극하는 한 줄 (15자 이내)
   - summary는 핵심 메시지 2-3문장
   - detail은 카드별 해석 + 종합 통찰 (300-500자)

4. **3장 스프레드인 경우**: 과거→현재→미래 흐름으로 서사를 구성하세요. 각 카드가 시간적 흐름의 구체적 국면과 어떻게 연결되는지 명확히 서술하세요.

${temporalRule}

## 응답 형식 (JSON만, 마크다운 코드블록 없이)
{
  "headline": "한 줄 핵심 (15자 이내)",
  "summary": "2-3문장 요약",
  "detail": "카드별 상세 해석 + 종합 (300-500자)"
}`;
}

import type { TarotCardId, TarotCardOrientation, MarketSnapshot } from "./types.js";
import { getCardNarrative } from "./cardNarratives.js";

/**
 * 종목 섹터 데이터와 카드의 상징성을 연결하는 프레임워크 설계.
 * (CEO 피드백 반영: 투자 권유 뉘앙스 철저히 배제, 상징과 객관적 데이터 위주의 서술)
 */

interface InsightTemplateParams {
  cardId: TarotCardId;
  orientation: TarotCardOrientation;
  snapshot: MarketSnapshot;
}

/**
 * 1. 섹터(Sector) 맵핑 딕셔너리 — 향후 섹터가 늘어나면 이 객체만 확장하면 됩니다.
 */
const SECTOR_NARRATIVE_MAP: Record<string, string> = {
  "Technology": "기술 혁신과 빠른 트렌드 변화에 민감한 섹터 특성상, ",
  "Financials": "거시 경제와 금리 변동의 영향을 직접적으로 받는 금융 환경 속에서, ",
  "Financial": "거시 경제와 금리 변동의 영향을 직접적으로 받는 금융 환경 속에서, ",
  "Healthcare": "연구 개발 성과와 규제 이슈에 따라 움직이는 헬스케어 산업의 흐름 속에서, ",
  "Consumer Cyclical": "소비자 심리와 경기 주기에 민첩하게 반응하는 현재 상황에서, ",
  "Energy": "글로벌 공급망과 원자재 가격 변동에 노출된 에너지 시장의 특성상, ",
  // 기본값 (섹터 정보가 없거나 맵핑되지 않은 경우)
  "default": "최근 시장의 거시적 흐름 속에서, "
};

/**
 * 특정 섹터/데이터 포인트와 카드 상징성의 연결성을 정의합니다.
 */
function getSectorContext(snapshot?: MarketSnapshot): string {
  // 데이터 자체가 누락된 경우에 대한 완벽한 방어 (에러 방지)
  if (!snapshot) return SECTOR_NARRATIVE_MAP["default"]!;

  const { sector, volume, marketCap } = snapshot;
  
  let context = (SECTOR_NARRATIVE_MAP[sector || ""] || SECTOR_NARRATIVE_MAP["default"]) as string;

  // 2. 거래량 및 시가총액(규모) 컨텍스트 확장
  // 방어 로직: volume이나 marketCap이 null/undefined 인 경우 무시
  if (volume && volume > 10000000) {
    context += "최근 시장 참여자들의 높은 관심(거래량 급증)과 맞물려 ";
  } else if (volume && volume < 50000) {
    // 거래량이 매우 적거나 소형주인 경우의 방어적 서술
    context += "현재 거래가 비교적 한산한 가운데 차분한 관망세가 이어지며, ";
  }

  return context;
}

/**
 * 정적 카피가 LLM 출력 결과 대비 부족한 경우를 대비한 폴백 텍스트 제안 (Step 3)
 */
export function generateFallbackInsight({ cardId, orientation, snapshot }: InsightTemplateParams): string {
  // 방어: 필수 파라미터 누락 시 가장 안전한 기본 문자열 반환
  if (!cardId || !orientation) {
    return "현재 시장의 불확실성이 상존하는 가운데, 객관적 지표에 기반한 차분한 관망이 필요한 시점입니다. 단기적 예측보다는 긴 호흡의 대응을 권장합니다.";
  }

  // 1. 카드의 원형적 서사 (cardNarratives 재활용)
  const baseNarrative = getCardNarrative(cardId, orientation);
  
  // 2. 종목 데이터(섹터, 거래량 등) 기반 컨텍스트
  const sectorContext = getSectorContext(snapshot);

  // 3. 시장 상태에 따른 조언 (투자 권유 금칙어 회피, 데이터 누락 방어)
  let marketAdvice = "";
  const condition = snapshot?.condition || "neutral"; // 데이터 누락 시 중립(neutral)으로 fallback

  switch (condition) {
    case "bullish":
      marketAdvice = "상승 흐름이 뚜렷하지만, 과도한 낙관론을 경계하고 객관적 지표를 유지하는 것이 중요합니다.";
      break;
    case "bearish":
      marketAdvice = "하방 압력이 강한 구간입니다. 섣부른 판단보다는 리스크 관리에 집중하며 관망하는 자세가 필요할 수 있습니다.";
      break;
    case "volatile":
      marketAdvice = "예기치 못한 변동성이 예상되는 구간입니다. 단기적인 가격 변동에 흔들리지 않는 분석적 접근이 요구됩니다.";
      break;
    case "consolidating":
    case "neutral":
    default:
      marketAdvice = "뚜렷한 방향성이 나타나기 전 에너지를 응축하는 시기입니다. 긴 호흡으로 시장의 다음 신호를 기다리는 것이 현명합니다.";
      break;
  }

  return `${sectorContext}이 종목은 '${baseNarrative.split('.')[0]}'의 상징을 띄고 있습니다. ${marketAdvice} 타로의 상징은 단기적 예측이 아닌, 현재 종목이 품고 있는 에너지의 흐름을 읽는 도구로 활용하시기 바랍니다.`;
}

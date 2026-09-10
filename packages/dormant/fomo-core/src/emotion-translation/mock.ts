import type { EmotionCard, FeedEmotion } from "./types";

/**
 * 피드 mock 카드 — 화면 형태를 먼저 띄우기 위한 큐레이션. docs/PIVOT_FEED_FIRST.md Phase 2.
 * 실제 뉴스/커뮤니티 → 감정 치환은 Phase 3(emotion-translation 엔진)이 연결한다.
 *
 * 정직성: 가짜 수치/가짜 출처를 달지 않는다 — 근거는 "샘플"로 표기.
 * 톤: 담담한 솔직함. 모든 카드는 "너만 그런 거 아니야"의 결.
 * 금칙: 매수/매도/사세요/오른다 등 투자 조언·단정 ❌ (테스트로 가드).
 */

const sample = (label: string) => ({ label, value: "샘플" });

export const MOCK_FEED_CARDS: Record<FeedEmotion, EmotionCard[]> = {
  fomo: [
    { id: "mock-fomo-1", emotion: "fomo", headline: "엔비디아 또 놓쳤다는 사람, 오늘 여기 많아요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-fomo-2", emotion: "fomo", headline: "비트코인 또 올랐대요. 안 탄 사람 여기 많아요.", evidence: sample("시장 분위기"), confidence: 1 },
    { id: "mock-fomo-3", emotion: "fomo", headline: "다들 올라탄 것 같은 날이죠. 사실 구경 중인 사람이 더 많아요.", confidence: 1 },
    { id: "mock-fomo-4", emotion: "fomo", headline: "지금이라도 들어가야 하나 — 그 고민, 오늘만 천 번쯤 보였어요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-fomo-5", emotion: "fomo", headline: "남들 수익 인증 보고 조급해진 거, 다들 그래요.", confidence: 1 },
    { id: "mock-fomo-6", emotion: "fomo", headline: "오늘 제일 많이 검색된 단어가 반도체래요. 다들 궁금했나 봐요.", evidence: sample("검색 분위기"), confidence: 1 },
  ],
  fear: [
    { id: "mock-fear-1", emotion: "fear", headline: "암호화폐 무섭다는 말이 도는 날. 오늘 다들 떨고 있어요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-fear-2", emotion: "fear", headline: "내릴 때마다 자꾸 열어보게 되죠. 다들 같은 화면 보고 있어요.", confidence: 1 },
    { id: "mock-fear-3", emotion: "fear", headline: "손절 얘기가 많아진 밤이에요. 혼자 무서운 거 아니에요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-fear-4", emotion: "fear", headline: "뉴스가 유난히 무섭게 들리는 날. 잠깐 숨 골라도 늦지 않아요.", confidence: 1 },
    { id: "mock-fear-5", emotion: "fear", headline: "다들 현금이 최고라던 날도 있었어요. 무서운 게 정상이에요.", confidence: 1 },
  ],
  joy: [
    { id: "mock-joy-1", emotion: "joy", headline: "반도체 신고가래요. 다들 신났네요 🔥 다들 봤죠?", evidence: sample("시장 분위기"), confidence: 1 },
    { id: "mock-joy-2", emotion: "joy", headline: "오늘은 계좌 여는 손이 가볍대요. 다들 들떠 있어요.", confidence: 1 },
    { id: "mock-joy-3", emotion: "joy", headline: "수익 인증이 쏟아지는 날. 박수 쳐주는 사람도 많아요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-joy-4", emotion: "joy", headline: "신고가 알림이 여기저기서 울렸대요. 분위기 좋네요.", evidence: sample("시장 분위기"), confidence: 1 },
    { id: "mock-joy-5", emotion: "joy", headline: "다 같이 웃는 날도 있네요. 오늘은 그런 날인가 봐요.", confidence: 1 },
  ],
  regret: [
    { id: "mock-regret-1", emotion: "regret", headline: "어제 팔았는데 오늘 올랐대요. 그 마음 알아요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-regret-2", emotion: "regret", headline: "\"그때 살 걸\" — 오늘 제일 많이 보인 말이에요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-regret-3", emotion: "regret", headline: "익절하고 나니 더 가더라고요. 다들 한 번씩 겪는 날.", confidence: 1 },
    { id: "mock-regret-4", emotion: "regret", headline: "판 사람도 안 판 사람도 후회하는 날이 있어요. 후회는 공평하네요.", confidence: 1 },
    { id: "mock-regret-5", emotion: "regret", headline: "지난 선택 곱씹는 밤이죠. 여기 와준 것만으로 충분해요.", confidence: 1 },
  ],
  greed: [
    { id: "mock-greed-1", emotion: "greed", headline: "다들 더 사고 싶어 하는 날. 다들 그래요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-greed-2", emotion: "greed", headline: "\"한 주만 더\" — 그 말이 오늘 유난히 많이 보여요.", evidence: sample("커뮤니티 분위기"), confidence: 1 },
    { id: "mock-greed-3", emotion: "greed", headline: "수익 났는데도 더 갖고 싶죠. 자연스러운 마음이에요.", confidence: 1 },
    { id: "mock-greed-4", emotion: "greed", headline: "마음이 뜨거운 날인 거 알아요. 천천히 가도 돼요.", confidence: 1 },
    { id: "mock-greed-5", emotion: "greed", headline: "욕심나는 날인 건 다들 같아요. 오늘 여기 사람 많은 게 증거예요.", confidence: 1 },
  ],
};

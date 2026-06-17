import {
  extractKeywords,
  mergeCommunityEngagement,
  scoreKeywords,
  buildKeywordCards,
  overallConfidence,
  fetchCommunity,
  pickSurpriseStock,
  MOCK_KEYWORD_CARDS,
  type KeywordCard,
  type KeywordConfidence,
  type KeywordSourceItem,
} from "@fomo/core";
import { fetchAllNews } from "./fomo-news-sources";
import { addKeywordCardComments } from "./fomo-keyword-comment";

/**
 * 키워드 카드 산출 파이프라인(공유). KEYWORD_ENGINE_SPEC §4 / Phase 2~3.
 *
 * 라우트(/api/fomo/keywords)와 cron 스냅샷 스크립트(scripts/keywords-generate.ts)가 **동일** 경로를 쓰게
 * 여기로 모은다 — 라이브와 스냅샷이 달라지지 않도록(정합성).
 *
 * 파이프라인: 뉴스 RSS + 커뮤니티(병렬) → extract → community 가산 → score → 룰 카드 → LLM 코멘트(가드+폴백).
 * 키워드 0건이면 mock 명시적 폴백(confidence:"fallback") — 가짜 점수 강제 생성 금지(§5).
 * 실패해도 throw 없이 폴백을 돌려준다(빈 화면 금지).
 */

export interface KeywordPayloadCore {
  cards: readonly KeywordCard[];
  confidence: KeywordConfidence;
}

export async function computeKeywordCards(): Promise<KeywordPayloadCore> {
  const [newsResult, communityResult] = await Promise.allSettled([fetchAllNews(), fetchCommunity()]);

  const items: KeywordSourceItem[] = [];
  if (newsResult.status === "fulfilled") {
    for (const a of newsResult.value) {
      items.push({
        title: a.title,
        ...(a.summary ? { summary: a.summary } : {}),
        ...(a.url ? { url: a.url } : {}),
        publishedAt: a.publishedAt,
        source: a.source,
        lang: a.lang,
      });
    }
  } else {
    console.warn("[keyword-pipeline] news error", newsResult.reason);
  }

  const communitySignals =
    communityResult.status === "fulfilled" ? communityResult.value.sources : [];
  if (communityResult.status === "rejected") {
    console.warn("[keyword-pipeline] community error", communityResult.reason);
  }

  const extracted = mergeCommunityEngagement(extractKeywords(items), communitySignals);
  const scored = scoreKeywords(extracted, { nowMs: Date.now() });
  const ruleCards = buildKeywordCards(scored);

  // 키워드 0건 = 보여줄 게 없음 → mock 명시적 폴백(§5).
  if (ruleCards.length === 0) {
    return { cards: MOCK_KEYWORD_CARDS, confidence: "fallback" };
  }

  // Phase 3: 코멘트를 LLM 1차로(가드레일 + 룰 폴백 강등). 점수 로직은 그대로.
  const cards = await addKeywordCardComments(scored, ruleCards);

  // 카드별 "의외의 추천 종목" — 그 키워드가 등장한 원문에서 추출(룰 기반, LLM 무관).
  // 후보 없으면 생략(정직). 매칭은 v1 substring(한글 테마 기준).
  const withSurprise = cards.map((card) => {
    const matched = items.filter((it) =>
      `${it.title} ${it.summary ?? ""}`.includes(card.keyword)
    );
    const surpriseStock = pickSurpriseStock(matched);
    return surpriseStock ? { ...card, surpriseStock } : card;
  });

  return { cards: withSurprise, confidence: overallConfidence(scored) };
}

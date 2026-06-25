import {
  applyLlmComment,
  buildKeywordCommentPrompt,
  parseKeywordComments,
  type KeywordCard,
  type LlmKeywordComment,
  type ScoredKeyword,
} from "@fomo/core";
import { callAI, isAiConfigured } from "@fomo/shared";

/**
 * 키워드 카드 코멘트 — LLM 1차, 룰 폴백 강등. KEYWORD_ENGINE_SPEC §4.4 / Phase 3.
 *
 * fomo-comment.ts(기사 코멘트)와 동형: 공용 callAI(@fomo/shared) + 배치 1콜 + 인메모리 캐시.
 * 검증·병합은 @fomo/core 의 순수 함수(applyLlmComment: 금칙어/균형추 가드 + 룰 폴백)에 위임한다.
 *
 * 강등 경로(모두 룰 폴백 = buildKeywordCard 결과 유지):
 *   - AI 미설정 → LLM 시도 안 함.
 *   - fetch 실패/레이트리밋/타임아웃 → 캐시에 없는 카드는 룰 그대로.
 *   - 가드 위반(투자조언/예측/전문용어/균형추 누락) → applyLlmComment 가 그 카드만 룰로 되돌림.
 *
 * 정직성(§5): score 를 프롬프트에 넣어, 데이터가 잠잠하면(낮은 점수) LLM 도 과장하지 않게 유도.
 */

// 코멘트는 5장 내외라 품질 우선 — 본 모델(AI_MODEL) 사용, 미설정 시 빠른 mini.
const COMMENT_MODEL = process.env["AI_MODEL"] || "openai/gpt-4.1-mini";
// 변주(자연스러움) 위해 약간 높게. AI_TEMPERATURE 가 있으면 재활용.
const TEMPERATURE = Number.parseFloat(process.env["AI_TEMPERATURE"] ?? "") || 0.7;

/** keyword|score → 검증 전 LLM 묶음 캐시. 같은 회차 재호출 비용 절감(라우트가 이미 30분 TTL). */
const cache = new Map<string, LlmKeywordComment>();
const CACHE_MAX = 500;

const cacheKey = (kw: ScoredKeyword) => `${kw.keyword}|${kw.fomoScore}`;

/**
 * 룰 폴백 카드(cards)에 LLM 코멘트를 얹어 반환. cards 는 scored 와 같은 순서/길이(buildKeywordCards).
 * 항상 입력 길이만큼 카드를 돌려준다(누락·빈 코멘트 없음 — 최소 룰 폴백).
 */
export async function addKeywordCardComments(
  scored: readonly ScoredKeyword[],
  cards: readonly KeywordCard[]
): Promise<KeywordCard[]> {
  if (isAiConfigured()) {
    const uncached = scored.filter((kw) => !cache.has(cacheKey(kw)));
    if (uncached.length > 0) {
      const prompt = buildKeywordCommentPrompt(
        uncached.map((kw) => ({
          keyword: kw.keyword,
          score: kw.fomoScore,
          titles: kw.articles.map((a) => a.title),
          related: kw.related,
        }))
      );
      const res = await callAI({
        model: COMMENT_MODEL,
        temperature: TEMPERATURE,
        messages: [{ role: "user", content: prompt }],
        trace: "fomo-keyword-comment",
      });
      if (res.ok) {
        const parsed = parseKeywordComments(res.content);
        const byKeyword = new Map(parsed.map((c) => [c.keyword, c]));
        for (const kw of uncached) {
          const c = byKeyword.get(kw.keyword);
          if (c) cache.set(cacheKey(kw), c);
        }
        if (cache.size > CACHE_MAX) cache.clear();
      }
    }
  }

  // 병합: 가드 통과한 LLM 코멘트만 얹고, 없거나 위반이면 룰 폴백 카드 그대로(applyLlmComment 내부 검증).
  return scored.map((kw, i) => applyLlmComment(cards[i]!, cache.get(cacheKey(kw))));
}

import { fomoCommentFallback, parseFomoComments, type ScoredArticle } from "@fomo/core";
import { callAI, isAiConfigured } from "@fomo/shared";

/**
 * 기사별 포모 한 줄 코멘트 (LLM). docs/PIVOT_FEED_FIRST.md.
 *
 * fomo-translate.ts 와 동형: 공용 callAI(@fomo/shared) + 배치 1콜 + id별 인메모리 캐시.
 * 톤: 담담한 솔직함, "너만 그런 거 아니야". 투자조언/단정 금지.
 * 미설정/실패/미커버 기사는 fomoCommentFallback(규칙)으로 항상 채운다 — 빈 코멘트 없음.
 */

const COMMENT_MODEL = process.env["AI_TRANSLATE_MODEL"] ?? "openai/gpt-4.1-mini";
const MAX_COMMENT = 20;

const cache = new Map<string, string>();
const CACHE_MAX = 1000;

function buildPrompt(items: { id: string; title: string }[]): string {
  return [
    "너는 '포모'라는 담담한 친구야. 각 한국 금융 뉴스 제목에 대해 한 줄 코멘트를 달아줘.",
    "- 톤: 담담한 솔직함. 위로하듯, '너만 그런 거 아니야'의 결. 30자 내외.",
    "- 투자 조언/단정(매수·매도·오른다·확실) 금지. 사실 판단 강요 금지.",
    '- 반드시 JSON 배열만: [{"id","comment"}]. 다른 텍스트 금지.',
    "",
    JSON.stringify(items),
  ].join("\n");
}

/** 기사들의 comment 를 채워 반환. LLM 우선, 미커버/실패는 규칙 폴백으로 항상 채움. */
export async function addFomoComments(articles: ScoredArticle[]): Promise<ScoredArticle[]> {
  // LLM 시도(설정돼 있을 때, 미캐시분만).
  if (isAiConfigured()) {
    const uncached = articles
      .filter((a) => !cache.has(a.id))
      .slice(0, MAX_COMMENT)
      .map((a) => ({ id: a.id, title: a.title }));
    if (uncached.length > 0) {
      const res = await callAI({
        model: COMMENT_MODEL,
        temperature: 0.5,
        messages: [{ role: "user", content: buildPrompt(uncached) }],
        trace: "fomo-comment",
      });
      if (res.ok) {
        for (const c of parseFomoComments(res.content)) {
          cache.set(c.id, c.comment);
        }
        if (cache.size > CACHE_MAX) cache.clear();
      }
    }
  }

  // 적용 — 캐시(LLM) 우선, 없으면 규칙 폴백. 항상 코멘트 보장.
  return articles.map((a) => ({
    ...a,
    comment:
      cache.get(a.id) ??
      fomoCommentFallback({
        title: a.title,
        fomoScore: a.fomoScore,
        ...(a.category ? { category: a.category } : {}),
      }),
  }));
}

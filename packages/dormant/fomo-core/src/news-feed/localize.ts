import type { NewsLang, RawArticle, ScoredArticle } from "./types";

/**
 * 표기 언어 선택 — 한국어 번역(titleKo/summaryKo)이 있으면 우선, 없으면 원문.
 * docs/PIVOT_FEED_FIRST.md 확장 seam: 지금은 영문 그대로, 번역 붙으면 자동으로 한국어 노출.
 */
export function localizeArticle<T extends RawArticle>(article: T, lang: NewsLang): T {
  if (lang === "ko") {
    return {
      ...article,
      title: article.titleKo?.trim() || article.title,
      summary: article.summaryKo?.trim() || article.summary,
    };
  }
  return article;
}

/** 피드 전체 표기 언어 적용. */
export function localizeFeed(articles: ScoredArticle[], lang: NewsLang): ScoredArticle[] {
  return articles.map((a) => localizeArticle(a, lang));
}

import {
  applyKoTranslations,
  buildKoTranslationPrompt,
  parseKoTranslations,
  type KoTranslation,
  type ScoredArticle,
} from "@fomo/core";
import { callAI, isAiConfigured } from "@fomo/shared";

/**
 * 영문 기사 → 한국어 번역 (LLM). docs/PIVOT_FEED_FIRST.md.
 *
 * 공용 callAI(@fomo/shared, OpenAI 호환) — AI_API_URL/AI_API_KEY/AI_MODEL 체계, 키는 GITHUB_TOKEN 폴백.
 * 미설정/실패/타임아웃 시 원문(영문) 폴백 — localize 가 영문 표기.
 * 속도: 번역 전용 모델(기본 gpt-4.1-mini, 대용량보다 빠름) + 제목/요약만 batch 1콜.
 * 비용/지연: 라우트 엣지 캐시(s-maxage=300) + 아래 인메모리 캐시(id별)로 재번역 최소화.
 */

// 번역은 빠른 mini 계열 고정(본문 해석용 AI_MODEL=gpt-4.1은 느려서 타임아웃). AI_TRANSLATE_MODEL 로만 덮어씀.
const TRANSLATE_MODEL = process.env["AI_TRANSLATE_MODEL"] ?? "openai/gpt-4.1-mini";

/** 번역할 최대(미캐시) 기사 수 — 토큰/지연 상한. 점수 상위만(피드는 점수순). */
const MAX_TRANSLATE = 20;

/** id → 번역 인메모리 캐시. 같은 기사 재번역 방지(warm 인스턴스에서 즉시). */
const cache = new Map<string, KoTranslation>();
const CACHE_MAX = 1000;

/**
 * 영문(lang="en") 기사들의 titleKo/summaryKo 를 채워 반환. 한국어 기사는 그대로.
 * 캐시 히트는 즉시 적용하고, 미캐시 영문만 LLM 1콜로 번역. 실패 시 가능한 만큼만(원문 폴백).
 */
export async function translateEnglishToKorean(
  articles: ScoredArticle[]
): Promise<ScoredArticle[]> {
  if (!isAiConfigured()) return articles;

  // 제목만 번역(요약까지 넣으면 지연이 커져 타임아웃) — 카드 주인공은 헤드라인.
  const english = articles.filter((a) => a.lang === "en");
  const uncached = english
    .filter((a) => !cache.has(a.id))
    .slice(0, MAX_TRANSLATE)
    .map((a) => ({ id: a.id, title: a.title }));

  if (uncached.length > 0) {
    const res = await callAI({
      model: TRANSLATE_MODEL,
      temperature: 0.2,
      messages: [{ role: "user", content: buildKoTranslationPrompt(uncached) }],
      trace: "fomo-translate",
    });
    if (res.ok) {
      for (const t of parseKoTranslations(res.content)) {
        cache.set(t.id, t);
      }
      if (cache.size > CACHE_MAX) cache.clear();
    }
  }

  // 캐시(이번/이전 번역분) 전체를 적용 — 부분 성공도 반영.
  const translations: KoTranslation[] = [];
  for (const a of english) {
    const t = cache.get(a.id);
    if (t) translations.push(t);
  }
  return applyKoTranslations(articles, translations);
}

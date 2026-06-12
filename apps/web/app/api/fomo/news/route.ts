import { NextResponse } from "next/server";
import { buildNewsFeed, localizeFeed, type NewsLang } from "@fomo/core";
import { withCors } from "../../../../lib/fomo";
import { fetchAllNews } from "../../../../lib/fomo-news-sources";
import { translateEnglishToKorean } from "../../../../lib/fomo-translate";

// FOMO 뉴스 피드 — 실제 기사를 FOMO 점수순으로. docs/PIVOT_FEED_FIRST.md.
// 사실 헤드라인 그대로 + 점수만 산출(감정 치환 아님). 점수/정렬은 @fomo/core/news-feed 순수부.
// 언어: 기본 한국어(lang=ko) — 영문(Yahoo) 기사는 LLM으로 한국어 번역(titleKo), 한국 소스는 원문.
//       AI 미설정/실패 시 영문 폴백. ?lang=en 이면 번역 없이 원문.
export const dynamic = "force-dynamic";
// LLM 번역(batch)이 수초 걸릴 수 있어 함수 데드라인을 넉넉히(번역 실패 시 영문 폴백).
export const maxDuration = 30;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request) {
  const lang: NewsLang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "ko";

  const raw = await fetchAllNews();
  let feed = buildNewsFeed(raw, { nowMs: Date.now(), limit: 40 });

  // 한국어 피드: 영문 기사를 LLM으로 번역(titleKo 채움) 후 한국어 표기 적용.
  if (lang === "ko") feed = await translateEnglishToKorean(feed);

  return withCors(
    NextResponse.json(
      { articles: localizeFeed(feed, lang), lang },
      // 엣지 캐시 — 외부 RSS/LLM 호출 보호(배너와 동일 정책).
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    )
  );
}

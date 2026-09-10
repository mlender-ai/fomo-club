import { NextResponse } from "next/server";
import { buildDeck, buildNewsFeed } from "@fomo/core";
import { withCors } from "../../../../lib/fomo";
import { fetchAllNews } from "../../../../lib/fomo-news-sources";
import { addFomoComments } from "../../../../lib/fomo-comment";
import { fetchChartCards } from "../../../../lib/fomo-chart-cards";

// FOMO 뉴스 덱 — 한국 뉴스(점수순)에 차트 카드(VIX/코스피/나스닥/엔비디아)를 끼운 스와이프 덱.
// docs/PIVOT_FEED_FIRST.md. 각 뉴스에 포모 한 줄 코멘트(LLM+규칙폴백). 차트 추이는 best-effort.
export const dynamic = "force-dynamic";
// 코멘트 LLM(batch)이 수초 걸릴 수 있어 데드라인 넉넉히(실패 시 규칙 폴백).
export const maxDuration = 30;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  const [raw, charts] = await Promise.all([fetchAllNews(), fetchChartCards()]);

  const feed = buildNewsFeed(raw, { nowMs: Date.now(), limit: 40 });
  const withComments = await addFomoComments(feed);
  const deck = buildDeck(withComments, charts, { chartEvery: 5 });

  return withCors(
    NextResponse.json(
      { deck, lang: "ko" },
      // 엣지 캐시 — 외부 소스/LLM 호출 보호(배너와 동일 정책).
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    )
  );
}

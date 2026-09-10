import { NextResponse } from "next/server";
import {
  computeFomoIndex,
  buildWhaleItems,
  buildMacroItems,
  buildPulseItems,
  buildMarketScores,
  bannerFallback,
  type BannerItem,
} from "@fomo/core";
import { prisma } from "../../../../lib/prisma";
import { kstDate, todayTally, withCors } from "../../../../lib/fomo";
import { fetchMacro, fetchWhale } from "../../../../lib/fomo-market-sources";

// 통합 롤링 배너 — pulse(감정) + macro(국내·미증시·반도체) + whale(CoinGecko).
// 정직한 숫자 원칙: 실측값만. 결측은 항목 생략, 전부 비면 담담한 폴백.
// 문구/포맷팅은 @fomo/core/banner의 순수 빌더가 담당(테스트 보장).
// 라우트는 force-dynamic — 매 요청 현재 소스별 캐시로 재조립한다.
// (export const revalidate 전체 라우트 캐시는 콜드 렌더 결과에 고정되는 문제가 있어
//  일부 지수가 실패한 첫 렌더가 박히면 재검증이 반영 안 됐다.)
// 외부 API 레이트리밋 보호는 각 fetch의 next:{revalidate:300}(데이터 캐시)이 담당.
export const dynamic = "force-dynamic";

// 시장 데이터 수집(fetchMacro/fetchWhale)은 lib/fomo-market-sources 공용부로 추출 —
// feed(감정 치환 피드) 라우트와 공유한다. 동작 동일.

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** 당일 감정/지수 pulse. */
async function fetchPulse(): Promise<BannerItem[]> {
  try {
    const date = kstDate();
    const snap = await prisma.fomoIndexSnapshot.findUnique({ where: { date } });
    const { tally, total } = await todayTally(date);
    const idx = snap
      ? { score: snap.score, state: snap.state }
      : (() => {
          const c = computeFomoIndex({ emotion: tally }, date);
          return { score: c.score, state: c.state };
        })();
    return buildPulseItems({ score: idx.score, state: idx.state, total, tally });
  } catch (err) {
    console.warn("[fomo/banner] pulse error", err);
    return [];
  }
}

export async function GET() {
  const [whaleInput, macroQuotes, pulseItems] = await Promise.all([
    fetchWhale(),
    fetchMacro(),
    fetchPulse(),
  ]);

  // 노출 순서: 감정(나와 직접 닿는 것) → 거시 → 코인.
  const items: BannerItem[] = [
    ...pulseItems,
    ...buildMacroItems(macroQuotes),
    ...buildWhaleItems(whaleInput),
  ];

  if (items.length === 0) items.push(bannerFallback());

  // 홈 상단 캐러셀용 시장 점수(나스닥·비트코인·코스피) — 같은 소스 재사용, 추가 fetch 없음.
  const markets = buildMarketScores(macroQuotes, whaleInput);

  // 엣지 캐시로 Yahoo/CoinGecko 레이트리밋 보호 — 5분 신선, 이후 10분간 stale 허용하며 백그라운드 갱신.
  return withCors(
    NextResponse.json(
      { items, markets },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    )
  );
}

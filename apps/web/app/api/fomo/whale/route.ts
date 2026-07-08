import { NextResponse } from "next/server";
import { withCors } from "../../../../lib/fomo";

// 고래/암호화폐 시장 신호 배너. 실제 데이터(CoinGecko 무료 API, 키 불필요).
// "하향 비교 안도": 고래·대형 시장도 같이 물려있음을 정직한 숫자로 보여 콜드스타트를 푼다.
// 정직한 숫자 원칙: 실제값만. 실패 시 가짜 수치 대신 담담한 폴백.
// (특정 고래 청산 피드 = Whale Alert/Coinglass 유료 → 후속. 지금은 무료 실데이터.)
export const revalidate = 300; // 5분 캐시 (CoinGecko 레이트리밋 보호)

interface CoinMarket {
  name: string;
  symbol: string;
  price_change_percentage_24h: number | null;
  ath_change_percentage: number | null;
}

function pct(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v}%`;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  const items: string[] = [];
  try {
    const [globalRes, marketsRes] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/global", { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) }),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h",
        { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) }
      ),
    ]);

    // 1) 전체 시총 24h 변화 — "다 같이"
    if (globalRes.status === "fulfilled" && globalRes.value.ok) {
      const g = (await globalRes.value.json()) as {
        data?: { market_cap_change_percentage_24h_usd?: number };
      };
      const mc = g.data?.market_cap_change_percentage_24h_usd;
      if (typeof mc === "number") {
        items.push(
          mc < 0
            ? `🐋 오늘 암호화폐 시총 ${pct(mc)} — 오늘은 다 같이 빨갰어`
            : `🐋 오늘 암호화폐 시총 ${pct(mc)}`
        );
      }
    }

    // 2) 대형 코인들 — BTC 전고점 대비(고래도 물림) + 최대 낙폭 + 하락 개수
    if (marketsRes.status === "fulfilled" && marketsRes.value.ok) {
      const coins = (await marketsRes.value.json()) as CoinMarket[];
      const btc = coins.find((c) => c.symbol?.toLowerCase() === "btc");
      if (btc && typeof btc.ath_change_percentage === "number" && btc.ath_change_percentage < 0) {
        items.push(`📉 비트코인, 전고점 대비 ${pct(btc.ath_change_percentage)} — 고점에 물린 건 너만이 아니야`);
      }
      const withChg = coins.filter((c) => typeof c.price_change_percentage_24h === "number");
      const worst = [...withChg].sort(
        (a, b) => (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0)
      )[0];
      if (worst && (worst.price_change_percentage_24h ?? 0) < 0) {
        items.push(`🔻 ${worst.name} 24시간 ${pct(worst.price_change_percentage_24h!)}`);
      }
      const downCount = withChg.filter((c) => (c.price_change_percentage_24h ?? 0) < 0).length;
      if (withChg.length > 0) {
        items.push(`👀 상위 ${withChg.length}개 중 ${downCount}개가 하락 중`);
      }
    }
  } catch (err) {
    console.warn("[fomo/whale] error", err);
  }

  // 정직한 폴백 — 가짜 수치 금지
  if (items.length === 0) {
    items.push("🐋 고래들도 오늘은 조용해. 잠깐 같이 지켜보자.");
  }

  return withCors(NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=120" } }));
}

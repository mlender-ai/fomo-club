import { NextResponse } from "next/server";
import {
  computeFomoIndex,
  buildWhaleItems,
  buildMacroItems,
  buildPulseItems,
  parseStooqDailyChange,
  bannerFallback,
  type BannerItem,
  type MacroQuote,
  type WhaleInput,
} from "@fomo/core";
import { prisma } from "../../../../lib/prisma";
import { kstDate, todayTally, withCors } from "../../../../lib/fomo";

// 통합 롤링 배너 — pulse(감정) + whale(CoinGecko) + macro(Stooq 미증시·반도체).
// 정직한 숫자 원칙: 실측값만. 결측은 항목 생략, 전부 비면 담담한 폴백.
// 문구/포맷팅은 @fomo/core/banner의 순수 빌더가 담당(테스트 보장).
export const revalidate = 300; // 5분 캐시 (외부 API 레이트리밋 보호)

const STOOQ: { key: MacroQuote["key"]; label: string; symbol: string }[] = [
  { key: "spx", label: "S&P500", symbol: "^spx" },
  { key: "ndq", label: "나스닥", symbol: "^ndq" },
  { key: "sox", label: "필라델피아 반도체", symbol: "^sox" },
];

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** Stooq 최근 일봉 CSV에서 각 지수의 전일 대비 변화율을 모은다. */
async function fetchMacro(): Promise<MacroQuote[]> {
  // 최근 ~15일 범위만 요청해 응답을 가볍게(마지막 2행만 사용).
  const d2 = kstDate().replace(/-/g, "");
  const d1 = kstDate(-15).replace(/-/g, "");
  const results = await Promise.allSettled(
    STOOQ.map(async (s) => {
      const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s.symbol)}&d1=${d1}&d2=${d2}&i=d`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) throw new Error(`stooq ${s.symbol} ${res.status}`);
      const csv = await res.text();
      const parsed = parseStooqDailyChange(csv);
      return { ...s, change: parsed?.change ?? null, close: parsed?.close ?? null } as MacroQuote;
    })
  );
  const quotes: MacroQuote[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") quotes.push(r.value);
    else console.warn("[fomo/banner] stooq error", r.reason);
  }
  return quotes;
}

/** CoinGecko 시장 신호. */
async function fetchWhale(): Promise<WhaleInput> {
  try {
    const [globalRes, marketsRes] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/global", { next: { revalidate: 300 } }),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h",
        { next: { revalidate: 300 } }
      ),
    ]);

    let marketCapChange24h: number | null = null;
    if (globalRes.status === "fulfilled" && globalRes.value.ok) {
      const g = (await globalRes.value.json()) as {
        data?: { market_cap_change_percentage_24h_usd?: number };
      };
      const mc = g.data?.market_cap_change_percentage_24h_usd;
      if (typeof mc === "number") marketCapChange24h = mc;
    }

    let coins: WhaleInput["coins"] = [];
    if (marketsRes.status === "fulfilled" && marketsRes.value.ok) {
      const raw = (await marketsRes.value.json()) as {
        name: string;
        symbol: string;
        price_change_percentage_24h: number | null;
        ath_change_percentage: number | null;
      }[];
      coins = raw.map((c) => ({
        name: c.name,
        symbol: c.symbol,
        change24h: c.price_change_percentage_24h,
        athChange: c.ath_change_percentage,
      }));
    }
    return { marketCapChange24h, coins };
  } catch (err) {
    console.warn("[fomo/banner] coingecko error", err);
    return { marketCapChange24h: null, coins: [] };
  }
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

  return withCors(
    NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=120" } })
  );
}

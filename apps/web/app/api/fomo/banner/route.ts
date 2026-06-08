import { NextResponse } from "next/server";
import {
  computeFomoIndex,
  buildWhaleItems,
  buildMacroItems,
  buildPulseItems,
  yahooChange,
  bannerFallback,
  type BannerItem,
  type MacroQuote,
  type WhaleInput,
} from "@fomo/core";
import { prisma } from "../../../../lib/prisma";
import { kstDate, todayTally, withCors } from "../../../../lib/fomo";

// 통합 롤링 배너 — pulse(감정) + macro(국내·미증시·반도체) + whale(CoinGecko).
// 정직한 숫자 원칙: 실측값만. 결측은 항목 생략, 전부 비면 담담한 폴백.
// 문구/포맷팅은 @fomo/core/banner의 순수 빌더가 담당(테스트 보장).
// 라우트는 force-dynamic — 매 요청 현재 소스별 캐시로 재조립한다.
// (export const revalidate 전체 라우트 캐시는 콜드 렌더 결과에 고정되는 문제가 있어
//  일부 지수가 실패한 첫 렌더가 박히면 재검증이 반영 안 됐다.)
// 외부 API 레이트리밋 보호는 각 fetch의 next:{revalidate:300}(데이터 캐시)이 담당.
export const dynamic = "force-dynamic";

// Yahoo Finance chart로 지수 일봉 변화율을 가져온다(Stooq는 안티봇 차단으로 사망).
// 국내(코스피·코스닥) 먼저, 그다음 미증시·반도체 — User Zero에게 가까운 순.
const YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// 호스트 2개 폴백 — 한쪽이 스로틀(429/빈응답)이면 다른 쪽 시도.
const YAHOO_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const INDICES: { key: MacroQuote["key"]; label: string; symbol: string }[] = [
  { key: "kospi", label: "코스피", symbol: "^KS11" },
  { key: "kosdaq", label: "코스닥", symbol: "^KQ11" },
  { key: "spx", label: "S&P500", symbol: "^GSPC" },
  { key: "ndq", label: "나스닥", symbol: "^IXIC" },
  { key: "sox", label: "필라델피아 반도체", symbol: "^SOX" },
];

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** 한 심볼의 일봉 종가 배열. query1→query2 폴백. 실패 시 null. */
async function fetchIndexCloses(symbol: string): Promise<(number | null)[] | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": YAHOO_UA },
        signal: AbortSignal.timeout(8_000),
        next: { revalidate: 300 },
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
      };
      const closes = payload.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (closes && closes.length > 0) return closes;
    } catch {
      // 다음 호스트로
    }
  }
  return null;
}

/**
 * Yahoo chart(최근 5일 일봉)에서 각 지수의 직전 대비 변화율을 모은다.
 * **순차 요청** — 동시(burst)로 5개를 때리면 Yahoo가 일부를 스로틀해 누락되므로
 * 하나씩 직렬로(호스트 폴백 포함) 받아 안정성을 확보한다(5분 캐시라 지연 무관).
 */
async function fetchMacro(): Promise<MacroQuote[]> {
  const quotes: MacroQuote[] = [];
  for (const s of INDICES) {
    const closes = await fetchIndexCloses(s.symbol);
    const parsed = closes ? yahooChange(closes) : null;
    if (parsed) quotes.push({ ...s, change: parsed.change, close: parsed.close });
    else console.warn(`[fomo/banner] yahoo miss ${s.symbol}`);
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

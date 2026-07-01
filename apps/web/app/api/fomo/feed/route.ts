import { NextResponse } from "next/server";
import {
  buildFeedCards,
  feedCardsToMoodSignals,
  fetchCommunity,
  pct,
  type RawSignal,
} from "@fomo/core";
import { withCors } from "../../../../lib/fomo";
import { fetchMacro, fetchWhale } from "../../../../lib/fomo-market-sources";
import { fetchFredDocsForSeries } from "../../../../lib/fred";

// 감정 치환 피드 — 시장/커뮤니티 신호를 5개 감정 카드로. docs/PIVOT_FEED_FIRST.md Phase 3.
// 치환 로직은 @fomo/core/emotion-translation 순수 엔진(테스트 보장)이 담당하고,
// 이 라우트는 기존 소스(macro/whale/community)를 RawSignal 로 정규화해 공급만 한다.
// 신뢰도 미달 신호는 엔진이 버리고, 부족한 탭은 큐레이션(근거 "샘플")으로 채운다 — 빈 화면 금지.
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** 코인 ATH 물림 판정(%) — banner 의 buildWhaleItems와 같은 감각의 보수적 기준. */
const DEEP_UNDERWATER = -30;

type DeckContentScope = "domestic" | "world" | "global";
type DeckContentType = "macro" | "index" | "whale";

interface DeckContentFact {
  label: string;
  value: string;
}

interface FeedContentCard {
  kind: "content";
  id: string;
  contentType: DeckContentType;
  scope: DeckContentScope;
  headline: string;
  facts: DeckContentFact[];
  source: string;
  asOf: string;
}

const INDEX_SCOPE: Record<string, DeckContentScope> = {
  kospi: "domestic",
  kosdaq: "domestic",
  spx: "world",
  ndq: "world",
  sox: "world",
};
const FRED_DOMESTIC_SERIES = ["DEXKOUS", "DGS10"] as const;
const FRED_WORLD_SERIES = ["DGS10", "VIXCLS"] as const;
const FRED_CONTENT_TIMEOUT_MS = 4_500;

function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function signedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function compactNumber(value: number | null | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= 1000
    ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function contentScoreFromFeed(cards: ReturnType<typeof buildFeedCards>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const group of Object.values(cards)) {
    for (const card of group) {
      if (card.id.startsWith("mock-")) continue;
      scores.set(card.id.replace(/^feed-/, ""), card.confidence);
    }
  }
  return scores;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timeout) clearTimeout(timeout);
    }),
    new Promise<T>((resolve) => {
      timeout = setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

function buildIndexContent(macroQuotes: Awaited<ReturnType<typeof fetchMacro>>, feedScores: ReadonlyMap<string, number>): FeedContentCard[] {
  const byScope = new Map<DeckContentScope, Array<{ label: string; change: number; close?: number | null; score: number }>>();
  for (const quote of macroQuotes) {
    if (typeof quote.change !== "number") continue;
    const scope = INDEX_SCOPE[quote.key];
    if (!scope) continue;
    const arr = byScope.get(scope) ?? [];
    arr.push({
      label: quote.label,
      change: quote.change,
      ...(typeof quote.close === "number" ? { close: quote.close } : {}),
      score: feedScores.get(`macro-${quote.key}`) ?? Math.min(0.59, Math.abs(quote.change) / 5),
    });
    byScope.set(scope, arr);
  }

  const cards: FeedContentCard[] = [];
  for (const scope of ["domestic", "world"] as const) {
    const rows = (byScope.get(scope) ?? [])
      .sort((a, b) => b.score - a.score || Math.abs(b.change) - Math.abs(a.change))
      .slice(0, scope === "world" ? 3 : 2);
    if (rows.length === 0) continue;
    const facts = rows.map((row) => ({
      label: row.label,
      value: compactNumber(row.close) ? `${signedPct(row.change)} · ${compactNumber(row.close)}` : signedPct(row.change),
    }));
    cards.push({
      kind: "content",
      id: `content:index:${scope}`,
      contentType: "index",
      scope,
      headline: facts.map((fact) => `${fact.label} ${fact.value.split(" · ")[0]}`).join(", "),
      facts,
      source: "시장 지수",
      asOf: kstDate(),
    });
  }
  return cards;
}

function fredFactFromTitle(title: string): DeckContentFact | null {
  const clean = title.replace(/\s+/g, " ").trim();
  const match = clean.match(/^(.+?)\s+(-?\d+(?:\.\d+)?(?:%|원|달러)?)$/);
  if (!match) return null;
  return { label: match[1]!.trim(), value: match[2]!.trim() };
}

async function buildMacroContent(): Promise<FeedContentCard[]> {
  const [domestic, world] = await Promise.allSettled([
    withTimeout(
      fetchFredDocsForSeries(
        FRED_DOMESTIC_SERIES,
        (() => {
          let i = 0;
          return () => `fred-domestic-${++i}`;
        })()
      ),
      FRED_CONTENT_TIMEOUT_MS,
      []
    ),
    withTimeout(
      fetchFredDocsForSeries(
        FRED_WORLD_SERIES,
        (() => {
          let i = 0;
          return () => `fred-world-${++i}`;
        })()
      ),
      FRED_CONTENT_TIMEOUT_MS,
      []
    ),
  ]);
  const rows: Array<{ scope: Exclude<DeckContentScope, "global">; docs: Awaited<ReturnType<typeof fetchFredDocsForSeries>> }> = [
    { scope: "domestic", docs: domestic.status === "fulfilled" ? domestic.value : [] },
    { scope: "world", docs: world.status === "fulfilled" ? world.value : [] },
  ];
  const cards: FeedContentCard[] = [];
  for (const row of rows) {
    const facts = row.docs.map((doc) => fredFactFromTitle(doc.title)).filter((fact): fact is DeckContentFact => fact !== null).slice(0, 3);
    if (facts.length === 0) continue;
    cards.push({
      kind: "content",
      id: `content:macro:${row.scope}`,
      contentType: "macro",
      scope: row.scope,
      headline: facts.map((fact) => `${fact.label} ${fact.value}`).join(", "),
      facts,
      source: "FRED(미 연준)",
      asOf: row.docs[0]?.publishedAt?.slice(0, 10) ?? kstDate(),
    });
  }
  return cards;
}

function buildWhaleContent(whaleInput: Awaited<ReturnType<typeof fetchWhale>>, feedScores: ReadonlyMap<string, number>): FeedContentCard[] {
  const facts: DeckContentFact[] = [];
  const { marketCapChange24h, coins } = whaleInput;
  if (typeof marketCapChange24h === "number") facts.push({ label: "암호화폐 시총 24h", value: signedPct(marketCapChange24h) });
  const leadingCoins = (coins ?? [])
    .filter((coin) => typeof coin.change24h === "number")
    .map((coin) => ({
      label: coin.name,
      value: signedPct(coin.change24h as number),
      score: feedScores.get(`whale-${coin.symbol}`) ?? Math.min(0.59, Math.abs(coin.change24h as number) / 8),
    }))
    .sort((a, b) => b.score - a.score || Math.abs(Number.parseFloat(b.value)) - Math.abs(Number.parseFloat(a.value)))
    .slice(0, 2);
  facts.push(...leadingCoins.map(({ label, value }) => ({ label, value })));
  if (facts.length === 0) return [];
  return [
    {
      kind: "content",
      id: "content:whale:global",
      contentType: "whale",
      scope: "global",
      headline: facts.map((fact) => `${fact.label} ${fact.value}`).join(", "),
      facts,
      source: "CoinGecko",
      asOf: kstDate(),
    },
  ];
}

export async function GET() {
  const [macroQuotes, whaleInput, communityResult] = await Promise.allSettled([
    fetchMacro(),
    fetchWhale(),
    fetchCommunity(),
  ]);

  const raws: RawSignal[] = [];

  if (macroQuotes.status === "fulfilled") {
    for (const q of macroQuotes.value) {
      if (typeof q.change !== "number") continue;
      raws.push({
        id: `macro-${q.key}`,
        source: "macro",
        label: q.label,
        changePct: q.change,
        value: pct(q.change),
      });
    }
  } else {
    console.warn("[fomo/feed] macro error", macroQuotes.reason);
  }

  if (whaleInput.status === "fulfilled") {
    const { marketCapChange24h, coins } = whaleInput.value;
    if (typeof marketCapChange24h === "number") {
      raws.push({
        id: "whale-marketcap",
        source: "whale",
        label: "암호화폐 시장",
        changePct: marketCapChange24h,
        value: pct(marketCapChange24h),
      });
    }
    for (const c of coins ?? []) {
      if (typeof c.change24h === "number") {
        raws.push({
          id: `whale-${c.symbol}`,
          source: "whale",
          label: c.name,
          changePct: c.change24h,
          value: pct(c.change24h),
        });
      }
      if (typeof c.athChange === "number" && c.athChange <= DEEP_UNDERWATER) {
        raws.push({
          id: `whale-${c.symbol}-ath`,
          source: "whale",
          label: c.name,
          athChangePct: c.athChange,
          value: pct(c.athChange),
        });
      }
    }
  } else {
    console.warn("[fomo/feed] whale error", whaleInput.reason);
  }

  if (communityResult.status === "fulfilled") {
    for (const s of communityResult.value.sources) {
      raws.push({
        id: `community-${s.source}`,
        source: "community",
        label: "커뮤니티",
        bullishRatio: s.bullishRatio,
        mentions: s.postCount,
      });
    }
  } else {
    console.warn("[fomo/feed] community error", communityResult.reason);
  }

  const cards = buildFeedCards(raws);
  const feedScores = contentScoreFromFeed(cards);
  const content = [
    ...(macroQuotes.status === "fulfilled" ? buildIndexContent(macroQuotes.value, feedScores) : []),
    ...(await buildMacroContent().catch((err) => {
      console.warn("[fomo/feed] fred content error", err);
      return [] as FeedContentCard[];
    })),
    ...(whaleInput.status === "fulfilled" ? buildWhaleContent(whaleInput.value, feedScores) : []),
  ].slice(0, 6);
  const moods = feedCardsToMoodSignals(cards);

  // 엣지 캐시 — 외부 소스 레이트리밋 보호(배너와 동일 정책).
  return withCors(
    NextResponse.json(
      { cards, moods, content },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    )
  );
}

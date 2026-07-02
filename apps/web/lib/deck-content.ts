import { buildFeedCards, pct, type RawSignal } from "@fomo/core";
import { fetchMacro, fetchWhale } from "./fomo-market-sources";
import { fetchFredDocsForSeries } from "./fred";

const DEEP_UNDERWATER = -30;
const FRED_DOMESTIC_SERIES = ["DEXKOUS", "DGS10"] as const;
const FRED_WORLD_SERIES = ["DGS10", "VIXCLS"] as const;
const FRED_CONTENT_TIMEOUT_MS = 4_500;

export type DeckContentScope = "domestic" | "world" | "global";
export type DeckContentType = "macro" | "index" | "whale";

export interface DeckContentFact {
  label: string;
  value: string;
}

export interface DeckContentCard {
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

export function rawSignalsFromMacroQuotes(macroQuotes: Awaited<ReturnType<typeof fetchMacro>>): RawSignal[] {
  return macroQuotes.flatMap((quote) => {
    if (typeof quote.change !== "number") return [];
    return [{
      id: `macro-${quote.key}`,
      source: "macro",
      label: quote.label,
      changePct: quote.change,
      value: pct(quote.change),
    }];
  });
}

export function rawSignalsFromWhale(whaleInput: Awaited<ReturnType<typeof fetchWhale>>): RawSignal[] {
  const raws: RawSignal[] = [];
  const { marketCapChange24h, coins } = whaleInput;
  if (typeof marketCapChange24h === "number") {
    raws.push({
      id: "whale-marketcap",
      source: "whale",
      label: "암호화폐 시장",
      changePct: marketCapChange24h,
      value: pct(marketCapChange24h),
    });
  }
  for (const coin of coins ?? []) {
    if (typeof coin.change24h === "number") {
      raws.push({
        id: `whale-${coin.symbol}`,
        source: "whale",
        label: coin.name,
        changePct: coin.change24h,
        value: pct(coin.change24h),
      });
    }
    if (typeof coin.athChange === "number" && coin.athChange <= DEEP_UNDERWATER) {
      raws.push({
        id: `whale-${coin.symbol}-ath`,
        source: "whale",
        label: coin.name,
        athChangePct: coin.athChange,
        value: pct(coin.athChange),
      });
    }
  }
  return raws;
}

export function buildIndexContent(
  macroQuotes: Awaited<ReturnType<typeof fetchMacro>>,
  feedScores: ReadonlyMap<string, number>
): DeckContentCard[] {
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

  const cards: DeckContentCard[] = [];
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

export async function buildMacroContent(): Promise<DeckContentCard[]> {
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
  const cards: DeckContentCard[] = [];
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

export function buildWhaleContent(
  whaleInput: Awaited<ReturnType<typeof fetchWhale>>,
  feedScores: ReadonlyMap<string, number>
): DeckContentCard[] {
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

export function buildDeckContentCardsFromSources({
  macroQuotes,
  whaleInput,
}: {
  macroQuotes?: Awaited<ReturnType<typeof fetchMacro>>;
  whaleInput?: Awaited<ReturnType<typeof fetchWhale>>;
}): DeckContentCard[] {
  const raws = [
    ...(macroQuotes ? rawSignalsFromMacroQuotes(macroQuotes) : []),
    ...(whaleInput ? rawSignalsFromWhale(whaleInput) : []),
  ];
  const feedScores = contentScoreFromFeed(buildFeedCards(raws));
  return [
    ...(macroQuotes ? buildIndexContent(macroQuotes, feedScores) : []),
    ...(whaleInput ? buildWhaleContent(whaleInput, feedScores) : []),
  ];
}

export async function fetchDeckContentCards(): Promise<DeckContentCard[]> {
  const [macroQuotes, whaleInput] = await Promise.allSettled([fetchMacro(), fetchWhale()]);
  const sourceContent = buildDeckContentCardsFromSources({
    ...(macroQuotes.status === "fulfilled" ? { macroQuotes: macroQuotes.value } : {}),
    ...(whaleInput.status === "fulfilled" ? { whaleInput: whaleInput.value } : {}),
  });
  const macroContent = await buildMacroContent().catch((err) => {
    console.warn("[deck-content] fred content error", err);
    return [] as DeckContentCard[];
  });
  return [...sourceContent, ...macroContent].filter((card) => card.headline.trim().length > 0 && card.facts.length > 0);
}

function contentScopeMatches(scope: DeckContentScope, target: DeckContentScope): boolean {
  if (scope === target) return true;
  return scope === "global" && (target === "domestic" || target === "world");
}

function contentTypePriority(type: DeckContentType): number {
  switch (type) {
    case "index":
      return 0;
    case "macro":
      return 1;
    case "whale":
      return 2;
  }
}

function factCardId(baseId: string, fact: DeckContentFact, index: number): string {
  return `${baseId}:fact:${index}:${fact.label
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)}`;
}

function splitFactCards(card: DeckContentCard): DeckContentCard[] {
  if (card.facts.length <= 1) return [];
  return card.facts.map((fact, index) => ({
    ...card,
    id: factCardId(card.id, fact, index),
    headline: `${fact.label} ${fact.value}`,
    facts: [fact],
  }));
}

export function expandDeckContentCardsForScope(
  cards: readonly DeckContentCard[],
  scope: DeckContentScope,
  limit: number
): DeckContentCard[] {
  if (limit <= 0) return [];
  const scoped = cards
    .filter((card) => card.kind === "content" && contentScopeMatches(card.scope, scope))
    .filter((card) => card.headline.trim().length > 0 && card.facts.length > 0)
    .sort((a, b) => contentTypePriority(a.contentType) - contentTypePriority(b.contentType) || a.id.localeCompare(b.id));
  const expanded = [...scoped, ...scoped.flatMap(splitFactCards)];
  const seen = new Set<string>();
  const out: DeckContentCard[] = [];
  for (const card of expanded) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}

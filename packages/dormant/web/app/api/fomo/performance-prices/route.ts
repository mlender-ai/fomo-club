import { NextResponse } from "next/server";
import { withCors } from "../../../../lib/fomo";
import { assembleStockFront } from "../../../../lib/stock-front";
import { usSymbolForStock } from "../../../../lib/us-symbols";
import type { StockCountry, StockMarket } from "@fomo/core";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const YAHOO_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_ITEMS = 40;

interface PriceRequestItem {
  stock: string;
  symbol?: string;
  naverCode?: string;
  market?: StockMarket;
  country?: StockCountry;
}

interface PriceResponseItem {
  stock: string;
  yahooSymbol: string;
  currentPrice: number;
  asOf: string;
}

function yahooSymbolFor(item: PriceRequestItem): string | null {
  const rawSymbol = item.symbol?.trim().toUpperCase();
  if (item.country === "US" || item.market === "NASDAQ" || item.market === "NYSE") {
    if (rawSymbol) return rawSymbol;
    // WO-P1 — 넘긴 카드가 symbol 없이 적재된 레코드("현재가 없음"의 원인): 한글 종목명으로 티커 역해석.
    const resolved = usSymbolForStock(item.stock);
    if (resolved) return resolved.toUpperCase();
    const ascii = item.stock.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    return ascii || null;
  }
  const code = item.naverCode?.trim() || (/^\d{6}$/.test(rawSymbol ?? "") ? rawSymbol : "");
  if (code && item.market === "KOSDAQ") return `${code}.KQ`;
  if (code && item.market === "KOSPI") return `${code}.KS`;
  // 국적·시장 정보가 유실된 레코드 — 한글명이 미국주 큐레이션에 있으면 US 로 취급(듀오링고·루시드 등).
  const resolved = usSymbolForStock(item.stock);
  if (resolved) return resolved.toUpperCase();
  return null;
}

async function fetchYahooPrice(yahooSymbol: string): Promise<{ currentPrice: number; asOf: string } | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=3mo&interval=1d`;
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": YAHOO_UA },
        signal: AbortSignal.timeout(7_000),
        next: { revalidate: 600 },
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        chart?: {
          result?: {
            meta?: { regularMarketPrice?: number };
            timestamp?: number[];
            indicators?: { quote?: { close?: (number | null)[] }[] };
          }[];
        };
      };
      const result = payload.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close?.filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
      );
      const currentPrice =
        typeof result?.meta?.regularMarketPrice === "number" && result.meta.regularMarketPrice > 0
          ? result.meta.regularMarketPrice
          : closes?.at(-1);
      if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice) || currentPrice <= 0) continue;
      const lastTs = result?.timestamp?.at(-1);
      return {
        currentPrice,
        asOf: lastTs ? new Date(lastTs * 1000).toISOString() : new Date().toISOString(),
      };
    } catch {
      // Try the next Yahoo host.
    }
  }
  return null;
}

function parsePriceText(text: string | undefined): number | null {
  if (!text) return null;
  const raw = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/u)?.[0];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchStockFrontFallback(item: PriceRequestItem): Promise<{ currentPrice: number; asOf: string } | null> {
  try {
    const front = await assembleStockFront(item.stock, {}, {}, {
      lite: true,
      ...(item.naverCode ? { naverCode: item.naverCode } : {}),
      ...(item.symbol ? { symbol: item.symbol } : {}),
    });
    const currentPrice = parsePriceText(front.priceText);
    if (!currentPrice) return null;
    return { currentPrice, asOf: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.all(chunk.map(worker))));
  }
  return out;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { items?: PriceRequestItem[] };
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    // WO-P1 — 심볼 역해석에 실패해도 항목을 버리지 않는다(그게 "현재가 없음"의 직접 원인이었다).
    // 종목명 기반 stock-front 폴백까지 시도한 뒤에만 포기한다.
    const jobs = items
      .filter((item) => !!item.stock)
      .map((item) => ({ item, yahooSymbol: yahooSymbolFor(item) }));

    const rows = await mapLimit(jobs, 5, async ({ item, yahooSymbol }): Promise<PriceResponseItem | null> => {
      const price = (yahooSymbol ? await fetchYahooPrice(yahooSymbol) : null) ?? (await fetchStockFrontFallback(item));
      if (!price) return null;
      return { stock: item.stock, yahooSymbol: yahooSymbol ?? item.stock, ...price };
    });

    const prices = Object.fromEntries(
      rows
        .filter((row): row is PriceResponseItem => row !== null)
        .map((row) => [
          row.stock,
          {
            yahooSymbol: row.yahooSymbol,
            currentPrice: row.currentPrice,
            asOf: row.asOf,
          },
        ])
    );

    return withCors(
      NextResponse.json(
        { prices },
        {
          headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
        }
      )
    );
  } catch {
    return withCors(NextResponse.json({ prices: {} }, { status: 200 }));
  }
}

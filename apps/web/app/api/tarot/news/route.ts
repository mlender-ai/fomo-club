import { NextRequest, NextResponse } from "next/server";

const YAHOO_RSS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const USER_AGENT = "Mozilla/5.0 (compatible; TarotStockBot/1.0)";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10분 캐시
const cache = new Map<string, { data: NewsItem[]; expiresAt: number }>();

interface NewsItem {
  title: string;
  description: string;
  summary: string;
  link: string;
  publishedAt: string;
  source: string;
  category: string;
}

const CATEGORY_KEYWORDS: Array<{ keywords: RegExp; category: string }> = [
  { keywords: /\b(earnings|revenue|profit|guidance|eps|quarterly|results)\b/i, category: "실적" },
  { keywords: /\b(merger|acquisition|deal|buyout|takeover|m&a)\b/i, category: "M&A" },
  { keywords: /\b(upgrade|downgrade|rating|price target|analyst)\b/i, category: "애널리스트" },
  { keywords: /\b(dividend|buyback|split|payout)\b/i, category: "주주환원" },
  { keywords: /\b(ceo|cfo|executive|leadership|board)\b/i, category: "경영진" },
  { keywords: /\b(lawsuit|sec|investigation|fine|regulation|fda|approval)\b/i, category: "규제/소송" },
  { keywords: /\b(ai|chip|semiconductor|cloud|tech|software|app)\b/i, category: "기술" },
  { keywords: /\b(fed|inflation|rate|economy|gdp|jobs|cpi)\b/i, category: "거시경제" },
];

function inferCategory(title: string, description: string, rawCategory: string): string {
  if (rawCategory) return rawCategory;
  const blob = `${title} ${description}`;
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.test(blob)) return category;
  }
  return "시장";
}

// pubDate가 비정상 포맷이면 Invalid Date → toISOString() 예외. 안전하게 변환.
function safePublishedAt(pubDate: string): string {
  if (!pubDate) return new Date().toISOString();
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parseYahooRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>(); // link 기준 중복 기사 제거
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const description = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      ?? block.match(/<description>(.*?)<\/description>/)?.[1]
      ?? "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
    const source = block.match(/<source[^>]*>(.*?)<\/source>/)?.[1]
      ?? block.match(/<source[^>]*url="([^"]*)".*?<\/source>/)?.[1]
      ?? "Yahoo Finance";
    const rawCategory = block.match(/<category><!\[CDATA\[(.*?)\]\]><\/category>/)?.[1]
      ?? block.match(/<category>(.*?)<\/category>/)?.[1]
      ?? "";

    const cleanTitle = title.trim();
    const cleanLink = link.trim();
    // 필수 필드(title/link) 결측 항목 제외 — 깨진 카드가 사용자에게 노출되지 않도록
    if (!cleanTitle || !cleanLink) continue;
    // 동일 link 중복 기사 제거
    if (seen.has(cleanLink)) continue;
    seen.add(cleanLink);

    const cleanDescription = description.replace(/<[^>]*>/g, "").trim().slice(0, 200);
    items.push({
      title: cleanTitle,
      description: cleanDescription,
      summary: cleanDescription,
      link: cleanLink,
      publishedAt: safePublishedAt(pubDate),
      source: source.trim() || "Yahoo Finance",
      category: inferCategory(cleanTitle, cleanDescription, rawCategory.trim()),
    });
  }
  return items;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "10"), 20);

  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json({ items: hit.data.slice(0, limit) });
  }

  try {
    const url = new URL(YAHOO_RSS_URL);
    url.searchParams.set("s", symbol);
    url.searchParams.set("region", "US");
    url.searchParams.set("lang", "en-US");

    const res = await fetch(url.toString(), {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json({ items: [] });
    }

    const xml = await res.text();
    const items = parseYahooRss(xml);

    cache.set(symbol, { data: items, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json({ items: items.slice(0, limit) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

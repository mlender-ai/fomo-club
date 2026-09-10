import {
  STOCK_VOCAB,
  extractStocks,
  fetchCommunity,
  isFrontHookSafe,
  signalsFromBasics,
  stockMentionRole,
  stocksBySector,
  type StockSector,
  type KeywordSourceItem,
} from "@fomo/core";
import { fetchAllNews } from "./fomo-news-sources";
import { fetchStockBasics } from "./stock-basics";

export interface StockAttentionSignal {
  mentionCount: number;
  mentionScore: number;
  newsEventLabel?: string;
  newsEventSource?: string;
}

export interface ThemeRelativeSignal {
  themeLabel: StockSector;
  themeRelativeRank: number;
  themePeerCount: number;
  themeAverageChangePct: number;
  themeRelativeChangePct: number;
}

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function newsToItems(news: Awaited<ReturnType<typeof fetchAllNews>>): KeywordSourceItem[] {
  return news.map((a) => ({
    title: a.title,
    ...(a.summary ? { summary: a.summary } : {}),
    ...(a.url ? { url: a.url } : {}),
    publishedAt: a.publishedAt,
    source: a.source,
    lang: a.lang,
  }));
}

function codeToCanonical(): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of STOCK_VOCAB) {
    if (s.naverCode) out.set(s.naverCode, s.canonical);
  }
  return out;
}

const NEWS_EVENT_NOISE =
  /인기검색|검색\s?순위|주요\s?뉴스|오늘의\s?증시|마감\s?시황|장중\s?시황|특징주\s?모음|주식\s?초고수|초고수|단타|ETF|ETN|상장지수|레버리지|인버스|TOP\s?\d|상위\s?\d/i;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanNewsEventTitle(title: string): string | undefined {
  const cleaned = decodeHtmlEntities(title)
    .replace(/^\s*(?:\[[^\]]+\]|【[^】]+】|\([^)]*\))\s*/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?。]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 6 || NEWS_EVENT_NOISE.test(cleaned)) return undefined;
  if (/[\[\]{}<>]/.test(cleaned)) return undefined;
  const compact = cleaned.length > 44 ? `${cleaned.slice(0, 42).trim()}…` : cleaned;
  return isFrontHookSafe(`${compact} 소식이 나왔어요.`) ? compact : undefined;
}

function buildNewsEventMap(newsItems: readonly KeywordSourceItem[], canonicals: Iterable<string>): Map<string, { label: string; source?: string }> {
  const out = new Map<string, { label: string; source?: string }>();
  for (const canonical of canonicals) {
    for (const item of newsItems) {
      if (stockMentionRole(canonical, item) !== "primary") continue;
      const label = cleanNewsEventTitle(item.title);
      if (!label) continue;
      out.set(canonical, {
        label,
        ...(item.source ? { source: item.source } : {}),
      });
      break;
    }
  }
  return out;
}

/**
 * 오늘 원문 기반 종목 언급 지도.
 * 뉴스 제목/요약 + 커뮤니티 소스 글 수만 사용하며, 결과는 FOMO 주목축(attention)에만 들어간다.
 */
export async function computeStockAttentionSignals(): Promise<Record<string, StockAttentionSignal>> {
  const [newsResult, communityResult] = await Promise.allSettled([fetchAllNews(), fetchCommunity()]);
  const counts = new Map<string, number>();
  let newsItems: KeywordSourceItem[] = [];

  if (newsResult.status === "fulfilled") {
    newsItems = newsToItems(newsResult.value);
    for (const s of extractStocks(newsItems, { minMentions: 1 })) {
      counts.set(s.canonical, (counts.get(s.canonical) ?? 0) + s.mentions);
    }
  } else {
    console.warn("[stock-signal-coverage] news attention skipped", newsResult.reason);
  }

  if (communityResult.status === "fulfilled") {
    const byCode = codeToCanonical();
    for (const s of communityResult.value.sources) {
      const m = s.source.match(/^naver\/(\d{6})$/);
      const canonical = m ? byCode.get(m[1]!) : undefined;
      if (!canonical) continue;
      counts.set(canonical, (counts.get(canonical) ?? 0) + Math.max(0, s.postCount));
    }
  } else {
    console.warn("[stock-signal-coverage] community attention skipped", communityResult.reason);
  }

  const max = Math.max(0, ...counts.values());
  if (max <= 0) return {};

  const out: Record<string, StockAttentionSignal> = {};
  const newsEvents = buildNewsEventMap(newsItems, counts.keys());
  for (const [canonical, mentionCount] of counts) {
    const event = newsEvents.get(canonical);
    out[canonical] = {
      mentionCount,
      mentionScore: clamp100((mentionCount / max) * 100),
      ...(event ? { newsEventLabel: event.label, ...(event.source ? { newsEventSource: event.source } : {}) } : {}),
    };
  }
  return out;
}

/**
 * 섹터 안 상대 등락 지도.
 * 같은 큐레이션 섹터의 baseline 가능 종목만 비교한다. 데이터 부족 종목은 생략한다.
 */
export async function computeThemeRelativeSignals(
  sector: StockSector
): Promise<Record<string, ThemeRelativeSignal>> {
  const peers = stocksBySector(sector, { requireNaverCode: true });
  const rows = (
    await Promise.all(
      peers.map(async (p) => {
        const basics = await fetchStockBasics(p.canonical).catch(() => null);
        const changePct = basics ? signalsFromBasics(basics).changePct : undefined;
        return typeof changePct === "number" ? { canonical: p.canonical, changePct } : null;
      })
    )
  ).filter((r): r is { canonical: string; changePct: number } => r !== null);

  if (rows.length < 3) return {};

  const avg = rows.reduce((s, r) => s + r.changePct, 0) / rows.length;
  const sorted = [...rows].sort((a, b) => b.changePct - a.changePct || a.canonical.localeCompare(b.canonical));
  const out: Record<string, ThemeRelativeSignal> = {};
  sorted.forEach((r, i) => {
    out[r.canonical] = {
      themeLabel: sector,
      themeRelativeRank: i + 1,
      themePeerCount: sorted.length,
      themeAverageChangePct: round1(avg),
      themeRelativeChangePct: round1(r.changePct - avg),
    };
  });
  return out;
}

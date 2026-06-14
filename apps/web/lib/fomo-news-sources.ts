import {
  parseNaverNews,
  parseRssFeed,
  parseYahooRss,
  type NaverNewsRaw,
  type NewsSource,
  type RawArticle,
  type SourceTier,
} from "@fomo/core";

/** 파싱 결과 기사들에 tier 를 부착(수집 레이어 메타). */
function withTier(articles: RawArticle[], tier: SourceTier): RawArticle[] {
  return articles.map((a) => ({ ...a, tier }));
}

/**
 * FOMO 뉴스 소스 — 실제 기사 수집. docs/PIVOT_FEED_FIRST.md.
 *
 * Yahoo Finance RSS(영문) + 한국 금융 뉴스 RSS(한국경제·매일경제). 한국어 기사는 그대로 한국어로
 * 노출(번역 불요), 영문과 한 피드에 섞여 FOMO 점수순 정렬된다(점수기는 영/한 키워드 둘 다 봄).
 * NewsSource 인터페이스로 소스를 추가하면 같은 파이프라인(점수/정렬/dedupe)에 합류.
 * 파싱/점수/정렬은 @fomo/core/news-feed 순수부가 담당(테스트 보장).
 */

const YAHOO_RSS = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";
// 한국 뉴스 RSS는 봇 UA를 막는 경우가 있어 일반 브라우저 UA 사용.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// FOMO를 부르는 고관심 종목 — 국내 리테일이 자주 좇는 미국 대형 테크/코인 프록시.
// (한국어 소스 추가 전까지 영문 기사 유니버스. 종목은 운영 중 조정 가능.)
const SYMBOLS = ["NVDA", "TSLA", "AAPL", "AMD", "AVGO", "PLTR", "COIN", "MSTR"];

/** 한 심볼의 Yahoo RSS → RawArticle[]. 실패 시 빈 배열(부분 실패 허용). */
async function fetchYahooSymbol(symbol: string, nowIso: string): Promise<RawArticle[]> {
  try {
    const url = new URL(YAHOO_RSS);
    url.searchParams.set("s", symbol);
    url.searchParams.set("region", "US");
    url.searchParams.set("lang", "en-US");
    const res = await fetch(url.toString(), {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml" },
      signal: AbortSignal.timeout(8_000),
      // 10분 데이터 캐시 — Yahoo 레이트리밋 보호.
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseYahooRss(xml, { symbol, nowIso, lang: "en" });
  } catch (err) {
    console.warn(`[fomo/news] yahoo ${symbol} error`, err);
    return [];
  }
}

/**
 * Yahoo Finance 뉴스 소스 — 심볼 유니버스를 병렬 수집해 합산.
 * [비활성] 피드는 한국 뉴스 우선 구성으로 전환(2026-06-12). Yahoo는 차트/지수(fomo-market-sources)
 * 용도로만 남긴다. 영문 뉴스가 다시 필요하면 NEWS_SOURCES 에 yahooSource 를 추가.
 */
export const yahooSource: NewsSource = {
  id: "yahoo",
  lang: "en",
  enabled: false,
  async fetch() {
    const nowIso = new Date().toISOString();
    const settled = await Promise.allSettled(SYMBOLS.map((s) => fetchYahooSymbol(s, nowIso)));
    const out: RawArticle[] = [];
    for (const r of settled) if (r.status === "fulfilled") out.push(...r.value);
    return out;
  },
};

// ───────────────────────── 한국 금융 뉴스 RSS ─────────────────────────
// 증권/금융/시황 초점 피드(Node fetch 200 확인). 표준 RSS 2.0 → parseRssFeed.
// C-1(DATA_ENGINE_STRATEGY §4.5): 매경 쏠림 해결 — 연합·한경·파이낸셜뉴스·연합인포맥스로 다양화.
// 전부 news-mid tier(공식 데이터 FRED=official-high 는 C-2). 죽은 피드는 fetch 실패 시 [] 로 degrade.
const KR_FEEDS: { id: string; url: string; source: string; tier: SourceTier }[] = [
  { id: "hankyung", url: "https://www.hankyung.com/feed/finance", source: "한국경제", tier: "news-mid" },
  { id: "mk", url: "https://www.mk.co.kr/rss/50200011/", source: "매일경제", tier: "news-mid" },
  { id: "yna", url: "https://www.yna.co.kr/rss/market.xml", source: "연합뉴스", tier: "news-mid" },
  { id: "yna-econ", url: "https://www.yna.co.kr/rss/economy.xml", source: "연합뉴스", tier: "news-mid" },
  { id: "fnnews", url: "https://www.fnnews.com/rss/r20/fn_realnews_stock.xml", source: "파이낸셜뉴스", tier: "news-mid" },
  { id: "einfomax", url: "https://news.einfomax.co.kr/rss/S1N2.xml", source: "연합인포맥스", tier: "news-mid" },
];

// ───────────────────────── 네이버 금융 뉴스 (JSON) ─────────────────────────
// 해외 증시 실시간 뉴스(이미 한국어). api.stock.naver.com/news/worldNews.
const NAVER_NEWS_URL = "https://api.stock.naver.com/news/worldNews?pageSize=20&page=1";

export const naverNewsSource: NewsSource = {
  id: "naver",
  lang: "ko",
  enabled: true,
  async fetch() {
    try {
      const res = await fetch(NAVER_NEWS_URL, {
        headers: { accept: "application/json", "user-agent": BROWSER_UA },
        signal: AbortSignal.timeout(8_000),
        next: { revalidate: 600 },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as NaverNewsRaw[];
      // 네이버 worldNews = 해외 증시 뉴스(한국어 번역) — 외신 채널. news-mid.
      return withTier(parseNaverNews(Array.isArray(json) ? json : [], new Date().toISOString()), "news-mid");
    } catch (err) {
      console.warn("[fomo/news] naver error", err);
      return [];
    }
  },
};

/** 한국 RSS 피드 1개 → 한국어 RawArticle[]. 실패 시 빈 배열. */
function makeKoreanRssSource({ id, url, source, tier }: (typeof KR_FEEDS)[number]): NewsSource {
  return {
    id,
    lang: "ko",
    enabled: true,
    async fetch() {
      try {
        const res = await fetch(url, {
          headers: { accept: "application/rss+xml, application/xml, text/xml", "user-agent": BROWSER_UA },
          signal: AbortSignal.timeout(8_000),
          next: { revalidate: 600 },
        });
        if (!res.ok) return [];
        const xml = await res.text();
        return withTier(parseRssFeed(xml, { source, lang: "ko", nowIso: new Date().toISOString() }), tier);
      } catch (err) {
        console.warn(`[fomo/news] ${id} error`, err);
        return [];
      }
    },
  };
}

/**
 * 등록된 뉴스 소스 — 확장 지점. 영문(Yahoo) + 한국어(한경/매경/연합/네이버).
 * 소스 추가 시 이 배열에 NewsSource 구현을 넣으면 같은 파이프라인에 합류.
 */
// 한국 뉴스 우선 구성 — Yahoo(영문)는 차트 전용이라 피드에서 제외(yahooSource.enabled=false).
export const NEWS_SOURCES: readonly NewsSource[] = [
  yahooSource,
  naverNewsSource,
  ...KR_FEEDS.map(makeKoreanRssSource),
];

/** 모든 enabled 소스를 병렬 수집해 정규화 기사 배열로 합산. */
export async function fetchAllNews(): Promise<RawArticle[]> {
  const enabled = NEWS_SOURCES.filter((s) => s.enabled);
  const settled = await Promise.allSettled(enabled.map((s) => s.fetch()));
  const out: RawArticle[] = [];
  for (const r of settled) if (r.status === "fulfilled") out.push(...r.value);
  return out;
}

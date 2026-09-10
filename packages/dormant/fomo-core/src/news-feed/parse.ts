import type { NewsLang, RawArticle } from "./types";

/**
 * Yahoo Finance RSS XML → RawArticle[] (순수 파서, 테스트 보장).
 * docs/PIVOT_FEED_FIRST.md. 타로 news 라우트의 파서와 독립(타로 코드 미접촉 원칙).
 *
 * 한국어 소스(네이버/연합 RSS)를 붙일 때도 같은 RawArticle 로 정규화하면 점수기·피드를 공유한다.
 */

const CATEGORY_KEYWORDS: { re: RegExp; category: string }[] = [
  { re: /\b(earnings|revenue|profit|guidance|eps|quarterly|results)\b/i, category: "실적" },
  { re: /\b(merger|acquisition|deal|buyout|takeover|m&a)\b/i, category: "M&A" },
  { re: /\b(upgrade|downgrade|rating|price target|analyst)\b/i, category: "애널리스트" },
  { re: /\b(dividend|buyback|split|payout)\b/i, category: "주주환원" },
  { re: /\b(lawsuit|sec|investigation|fine|regulation|fda|approval)\b/i, category: "규제/소송" },
  { re: /\b(ai|chip|semiconductor|cloud|software)\b/i, category: "기술" },
  { re: /\b(fed|inflation|rate|economy|gdp|jobs|cpi)\b/i, category: "거시경제" },
];

function inferCategory(title: string, description: string, raw: string): string {
  if (raw) return raw;
  const blob = `${title} ${description}`;
  for (const { re, category } of CATEGORY_KEYWORDS) if (re.test(blob)) return category;
  return "시장";
}

/** pubDate 비정상 → 현재 시각 대신 빈 값 처리는 호출부에서. 여기선 ISO 또는 원문 반환. */
function toIso(pubDate: string): string {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** 안정 id — url 기반 슬러그. */
function slugId(url: string): string {
  return `news-${url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`;
}

function decodeHtmlText(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}

/**
 * 범용 RSS 2.0 파서 — 한국 금융 뉴스(한경/매경/연합 등) 정규화용.
 * 표준 <item>(title/link/description/pubDate)만 본다. category 영문 추론 없음(한국어 소스).
 * source(출처명)·lang 은 호출부가 지정. 같은 RawArticle 로 정규화되어 점수기·피드를 공유.
 */
export function parseRssFeed(
  xml: string,
  opts: { source: string; lang: NewsLang; nowIso: string }
): RawArticle[] {
  const { source, lang, nowIso } = opts;
  const items: RawArticle[] = [];
  const seen = new Set<string>();
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const title =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ??
      "";
    // link: <link>url</link> 또는 일부 피드의 <link ...>url</link>
    const link =
      block.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/)?.[1] ??
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ??
      "";
    const description =
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ??
      block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ??
      "";
    const pubDate =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ??
      block.match(/<dc:date>([\s\S]*?)<\/dc:date>/)?.[1] ??
      "";

    const cleanTitle = title.replace(/<[^>]*>/g, "").trim();
    const cleanLink = link.trim();
    if (!cleanTitle || !cleanLink) continue;
    if (seen.has(cleanLink)) continue;
    seen.add(cleanLink);

    const cleanDesc = description.replace(/<[^>]*>/g, "").trim().slice(0, 200);
    items.push({
      id: slugId(cleanLink),
      title: cleanTitle,
      url: cleanLink,
      source,
      publishedAt: toIso(pubDate) || nowIso,
      lang,
      ...(cleanDesc ? { summary: cleanDesc } : {}),
    });
  }
  return items;
}

/** 네이버 금융 뉴스 JSON 1건. (api.stock.naver.com/news/*) */
export interface NaverNewsRaw {
  tit?: string;
  subcontent?: string;
  oid?: string;
  aid?: string;
  /** 언론사명. */
  ohnm?: string;
  /** "YYYYMMDDHHmmss" (KST). */
  dt?: string;
}

/** 네이버 종목별 뉴스 JSON 1그룹. (api.stock.naver.com/news/stock/{code}) */
export interface NaverStockNewsRawGroup {
  total?: number;
  items?: Array<{
    officeId?: string;
    articleId?: string;
    officeName?: string;
    /** "YYYYMMDDHHmm" (KST). */
    datetime?: string;
    title?: string;
    titleFull?: string;
    body?: string;
    mobileNewsUrl?: string;
  }>;
}

/** "YYYYMMDDHHmmss"(KST) → ISO. 실패 시 빈 문자열. */
function naverDtToIso(dt: string | undefined): string {
  if (!dt || !/^\d{14}$/.test(dt)) return "";
  const [y, mo, d, h, mi, s] = [
    dt.slice(0, 4), dt.slice(4, 6), dt.slice(6, 8), dt.slice(8, 10), dt.slice(10, 12), dt.slice(12, 14),
  ];
  const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
}

function naverStockDtToIso(dt: string | undefined): string {
  if (!dt || !/^\d{12}$/.test(dt)) return "";
  return naverDtToIso(`${dt}00`);
}

/**
 * 네이버 금융 뉴스 JSON → RawArticle[]. 이미 한국어(국내·해외 모두 한국어 번역 제공).
 * 본문 요약(subcontent)은 길어서 잘라 담는다. URL은 표준 n.news.naver.com 패턴.
 */
export function parseNaverNews(items: NaverNewsRaw[], nowIso: string): RawArticle[] {
  const out: RawArticle[] = [];
  const seen = new Set<string>();
  for (const it of items ?? []) {
    const title = decodeHtmlText((it.tit ?? "").replace(/<[^>]*>/g, "")).trim();
    if (!title || !it.oid || !it.aid) continue;
    const url = `https://n.news.naver.com/mnews/article/${it.oid}/${it.aid}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const summary = decodeHtmlText((it.subcontent ?? "").replace(/<[^>]*>/g, "").replace(/\*\*/g, ""))
      .trim()
      .slice(0, 160);
    out.push({
      id: slugId(url),
      title,
      url,
      source: it.ohnm?.trim() || "네이버 금융",
      publishedAt: naverDtToIso(it.dt) || nowIso,
      lang: "ko",
      ...(summary ? { summary } : {}),
    });
  }
  return out;
}

/** 네이버 종목별 뉴스 JSON → RawArticle[]. 종목 뎁스 원문 근거 보강용. */
export function parseNaverStockNews(groups: NaverStockNewsRawGroup[], nowIso: string): RawArticle[] {
  const out: RawArticle[] = [];
  const seen = new Set<string>();
  for (const group of groups ?? []) {
    for (const it of group.items ?? []) {
      const title = decodeHtmlText((it.titleFull || it.title || "").replace(/<[^>]*>/g, "")).trim();
      if (!title) continue;
      const url =
        it.mobileNewsUrl ||
        (it.officeId && it.articleId
          ? `https://n.news.naver.com/mnews/article/${it.officeId}/${it.articleId}`
          : "");
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const summary = decodeHtmlText((it.body ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " "))
        .trim()
        .slice(0, 200);
      out.push({
        id: slugId(url),
        title,
        url,
        source: it.officeName?.trim() || "네이버 금융",
        publishedAt: naverStockDtToIso(it.datetime) || nowIso,
        lang: "ko",
        ...(summary ? { summary } : {}),
      });
    }
  }
  return out;
}

export function parseYahooRss(
  xml: string,
  opts: { symbol?: string; nowIso: string; lang?: NewsLang } = { nowIso: "" }
): RawArticle[] {
  const { symbol, nowIso, lang = "en" } = opts;
  const items: RawArticle[] = [];
  const seen = new Set<string>();
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const title =
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
      block.match(/<title>(.*?)<\/title>/)?.[1] ??
      "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const description =
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ??
      block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ??
      "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
    const source =
      block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? "Yahoo Finance";
    const rawCategory =
      block.match(/<category><!\[CDATA\[(.*?)\]\]><\/category>/)?.[1] ??
      block.match(/<category>(.*?)<\/category>/)?.[1] ??
      "";

    const cleanTitle = title.trim();
    const cleanLink = link.trim();
    if (!cleanTitle || !cleanLink) continue; // 필수 결측 제외
    if (seen.has(cleanLink)) continue;
    seen.add(cleanLink);

    const cleanDesc = description.replace(/<[^>]*>/g, "").trim().slice(0, 200);
    items.push({
      id: slugId(cleanLink),
      title: cleanTitle,
      url: cleanLink,
      source: source.trim() || "Yahoo Finance",
      publishedAt: toIso(pubDate) || nowIso,
      category: inferCategory(cleanTitle, cleanDesc, rawCategory.trim()),
      lang,
      ...(cleanDesc ? { summary: cleanDesc } : {}),
      ...(symbol ? { symbol } : {}),
    });
  }
  return items;
}

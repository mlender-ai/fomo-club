import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 검증 항목 (Backend 이슈 #237 — 뉴스 메타데이터 확장):
//   1. symbol 누락 → 400
//   2. 정상 RSS 파싱 — title/link/summary/description/category/source/publishedAt 필수 필드 채워짐
//   3. <source> 태그 부재 → "Yahoo Finance" 폴백
//   4. <category> 태그 부재 → 키워드 기반 자동 분류 ("실적"/"M&A" 등)
//   5. summary == description (별칭, 후방 호환)
//   6. CDATA 래핑된 카테고리 정상 추출

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET } from "@/app/api/tarot/news/route";
import { NextRequest } from "next/server";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function rssItem(opts: {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  source?: string;
  category?: string;
  cdataCategory?: string;
}): string {
  const parts: string[] = ["<item>"];
  parts.push(`<title><![CDATA[${opts.title}]]></title>`);
  parts.push(`<link>${opts.link}</link>`);
  parts.push(`<description><![CDATA[${opts.description}]]></description>`);
  if (opts.pubDate) parts.push(`<pubDate>${opts.pubDate}</pubDate>`);
  if (opts.source) parts.push(`<source url="https://example.com">${opts.source}</source>`);
  if (opts.category) parts.push(`<category>${opts.category}</category>`);
  if (opts.cdataCategory) parts.push(`<category><![CDATA[${opts.cdataCategory}]]></category>`);
  parts.push("</item>");
  return parts.join("");
}

function buildRss(items: string[]): string {
  return `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/tarot/news (메타데이터 확장)", () => {
  it("symbol 누락 → 400", async () => {
    const res = await GET(makeRequest("http://localhost/api/tarot/news"));
    expect(res.status).toBe(400);
  });

  it("정상 응답 — title/link/summary/description/category/source/publishedAt 모두 채워짐", async () => {
    const xml = buildRss([
      rssItem({
        title: "Apple beats Q4 earnings expectations",
        link: "https://example.com/aapl-earnings",
        description: "Apple reported strong quarterly revenue.",
        pubDate: "Mon, 27 May 2026 12:00:00 GMT",
        source: "Yahoo Finance",
        category: "Finance",
      }),
    ]);

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => xml });

    const res = await GET(makeRequest("http://localhost/api/tarot/news?symbol=AAPL"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.title).toBe("Apple beats Q4 earnings expectations");
    expect(item.link).toBe("https://example.com/aapl-earnings");
    expect(item.summary).toBe("Apple reported strong quarterly revenue.");
    expect(item.description).toBe(item.summary); // 별칭 일치
    expect(item.source).toBe("Yahoo Finance");
    expect(item.category).toBe("Finance"); // RSS 카테고리 우선
    expect(item.publishedAt).toMatch(/^2026-05-27/);
  });

  it("<source> 태그 부재 → 'Yahoo Finance' 폴백", async () => {
    const xml = buildRss([
      rssItem({
        title: "Test",
        link: "https://example.com/x",
        description: "desc",
      }),
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => xml });

    const res = await GET(makeRequest("http://localhost/api/tarot/news?symbol=NOSRC"));
    const body = await res.json();
    expect(body.items[0].source).toBe("Yahoo Finance");
  });

  it("<category> 부재 + 제목에 'earnings' → 자동 분류 '실적'", async () => {
    const xml = buildRss([
      rssItem({
        title: "Nvidia quarterly earnings beat analyst estimates",
        link: "https://example.com/nvda",
        description: "Revenue jumped 20%.",
      }),
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => xml });

    const res = await GET(makeRequest("http://localhost/api/tarot/news?symbol=NVDA"));
    const body = await res.json();
    expect(body.items[0].category).toBe("실적");
  });

  it("<category> 부재 + 제목에 'acquisition' → 자동 분류 'M&A'", async () => {
    const xml = buildRss([
      rssItem({
        title: "Microsoft announces acquisition of Activision",
        link: "https://example.com/msft",
        description: "Deal valued at 70B USD.",
      }),
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => xml });

    const res = await GET(makeRequest("http://localhost/api/tarot/news?symbol=MSFT"));
    const body = await res.json();
    expect(body.items[0].category).toBe("M&A");
  });

  it("<category> 부재 + 키워드 미매치 → 기본 '시장'", async () => {
    const xml = buildRss([
      rssItem({
        title: "Random headline",
        link: "https://example.com/r",
        description: "Just a description.",
      }),
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => xml });

    const res = await GET(makeRequest("http://localhost/api/tarot/news?symbol=RANDOM"));
    const body = await res.json();
    expect(body.items[0].category).toBe("시장");
  });

  it("CDATA 래핑된 <category> 정상 추출", async () => {
    const xml = buildRss([
      rssItem({
        title: "Apple stock",
        link: "https://example.com/a",
        description: "desc",
        cdataCategory: "Technology",
      }),
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => xml });

    const res = await GET(makeRequest("http://localhost/api/tarot/news?symbol=CDATA"));
    const body = await res.json();
    expect(body.items[0].category).toBe("Technology");
  });

  it("외부 RSS 실패 → items=[] (크래시 없음)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "" });
    const res = await GET(makeRequest("http://localhost/api/tarot/news?symbol=ERR"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });
});

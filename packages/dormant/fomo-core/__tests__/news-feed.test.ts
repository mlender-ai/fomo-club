import { describe, expect, it } from "vitest";
import {
  applyKoTranslations,
  buildNewsFeed,
  localizeArticle,
  parseKoTranslations,
  parseNaverNews,
  parseNaverStockNews,
  parseRssFeed,
  parseYahooRss,
  scoreArticleFomo,
  type RawArticle,
} from "../src";

const NOW = Date.parse("2026-06-12T12:00:00Z");

function article(p: Partial<RawArticle>): RawArticle {
  return {
    id: p.id ?? "a",
    title: p.title ?? "Market update",
    url: p.url ?? "https://x.com/a",
    source: p.source ?? "Yahoo Finance",
    publishedAt: p.publishedAt ?? "2026-06-12T11:00:00Z",
    lang: p.lang ?? "en",
    ...p,
  };
}

describe("scoreArticleFomo", () => {
  it("신고가/급등 헤드라인은 높은 점수", () => {
    const hot = scoreArticleFomo(
      article({ title: "Nvidia soars to record all-time high as AI rally continues" }),
      NOW
    );
    expect(hot.score).toBeGreaterThanOrEqual(80);
  });

  it("급락/소송 헤드라인은 낮은 점수 (FOMO와 반대)", () => {
    const cold = scoreArticleFomo(
      article({ title: "Stock plunges after lawsuit and analyst downgrade" }),
      NOW
    );
    expect(cold.score).toBeLessThan(40);
  });

  it("한국어 키워드도 동일하게 점수화 (확장성)", () => {
    const ko = scoreArticleFomo(
      article({ title: "삼성전자 신고가 급등, 사상 최고", lang: "ko" }),
      NOW
    );
    expect(ko.score).toBeGreaterThanOrEqual(80);
  });

  it("최신 기사가 같은 내용이면 더 높다", () => {
    const fresh = scoreArticleFomo(article({ title: "Tech gains", publishedAt: "2026-06-12T11:30:00Z" }), NOW);
    const stale = scoreArticleFomo(article({ title: "Tech gains", publishedAt: "2026-06-01T00:00:00Z" }), NOW);
    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  it("0~100 범위", () => {
    const s = scoreArticleFomo(article({ title: "record surge rally soar boom jump spike" }), NOW);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.score).toBeGreaterThanOrEqual(0);
  });
});

describe("buildNewsFeed", () => {
  const arts = [
    article({ id: "1", title: "Boring filing", url: "https://x.com/boring", publishedAt: "2026-06-12T11:00:00Z" }),
    article({ id: "2", title: "Nvidia hits record high, stock soars", url: "https://x.com/nvda", publishedAt: "2026-06-12T11:50:00Z" }),
    article({ id: "3", title: "Market plunges on crash fears", url: "https://x.com/crash", publishedAt: "2026-06-12T11:00:00Z" }),
  ];

  it("FOMO 점수 높은 순 정렬", () => {
    const feed = buildNewsFeed(arts, { nowMs: NOW });
    expect(feed[0]!.id).toBe("2"); // 신고가 급등이 맨 위
    expect(feed[0]!.fomoScore).toBeGreaterThan(feed[feed.length - 1]!.fomoScore);
  });

  it("url 정규화 기준 dedupe (쿼리/해시 무시)", () => {
    const dup = [
      article({ id: "a", url: "https://x.com/p?utm=1", title: "Big news" }),
      article({ id: "b", url: "https://x.com/p#top", title: "Big news" }),
    ];
    expect(buildNewsFeed(dup, { nowMs: NOW })).toHaveLength(1);
  });

  it("제목/url 결측 카드는 제외 (깨진 카드 금지)", () => {
    const broken = [article({ id: "ok", title: "Fine" }), article({ id: "bad", title: "  ", url: "https://x.com/bad" })];
    const feed = buildNewsFeed(broken, { nowMs: NOW });
    expect(feed.every((a) => a.title.trim())).toBe(true);
  });

  it("limit 적용", () => {
    expect(buildNewsFeed(arts, { nowMs: NOW, limit: 1 })).toHaveLength(1);
  });
});

describe("parseRssFeed (한국 뉴스)", () => {
  const xml = `<rss version="2.0"><channel>
    <item><title><![CDATA[삼성전자·SK하이닉스 신고가 급등]]></title>
      <link>https://www.hankyung.com/article/202606122768i</link>
      <description><![CDATA[<p>반도체 강세</p>]]></description>
      <pubDate>Fri, 12 Jun 2026 11:19:42 +0900</pubDate></item>
    <item><title>제목만 있고 링크 없음</title><link></link></item>
  </channel></rss>`;

  it("한국어 기사 정규화 (source/lang 지정, 필수 결측 제외)", () => {
    const items = parseRssFeed(xml, { source: "한국경제", lang: "ko", nowIso: "2026-06-12T12:00:00Z" });
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("삼성전자·SK하이닉스 신고가 급등");
    expect(items[0]!.source).toBe("한국경제");
    expect(items[0]!.lang).toBe("ko");
    expect(items[0]!.summary).toBe("반도체 강세");
    expect(items[0]!.publishedAt).toBe("2026-06-12T02:19:42.000Z");
  });

  it("한국어 헤드라인이 FOMO 점수 파이프라인에서 상위 (한국어 키워드)", () => {
    const items = parseRssFeed(xml, { source: "한국경제", lang: "ko", nowIso: "2026-06-12T12:00:00Z" });
    const feed = buildNewsFeed(items, { nowMs: Date.parse("2026-06-12T12:00:00Z") });
    expect(feed[0]!.fomoScore).toBeGreaterThanOrEqual(70); // 신고가 급등
  });
});

describe("parseNaverNews", () => {
  it("네이버 JSON → 한국어 기사 (URL/날짜/출처)", () => {
    const items = [
      { tit: "엔비디아 신고가", subcontent: "** 반도체 강세 **", oid: "fnGuide", aid: "123", ohnm: "로이터", dt: "20260612130757" },
      { tit: "", oid: "x", aid: "1" }, // 제목 결측 제외
    ];
    const out = parseNaverNews(items, "2026-06-12T12:00:00Z");
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("엔비디아 신고가");
    expect(out[0]!.lang).toBe("ko");
    expect(out[0]!.source).toBe("로이터");
    expect(out[0]!.url).toBe("https://n.news.naver.com/mnews/article/fnGuide/123");
    expect(out[0]!.summary).toBe("반도체 강세");
    expect(out[0]!.publishedAt).toBe("2026-06-12T04:07:57.000Z");
  });
});

describe("parseNaverStockNews", () => {
  it("네이버 종목별 뉴스 그룹 → 한국어 기사 (중복 URL 제거)", () => {
    const groups = [
      {
        total: 2,
        items: [
          {
            officeId: "018",
            articleId: "0006312961",
            officeName: "이데일리",
            datetime: "202606231203",
            title: "짧은 제목",
            titleFull: "'삼전닉스'가 끌어올린 R&amp;D 기업 실적",
            body: "반도체 호황이 삼성전자와 SK하이닉스를 중심으로 기업 실적을 끌어올렸다.",
            mobileNewsUrl: "https://n.news.naver.com/mnews/article/018/0006312961",
          },
          {
            officeId: "018",
            articleId: "0006312961",
            officeName: "이데일리",
            datetime: "202606231203",
            titleFull: "중복 기사",
            mobileNewsUrl: "https://n.news.naver.com/mnews/article/018/0006312961",
          },
        ],
      },
    ];

    const out = parseNaverStockNews(groups, "2026-06-23T03:00:00Z");
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("'삼전닉스'가 끌어올린 R&D 기업 실적");
    expect(out[0]!.source).toBe("이데일리");
    expect(out[0]!.url).toBe("https://n.news.naver.com/mnews/article/018/0006312961");
    expect(out[0]!.publishedAt).toBe("2026-06-23T03:03:00.000Z");
    expect(out[0]!.summary).toContain("반도체 호황");
    expect(out[0]!.lang).toBe("ko");
  });
});

describe("LLM 한국어 번역 (순수부)", () => {
  it("코드펜스/잡텍스트 섞인 응답에서 JSON 배열 추출", () => {
    const content = '설명...\n```json\n[{"id":"a","titleKo":"엔비디아 급등","summaryKo":"AI 랠리"}]\n```';
    const t = parseKoTranslations(content);
    expect(t).toEqual([{ id: "a", titleKo: "엔비디아 급등", summaryKo: "AI 랠리" }]);
  });

  it("깨진 응답 → 빈 배열 (영문 폴백)", () => {
    expect(parseKoTranslations("미안 번역 못함")).toEqual([]);
    expect(parseKoTranslations("")).toEqual([]);
  });

  it("applyKoTranslations: id 매칭만 titleKo 채움, 원문 보존", () => {
    const arts: RawArticle[] = [
      { id: "a", title: "Nvidia soars", url: "u1", source: "Y", publishedAt: "x", lang: "en" },
      { id: "b", title: "Already KO", url: "u2", source: "한경", publishedAt: "x", lang: "ko" },
    ];
    const out = applyKoTranslations(arts, [{ id: "a", titleKo: "엔비디아 급등" }]);
    expect(out[0]!.title).toBe("Nvidia soars"); // 원문 보존
    expect(out[0]!.titleKo).toBe("엔비디아 급등");
    expect(out[1]!.titleKo).toBeUndefined(); // 매칭 없으면 그대로
    // localizeArticle(ko)와 결합되면 영문기사는 titleKo, 한국기사는 원문(한국어) 노출
    expect(localizeArticle(out[0]!, "ko").title).toBe("엔비디아 급등");
    expect(localizeArticle(out[1]!, "ko").title).toBe("Already KO");
  });
});

describe("localizeArticle", () => {
  it("한국어 번역 있으면 ko 표기, 없으면 원문", () => {
    const a = article({ title: "Nvidia soars", titleKo: "엔비디아 급등" });
    expect(localizeArticle(a, "ko").title).toBe("엔비디아 급등");
    expect(localizeArticle(a, "en").title).toBe("Nvidia soars");
    expect(localizeArticle(article({ title: "No KO" }), "ko").title).toBe("No KO");
  });
});

describe("parseYahooRss", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Nvidia hits record high]]></title><link>https://finance.yahoo.com/news/nvda-1.html</link>
      <description><![CDATA[Shares <b>soared</b> 5%.]]></description><pubDate>Thu, 12 Jun 2026 11:00:00 GMT</pubDate>
      <source url="https://reuters.com">Reuters</source></item>
    <item><title>Broken</title><link></link></item>
  </channel></rss>`;

  it("필수 필드 있는 항목만, 정규화해서 반환", () => {
    const items = parseYahooRss(xml, { symbol: "NVDA", nowIso: "2026-06-12T12:00:00Z" });
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Nvidia hits record high");
    expect(items[0]!.symbol).toBe("NVDA");
    expect(items[0]!.source).toBe("Reuters");
    expect(items[0]!.lang).toBe("en");
    expect(items[0]!.publishedAt).toBe("2026-06-12T11:00:00.000Z");
  });

  it("점수 파이프라인과 연결되면 신고가 기사가 상위", () => {
    const items = parseYahooRss(xml, { nowIso: "2026-06-12T12:00:00Z" });
    const feed = buildNewsFeed(items, { nowMs: NOW });
    expect(feed[0]!.fomoScore).toBeGreaterThanOrEqual(70);
  });
});

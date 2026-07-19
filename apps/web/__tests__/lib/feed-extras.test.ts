import { describe, expect, it, vi } from "vitest";
import type { RawArticle } from "@fomo/core";

vi.mock("../../lib/fomo-news-sources", () => ({ fetchAllNews: vi.fn(async () => mockedNews) }));
vi.mock("../../lib/coin-market-source", () => ({ readCoinMarketSnapshots: vi.fn(async () => mockedSnapshots) }));
vi.mock("../../lib/coin-materials", () => ({
  readLatestCoinMaterials: vi.fn(async () => {
    const cryptoSources = new Set(["토큰포스트", "블록미디어", "코인데스크코리아"]);
    const qualified = mockedNews.filter(
      (item) => cryptoSources.has(item.source) && /(법안|규제|승인|CLARITY|클래리티|ETF|반감기|업그레이드|금리|CPI|PPI)/i.test(item.title)
    );
    if (qualified.length === 0) return null;
    return {
      asOf: NOW.slice(0, 10),
      collectedAt: NOW,
      bySymbol: {},
      global: qualified.map((item) => ({
        id: item.id,
        symbols: [],
        scope: "market",
        type: /반감기|업그레이드/i.test(item.title) ? "network" : "regulation",
        typeLabel: /반감기|업그레이드/i.test(item.title) ? "네트워크" : "규제·법안",
        direction: "neutral",
        title: item.title,
        meaning: "코인 시장 공통 이슈",
        source: item.source,
        url: item.url,
        publishedAt: item.publishedAt,
      })),
    };
  }),
}));

import {
  buildCoinIssueCards,
  buildEventCard,
  buildHotIssueCards,
  buildTermCard,
  normalizedTitleKey,
  upcomingMarketEvents,
} from "../../lib/feed-extras";

const NOW = new Date().toISOString();
function article(id: string, title: string, source: string): RawArticle {
  return { id, title, url: `https://news.example/${id}`, source, publishedAt: NOW, lang: "ko" };
}

// 신디케이트 사본(같은 제목, 다른 매체) 3건 + 진짜 다매체 사건(다른 제목, 토큰 공유) 3건.
let mockedNews: RawArticle[] = [];
let mockedSnapshots: unknown[] = [];

/** 시그널 계산 가능한 코인 스냅샷 — 완결 일봉 25개+ 거래대금, volumeRatio = acc24h / avg20. */
function coinSnapshot(overrides: { koreanName: string; changePct: number; volumeRatio: number; marketCapRank?: number }) {
  const daily = 1_000_000_000;
  return {
    market: "KRW-TST",
    symbol: "TST",
    koreanName: overrides.koreanName,
    englishName: "Test",
    price: 1000,
    changePct: overrides.changePct,
    accTradePrice24h: daily * overrides.volumeRatio,
    tradeValueRank: 1,
    ...(overrides.marketCapRank ? { marketCapRank: overrides.marketCapRank } : {}),
    tradeValues: Array.from({ length: 31 }, () => daily),
  };
}

describe("feed-extras (2026-07-11 콘텐츠 베리에이션)", () => {
  it("오늘의 경제용어 — 하루 2장, 서로 다른 용어(피드 보강 2026-07-17)", () => {
    const cards = buildTermCard();
    expect(cards).toHaveLength(2);
    expect(cards[0]!.headline).not.toBe(cards[1]!.headline);
    expect(cards[0]!.id).not.toBe(cards[1]!.id);
  });

  it("오늘의 경제용어 — 날짜 결정론 로테이션, 정의·예시 사실 서술", () => {
    const [card] = buildTermCard();
    expect(card).toBeDefined();
    expect(card!.contentType).toBe("term");
    expect(card!.headline).toContain("오늘의 경제용어");
    expect(card!.facts.map((f) => f.label)).toEqual(["정의", "예시"]);
    // 같은 날 두 번 호출 = 같은 용어 (재현성)
    const [again] = buildTermCard();
    expect(again!.headline).toBe(card!.headline);
    // 금지 문형 없음 (판단·조언 금지)
    const text = `${card!.headline} ${card!.facts.map((f) => f.value).join(" ")}`;
    expect(text).not.toMatch(/사세요|파세요|매수하세요|매도하세요|목표가|추천/);
  });

  it("시장 일정 — 만기일 규칙 계산(셋째 금요일·둘째 목요일)과 FOMC 정렬", () => {
    const events = upcomingMarketEvents("2026-07-11", 5);
    expect(events.length).toBeGreaterThan(0);
    // 오름차순 정렬 + 전부 오늘 이후
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i]!.date >= events[i - 1]!.date).toBe(true);
    }
    expect(events.every((event) => event.date >= "2026-07-11")).toBe(true);
    // 2026-07 미국 옵션 만기 = 셋째 금요일 = 7/17 (규칙 검산)
    expect(events.some((event) => event.date === "2026-07-17" && event.label.includes("옵션 만기"))).toBe(true);
    // 2026-07 FOMC = 7/29 (Fed 공개 일정)
    expect(events.some((event) => event.date === "2026-07-29" && event.label.includes("FOMC"))).toBe(true);
  });

  it("시장 일정 카드 — D-day 표기 + 사실 일정만", () => {
    const [card] = buildEventCard();
    expect(card).toBeDefined();
    expect(card!.contentType).toBe("event");
    expect(card!.headline).toMatch(/D-\d+|오늘/);
    expect(card!.facts.length).toBeGreaterThan(0);
  });

  it("한국 동시만기 — 3·6·9·12월 둘째 목요일 규칙 검산 (2026-09-10)", () => {
    const events = upcomingMarketEvents("2026-09-01", 10);
    expect(events.some((event) => event.date === "2026-09-10" && event.label.includes("동시만기"))).toBe(true);
  });
});

// 2026-07-13 사건 회귀(WO-21) — HOT ISSUE가 같은 신디케이트 제목 3줄을 반복하고 진짜 사건을 밀어냈다.
describe("hot-issue 제목 dedup", () => {
  it("normalizedTitleKey — (종합)·[속보] 태그·기호·공백 무시하고 같은 기사로 판정", () => {
    expect(normalizedTitleKey("SNS 미담주·3대 메가 수혜주…급락장서 튀어 오른 테마주들(종합)")).toBe(
      normalizedTitleKey("[속보] SNS 미담주·3대 메가 수혜주…급락장서 튀어오른 테마주들")
    );
    expect(normalizedTitleKey("코스피 급락")).not.toBe(normalizedTitleKey("코스닥 급락"));
  });

  it("신디케이트 사본은 1건으로 접히고, 다매체·다른 제목 사건이 헤드라인을 차지한다", async () => {
    mockedNews = [
      article("s1", "SNS 미담주 3대 메가 수혜주 급락장서 튀어 오른 테마주들(종합)", "A일보"),
      article("s2", "SNS 미담주 3대 메가 수혜주 급락장서 튀어 오른 테마주들", "B경제"),
      article("s3", "[속보] SNS 미담주 3대 메가 수혜주 급락장서 튀어 오른 테마주들", "C뉴스"),
      article("w1", "이란 전쟁 격화에 코스피 폭락 마감", "연합뉴스"),
      article("w2", "중동 이란 리스크에 코스피 코스닥 동반 폭락", "한국경제"),
      article("w3", "이란 사태로 코스피 역대급 하락 국면", "매일경제"),
    ];
    const cards = await buildHotIssueCards();
    const ko = cards.find((card) => card.scope === "domestic");
    expect(ko).toBeDefined();
    // 관련 기사 팩트에 같은 제목 반복 금지 + 헤드라인과 같은 제목 금지
    const titles = [normalizedTitleKey(ko!.headline), ...ko!.facts.map((f) => normalizedTitleKey(String(f.value)))];
    expect(new Set(titles).size).toBe(titles.length);
    // 신디케이트 1건 vs 다매체 사건 3건 — 사건이 이겨야 한다
    expect(ko!.headline).toMatch(/이란|코스피/);
  });

  it("서로 다른 두 사건이 있으면 언어당 2장까지, 같은 사건 변주는 2장으로 늘리지 않는다(피드 보강 2026-07-17)", async () => {
    mockedNews = [
      // 사건 A — 이란·코스피 (3개 매체)
      article("a1", "이란 전쟁 격화에 코스피 폭락 마감", "연합뉴스"),
      article("a2", "중동 이란 리스크에 코스피 코스닥 동반 폭락", "한국경제"),
      article("a3", "이란 사태로 코스피 역대급 하락 국면", "매일경제"),
      // 사건 B — 반도체 보조금 (3개 매체, 사건 A와 토큰 안 겹침)
      article("b1", "정부 반도체 보조금 10조 확정 발표", "전자신문"),
      article("b2", "반도체 보조금 10조 삼성 하이닉스 수혜 전망", "서울경제"),
      article("b3", "10조 반도체 보조금 국회 통과", "뉴시스"),
    ];
    const cards = await buildHotIssueCards();
    const ko = cards.filter((card) => card.scope === "domestic");
    expect(ko).toHaveLength(2);
    const keys = ko.map((card) => normalizedTitleKey(card.headline));
    expect(new Set(keys).size).toBe(2);
    // 두 카드는 서로 다른 사건이어야 한다 — 하나는 이란, 하나는 반도체
    const joined = ko.map((card) => card.headline).join(" | ");
    expect(joined).toMatch(/이란/);
    expect(joined).toMatch(/반도체/);
  });
});

// 2026-07-15 User Zero: "체인링크 1% 오른 게 뭐가 중요해" — 코인 핫이슈는 매크로/규제 사건 우선.
describe("coin-issue 매크로 우선", () => {
  it("코인 전문 매체의 규제·법안 기사가 있으면 헤드라인을 차지한다(가격 무버 무시)", async () => {
    mockedSnapshots = [];
    mockedNews = [
      article("c1", "국회, 가상자산 클래리티 법안 본회의 통과", "토큰포스트"),
      article("c2", "비트코인, 오늘 소폭 상승 마감", "블록미디어"),
    ];
    const [card] = await buildCoinIssueCards();
    expect(card).toBeDefined();
    expect(card!.contentType).toBe("coin-issue");
    expect(card!.headline).toBe("국회, 가상자산 클래리티 법안 본회의 통과");
    expect(card!.source).toBe("토큰포스트");
  });

  it("매크로 기사 + 진짜 무버(±5% 또는 거래대금 1.5배)면 두 장 병행(피드 보강 2026-07-17)", async () => {
    mockedSnapshots = [coinSnapshot({ koreanName: "테스트코인", changePct: 7.2, volumeRatio: 2.0, marketCapRank: 5 })];
    mockedNews = [article("c1", "국회, 가상자산 클래리티 법안 본회의 통과", "토큰포스트")];
    const cards = await buildCoinIssueCards();
    expect(cards).toHaveLength(2);
    expect(cards[0]!.headline).toBe("국회, 가상자산 클래리티 법안 본회의 통과");
    expect(cards[1]!.headline).toContain("테스트코인");
    expect(cards[0]!.id).not.toBe(cards[1]!.id);
  });

  it("매크로 기사가 있고 무버가 미미하면(1%대) 무버 카드는 만들지 않는다 — 잡음 차단 유지", async () => {
    mockedSnapshots = [coinSnapshot({ koreanName: "체인링크", changePct: 1.1, volumeRatio: 1.0 })];
    mockedNews = [article("c1", "국회, 가상자산 클래리티 법안 본회의 통과", "토큰포스트")];
    const cards = await buildCoinIssueCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]!.headline).toBe("국회, 가상자산 클래리티 법안 본회의 통과");
  });

  it("매크로 기사가 없으면 무버 폴백은 문턱 없이 그대로(조용한 날 정직 노출)", async () => {
    mockedSnapshots = [coinSnapshot({ koreanName: "비트코인", changePct: 1.4, volumeRatio: 1.0, marketCapRank: 1 })];
    mockedNews = [];
    const cards = await buildCoinIssueCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]!.headline).toContain("비트코인");
  });

  it("코인 전문 매체가 아니면(일반 경제지) 매크로 키워드가 있어도 무시한다", async () => {
    mockedSnapshots = [];
    mockedNews = [article("m1", "가상자산 ETF 승인 임박", "매일경제")];
    const cards = await buildCoinIssueCards();
    // 스냅샷도 없고(mock=[]) 매크로 기사도 자격 미달 — 정직하게 카드 없음.
    expect(cards).toEqual([]);
  });

  it("코인 전문 매체라도 매크로 키워드가 없는 단순 가격 기사는 무시한다", async () => {
    mockedSnapshots = [];
    mockedNews = [article("c3", "리플, 오늘도 조용한 하루", "토큰포스트")];
    const cards = await buildCoinIssueCards();
    expect(cards).toEqual([]);
  });
});

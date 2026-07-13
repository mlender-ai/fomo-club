import { describe, expect, it, vi } from "vitest";
import type { RawArticle } from "@fomo/core";

vi.mock("../../lib/fomo-news-sources", () => ({ fetchAllNews: vi.fn(async () => mockedNews) }));

import { buildEventCard, buildHotIssueCards, buildTermCard, normalizedTitleKey, upcomingMarketEvents } from "../../lib/feed-extras";

const NOW = new Date().toISOString();
function article(id: string, title: string, source: string): RawArticle {
  return { id, title, url: `https://news.example/${id}`, source, publishedAt: NOW, lang: "ko" };
}

// 신디케이트 사본(같은 제목, 다른 매체) 3건 + 진짜 다매체 사건(다른 제목, 토큰 공유) 3건.
let mockedNews: RawArticle[] = [];

describe("feed-extras (2026-07-11 콘텐츠 베리에이션)", () => {
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
});

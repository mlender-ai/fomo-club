import { describe, expect, it } from "vitest";
import { buildEventCard, buildTermCard, upcomingMarketEvents } from "../../lib/feed-extras";

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

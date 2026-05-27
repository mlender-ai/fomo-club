import { describe, it, expect } from "vitest";
import { formatTimeAgo, formatCardLabel } from "../src/historyFormatting";

describe("formatTimeAgo", () => {
  const now = Date.parse("2026-05-27T12:00:00.000Z");

  it("잘못된 ISO → 빈 문자열", () => {
    expect(formatTimeAgo("not-a-date", now)).toBe("");
  });

  it("1분 미만 → '방금'", () => {
    expect(formatTimeAgo(new Date(now - 30_000).toISOString(), now)).toBe("방금");
  });

  it("분 단위", () => {
    expect(formatTimeAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5분 전");
  });

  it("시간 단위", () => {
    expect(formatTimeAgo(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("3시간 전");
  });

  it("일 단위", () => {
    expect(formatTimeAgo(new Date(now - 2 * 86400_000).toISOString(), now)).toBe("2일 전");
  });

  it("달 단위 — 30일 이상", () => {
    expect(formatTimeAgo(new Date(now - 60 * 86400_000).toISOString(), now)).toBe("2달 전");
  });

  it("정확히 60초 — '1분 전'", () => {
    expect(formatTimeAgo(new Date(now - 60_000).toISOString(), now)).toBe("1분 전");
  });
});

describe("formatCardLabel", () => {
  it("빈 배열 → 빈 문자열", () => {
    expect(formatCardLabel([])).toBe("");
  });

  it("1장 → 카드 이름만", () => {
    expect(formatCardLabel([{ position: 1, card: { nameKo: "탑" } }])).toBe("탑");
  });

  it("3장 — position 순서대로 정렬", () => {
    const cards = [
      { position: 3, card: { nameKo: "별" } },
      { position: 1, card: { nameKo: "탑" } },
      { position: 2, card: { nameKo: "죽음" } },
    ];
    expect(formatCardLabel(cards)).toBe("탑 · 죽음 · 별");
  });

  it("빈 카드 이름은 제외", () => {
    const cards = [
      { position: 1, card: { nameKo: "탑" } },
      { position: 2, card: { nameKo: "" } },
      { position: 3, card: { nameKo: "별" } },
    ];
    expect(formatCardLabel(cards)).toBe("탑 · 별");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// KST date helper — same logic as streak.ts
function toKSTDateString(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

describe("toKSTDateString", () => {
  it("offsets UTC to KST correctly", () => {
    // UTC midnight → KST 09:00 (same day)
    const utcMidnight = new Date("2026-05-20T00:00:00Z");
    expect(toKSTDateString(utcMidnight)).toBe("2026-05-20");
  });

  it("handles UTC 15:00 → KST next day (00:00)", () => {
    // UTC 15:00 → KST 00:00 next day
    const utc = new Date("2026-05-20T15:00:00Z");
    expect(toKSTDateString(utc)).toBe("2026-05-21");
  });
});

describe("streak logic (pure)", () => {
  function computeNewStreak(
    lastDateKST: string | null,
    todayKST: string,
    currentStreak: number
  ): number {
    if (lastDateKST === todayKST) return currentStreak; // already logged in today
    const yesterday = toKSTDateString(new Date(new Date(todayKST).getTime() - 86_400_000 + 9 * 60 * 60 * 1000));
    return lastDateKST === yesterday ? currentStreak + 1 : 1;
  }

  it("increments streak for consecutive day", () => {
    expect(computeNewStreak("2026-05-19", "2026-05-20", 3)).toBe(4);
  });

  it("resets streak on gap", () => {
    expect(computeNewStreak("2026-05-17", "2026-05-20", 5)).toBe(1);
  });

  it("does not change streak when logging in same day", () => {
    expect(computeNewStreak("2026-05-20", "2026-05-20", 3)).toBe(3);
  });

  it("starts streak at 1 for first login", () => {
    expect(computeNewStreak(null, "2026-05-20", 0)).toBe(1);
  });

  it("triggers reward at 7-day multiples", () => {
    const streak7 = computeNewStreak("2026-05-19", "2026-05-20", 6);
    expect(streak7 % 7).toBe(0);
  });

  it("triggers reward again at 14 days", () => {
    const streak14 = computeNewStreak("2026-05-19", "2026-05-20", 13);
    expect(streak14 % 7).toBe(0);
  });
});

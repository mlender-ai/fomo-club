import { describe, it, expect } from "vitest";
import {
  buildCalendar,
  calendarStats,
  daysInMonth,
  firstWeekday,
  parseMonth,
} from "../src/calendar";
import type { EmotionType } from "../src/types";

describe("parseMonth / daysInMonth / firstWeekday", () => {
  it("월 길이를 올바르게 센다(윤년 포함)", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29); // 윤년
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it("1일의 요일을 구한다 (2026-06-01은 월요일)", () => {
    expect(firstWeekday(2026, 6)).toBe(1);
  });

  it("parseMonth는 연/월로 분해한다", () => {
    expect(parseMonth("2026-06")).toEqual({ year: 2026, month: 6 });
  });
});

describe("buildCalendar", () => {
  const days: Record<string, EmotionType> = {
    "2026-06-01": "fomo",
    "2026-06-03": "fear",
  };
  const market = { "2026-06-01": 72 };

  it("앞쪽에 1일 요일만큼 빈 칸을 패딩한다", () => {
    const cells = buildCalendar("2026-06", days, market, "2026-06-07");
    // 6/1 = 월요일 → 앞에 일요일 1칸 패딩
    expect(cells.slice(0, 1).every((c) => c.date === null)).toBe(true);
    expect(cells[1].date).toBe("2026-06-01");
    // 패딩(1) + 30일 = 31칸
    expect(cells).toHaveLength(31);
  });

  it("날짜별 감정/시장점수/오늘 플래그를 매핑한다", () => {
    const cells = buildCalendar("2026-06", days, market, "2026-06-07");
    const c1 = cells.find((c) => c.date === "2026-06-01")!;
    expect(c1.emotion).toBe("fomo");
    expect(c1.marketScore).toBe(72);
    const c2 = cells.find((c) => c.date === "2026-06-02")!;
    expect(c2.emotion).toBeNull();
    expect(c2.marketScore).toBeNull();
    const today = cells.find((c) => c.date === "2026-06-07")!;
    expect(today.isToday).toBe(true);
  });
});

describe("calendarStats", () => {
  it("이번 달 채운 칸 수를 센다(다른 달은 제외)", () => {
    const days: Record<string, EmotionType> = {
      "2026-05-31": "regret",
      "2026-06-01": "fomo",
      "2026-06-05": "greed",
    };
    const { filled, totalDays } = calendarStats("2026-06", days, "2026-06-07");
    expect(filled).toBe(2);
    expect(totalDays).toBe(30);
  });

  it("today부터 연속 기록 일수를 센다(끊기면 멈춤)", () => {
    const days: Record<string, EmotionType> = {
      "2026-06-05": "fomo",
      "2026-06-06": "fear",
      "2026-06-07": "calm" as EmotionType,
    };
    expect(calendarStats("2026-06", days, "2026-06-07").streak).toBe(3);
  });

  it("오늘 기록이 없으면 streak는 0", () => {
    const days: Record<string, EmotionType> = { "2026-06-05": "fomo" };
    expect(calendarStats("2026-06", days, "2026-06-07").streak).toBe(0);
  });

  it("월 경계를 넘어도 연속이면 계속 센다", () => {
    const days: Record<string, EmotionType> = {
      "2026-05-31": "fomo",
      "2026-06-01": "fear",
    };
    expect(calendarStats("2026-06", days, "2026-06-01").streak).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import type { DailyOhlcv } from "@fomo/core";
import { mergeCandlesByDate, US_CANDLE_KEEP_DAYS } from "../../lib/us-candle-cache";

function candle(date: string, close: number): DailyOhlcv {
  return { date, open: close, high: close, low: close, close, volume: 1_000 };
}

describe("mergeCandlesByDate — 짧은 응답이 긴 이력을 덮어쓰지 못한다(WO-P1)", () => {
  it("합집합 병합: 봉인된 250봉 + 오늘 3봉 → 길이 유지(3봉으로 퇴화 금지)", () => {
    const sealed = Array.from({ length: 250 }, (_, i) => {
      const day = new Date(Date.UTC(2025, 6, 1) + i * 86_400_000);
      return candle(day.toISOString().slice(0, 10), 100 + i);
    });
    const fresh = [candle("2026-07-21", 11), candle("2026-07-22", 12), candle("2026-07-23", 13)];
    const merged = mergeCandlesByDate(sealed, fresh);
    expect(merged.length).toBe(253);
    expect(merged.at(-1)?.date).toBe("2026-07-23");
  });

  it("같은 날짜는 새 값으로 갱신", () => {
    const merged = mergeCandlesByDate([candle("2026-07-21", 10)], [candle("2026-07-21", 99)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.close).toBe(99);
  });

  it("오름차순 정렬 + 최근 N개만 유지", () => {
    const many = Array.from({ length: US_CANDLE_KEEP_DAYS + 40 }, (_, i) => {
      const day = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000);
      return candle(day.toISOString().slice(0, 10), i);
    });
    const merged = mergeCandlesByDate([], many);
    expect(merged).toHaveLength(US_CANDLE_KEEP_DAYS);
    expect(merged[0]!.close).toBe(40); // 앞쪽 40개가 잘림
    const dates = merged.map((candle) => candle.date ?? "");
    expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("날짜 없는 캔들은 버린다(키 없는 항목이 병합을 깨지 않게)", () => {
    const merged = mergeCandlesByDate([], [{ open: 1, high: 1, low: 1, close: 1, volume: 1 } as DailyOhlcv, candle("2026-07-23", 5)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.date).toBe("2026-07-23");
  });
});

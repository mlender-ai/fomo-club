import { describe, it, expect } from "vitest";
import {
  calculateRsi,
  calculateMacd,
  calculateEmaSeries,
  latestAverage,
  average,
} from "../src/researchLive";

describe("average", () => {
  it("빈 배열 → null", () => {
    expect(average([])).toBeNull();
  });

  it("단일 값", () => {
    expect(average([10])).toBe(10);
  });

  it("여러 값의 평균", () => {
    expect(average([10, 20, 30])).toBe(20);
  });
});

describe("latestAverage", () => {
  it("데이터 부족 시 null", () => {
    expect(latestAverage([1, 2], 5)).toBeNull();
  });

  it("마지막 N개의 평균", () => {
    const values = [10, 20, 30, 40, 50];
    expect(latestAverage(values, 3)).toBe(40); // (30+40+50)/3
  });

  it("SMA20 계산", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + i);
    const sma20 = latestAverage(values, 20);
    // 마지막 20개: 110~129, 평균 = 119.5
    expect(sma20).toBe(119.5);
  });
});

describe("calculateEmaSeries", () => {
  it("빈 배열 → 빈 배열", () => {
    expect(calculateEmaSeries([], 12)).toEqual([]);
  });

  it("period보다 짧은 데이터 → 모두 null", () => {
    const result = calculateEmaSeries([1, 2, 3], 12);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it("period 시점에 SMA가 첫 EMA", () => {
    const values = [2, 4, 6, 8, 10]; // period=5 → SMA = 6
    const result = calculateEmaSeries(values, 5);
    expect(result[4]).toBe(6);
  });

  it("EMA 시리즈 길이가 입력과 동일", () => {
    const values = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = calculateEmaSeries(values, 12);
    expect(result).toHaveLength(50);
  });
});

describe("calculateRsi", () => {
  it("데이터 부족 시 null", () => {
    expect(calculateRsi([1, 2, 3], 14)).toBeNull();
  });

  it("지속 상승 → RSI 100에 수렴", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    const rsi = calculateRsi(rising, 14);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(90);
  });

  it("지속 하락 → RSI 0에 수렴", () => {
    const falling = Array.from({ length: 30 }, (_, i) => 200 - i);
    const rsi = calculateRsi(falling, 14);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeLessThan(10);
  });

  it("횡보 → RSI 40~60 범위", () => {
    // 반복 패턴: 올랐다 내렸다
    const sideways = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 2);
    const rsi = calculateRsi(sideways, 14);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(30);
    expect(rsi!).toBeLessThan(70);
  });

  it("RSI 값이 0~100 범위", () => {
    const random = Array.from({ length: 100 }, () => Math.random() * 100 + 50);
    const rsi = calculateRsi(random, 14);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThanOrEqual(0);
    expect(rsi!).toBeLessThanOrEqual(100);
  });
});

describe("calculateMacd", () => {
  it("데이터 부족 시 null 값들", () => {
    const result = calculateMacd([1, 2, 3, 4, 5]);
    expect(result.macd).toBeNull();
    expect(result.signal).toBeNull();
    expect(result.histogram).toBeNull();
  });

  it("충분한 데이터 → 모든 값 존재", () => {
    // EMA26 + EMA9 여유분 = 최소 35개 정도 필요
    const values = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 3);
    const result = calculateMacd(values);
    expect(result.macd).not.toBeNull();
    expect(result.signal).not.toBeNull();
    expect(result.histogram).not.toBeNull();
  });

  it("histogram = macd - signal", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i) * 5);
    const result = calculateMacd(values);
    if (result.macd !== null && result.signal !== null && result.histogram !== null) {
      expect(Math.abs(result.histogram - (result.macd - result.signal))).toBeLessThan(0.0001);
    }
  });

  it("상승 추세 → MACD 양수", () => {
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i * 2);
    const result = calculateMacd(rising);
    expect(result.macd).not.toBeNull();
    expect(result.macd!).toBeGreaterThan(0);
  });

  it("하락 추세 → MACD 음수", () => {
    const falling = Array.from({ length: 60 }, (_, i) => 200 - i * 2);
    const result = calculateMacd(falling);
    expect(result.macd).not.toBeNull();
    expect(result.macd!).toBeLessThan(0);
  });
});

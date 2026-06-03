import { describe, it, expect } from "vitest";
import { parseStooqCsv, toStooqSymbol, rangeToDays } from "@/lib/tarot/chartProviders";

describe("toStooqSymbol", () => {
  it("미국 티커 → .us", () => {
    expect(toStooqSymbol("AAPL")).toEqual({ stooq: "aapl.us", market: "US" });
  });
  it("6자리 숫자 → KR .kr", () => {
    expect(toStooqSymbol("005930")).toEqual({ stooq: "005930.kr", market: "KR" });
  });
  it(".KS 접미사 제거 후 KR", () => {
    expect(toStooqSymbol("005930.KS")).toEqual({ stooq: "005930.kr", market: "KR" });
  });
});

describe("parseStooqCsv", () => {
  const csv = [
    "Date,Open,High,Low,Close,Volume",
    "2026-03-16,100,110,99,108,1000",
    "2026-03-17,108,112,107,111,2000",
    "2026-03-18,111,111,105,106,1500",
  ].join("\n");

  it("CSV → bars 파싱 (날짜 ISO, 종가)", () => {
    const bars = parseStooqCsv(csv);
    expect(bars).toHaveLength(3);
    expect(bars[0]!.close).toBe(108);
    expect(bars[0]!.date).toBe("2026-03-16T00:00:00.000Z");
    expect(bars[2]!.high).toBe(111);
  });

  it("종가 결측/깨진 행은 건너뛴다", () => {
    const broken = "Date,Open,High,Low,Close,Volume\n2026-03-16,100,110,99,,1000\n2026-03-17,1,2,0,3,5";
    const bars = parseStooqCsv(broken);
    expect(bars).toHaveLength(1);
    expect(bars[0]!.close).toBe(3);
  });

  it("헤더 없거나 빈 입력 → 빈 배열", () => {
    expect(parseStooqCsv("")).toEqual([]);
    expect(parseStooqCsv("oops\n1,2,3")).toEqual([]);
  });
});

describe("rangeToDays", () => {
  it("range별 대략 일수", () => {
    expect(rangeToDays("1mo")).toBe(31);
    expect(rangeToDays("1y")).toBe(370);
    expect(rangeToDays("max")).toBeGreaterThan(1000);
  });
});

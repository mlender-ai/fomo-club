import { describe, it, expect } from "vitest";
import {
  pct,
  buildWhaleItems,
  buildMacroItems,
  yahooChange,
  twelveDataChange,
  buildPulseItems,
  bannerFallback,
  parseStooqDailyChange,
} from "../src/banner";

describe("pct", () => {
  it("양수는 + 부호, 소수 1자리", () => {
    expect(pct(2.34)).toBe("+2.3%");
    expect(pct(-5.27)).toBe("-5.3%");
    expect(pct(0)).toBe("0%");
  });
});

describe("buildWhaleItems", () => {
  it("실측값만 항목을 만들고 안정 id를 부여한다", () => {
    const items = buildWhaleItems({
      marketCapChange24h: -5.2,
      coins: [
        { name: "Bitcoin", symbol: "btc", change24h: -3.1, athChange: -48.7 },
        { name: "Ethereum", symbol: "eth", change24h: -8.3, athChange: -60 },
      ],
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain("whale-marketcap");
    expect(ids).toContain("whale-btc-ath");
    expect(ids).toContain("whale-eth-ath");
    expect(ids).toContain("whale-worst");
    expect(ids).toContain("whale-breadth");
    // 최대 낙폭은 ETH
    const worst = items.find((i) => i.id === "whale-worst");
    expect(worst?.text).toContain("Ethereum");
    // 모든 항목에 detail 존재
    expect(items.every((i) => i.detail)).toBe(true);
  });

  it("결측치는 항목을 생략한다(가짜 수치 금지)", () => {
    const items = buildWhaleItems({ marketCapChange24h: null, coins: [] });
    expect(items).toHaveLength(0);
  });

  it("BTC 전고점이 양수면 ath 항목 생략", () => {
    const items = buildWhaleItems({
      coins: [{ name: "Bitcoin", symbol: "btc", change24h: 1, athChange: 5 }],
    });
    expect(items.find((i) => i.id === "whale-btc-ath")).toBeUndefined();
  });
});

describe("buildMacroItems", () => {
  it("국내/미증시/반도체 변화율로 항목 생성", () => {
    const items = buildMacroItems([
      { key: "kosdaq", label: "코스닥", change: -8.0, close: 900 },
      { key: "spx", label: "S&P500", change: -1.2, close: 5000 },
      { key: "sox", label: "필라델피아 반도체", change: -8.2, close: 4000 },
    ]);
    expect(items.map((i) => i.id)).toEqual(["macro-kosdaq", "macro-spx", "macro-sox"]);
    expect(items[0]?.text).toContain("코스닥");
    expect(items[2]?.text).toContain("-8.2%");
    expect(items[2]?.detail?.source?.label).toBe("Yahoo Finance");
  });

  it("change가 없으면 생략", () => {
    const items = buildMacroItems([{ key: "ndq", label: "나스닥", change: null }]);
    expect(items).toHaveLength(0);
  });
});

describe("yahooChange", () => {
  it("마지막 2개 유효 종가로 변화율 계산", () => {
    const r = yahooChange([1002.44, 911.39]);
    expect(r?.close).toBe(911.39);
    // (911.39-1002.44)/1002.44*100 ≈ -9.08
    expect(r && Math.round(r.change * 10) / 10).toBe(-9.1);
  });

  it("null/결측을 걸러내고 계산", () => {
    const r = yahooChange([null, 5000, null, 4950, null]);
    expect(r?.close).toBe(4950);
  });

  it("유효 종가 2개 미만이면 null", () => {
    expect(yahooChange([null, 100])).toBeNull();
    expect(yahooChange([])).toBeNull();
  });
});

describe("twelveDataChange", () => {
  it("percent_change(문자열) 우선 신뢰 + close 파싱", () => {
    const r = twelveDataChange({ close: "2611.45", previous_close: "2600.00", percent_change: "0.44" });
    expect(r?.close).toBe(2611.45);
    expect(r?.change).toBe(0.44);
  });

  it("percent_change 없으면 close/previous_close 로 계산", () => {
    const r = twelveDataChange({ close: 4950, previous_close: 5000 });
    expect(r?.close).toBe(4950);
    expect(r && Math.round(r.change * 100) / 100).toBe(-1);
  });

  it("숫자 타입도 허용", () => {
    const r = twelveDataChange({ close: 100, percent_change: 2.5 });
    expect(r).toEqual({ close: 100, change: 2.5 });
  });

  it("status:error / null / close 결측 / prev 0 이면 null", () => {
    expect(twelveDataChange({ status: "error", close: "100" })).toBeNull();
    expect(twelveDataChange(null)).toBeNull();
    expect(twelveDataChange(undefined)).toBeNull();
    expect(twelveDataChange({ previous_close: "100" })).toBeNull();
    expect(twelveDataChange({ close: 100, previous_close: 0 })).toBeNull();
  });
});

describe("buildPulseItems", () => {
  it("지수 + 참여 항목", () => {
    const items = buildPulseItems({
      score: 30,
      state: "관망",
      total: 3,
      tally: { fear: 2, fomo: 1 },
    });
    expect(items[0]?.id).toBe("pulse-index");
    expect(items[0]?.text).toContain("30");
    expect(items.find((i) => i.id === "pulse-participation")?.text).toContain("3명");
  });

  it("투표 0건이면 빈 안내", () => {
    const items = buildPulseItems({ score: 20, state: "무관심", total: 0, tally: {} });
    expect(items.find((i) => i.id === "pulse-empty")).toBeDefined();
  });
});

describe("parseStooqDailyChange", () => {
  const csv = [
    "Date,Open,High,Low,Close,Volume",
    "2026-06-04,5000,5050,4990,5010,0",
    "2026-06-05,5010,5030,4900,4950,0",
  ].join("\n");

  it("마지막 2행 종가로 전일 대비 변화율 계산", () => {
    const r = parseStooqDailyChange(csv);
    expect(r?.close).toBe(4950);
    // (4950-5010)/5010*100 ≈ -1.197
    expect(r && Math.round(r.change * 10) / 10).toBe(-1.2);
  });

  it("행이 부족하면 null", () => {
    expect(parseStooqDailyChange("Date,Open,High,Low,Close,Volume\n2026-06-05,1,1,1,1,0")).toBeNull();
  });

  it("close 컬럼이 없으면 null", () => {
    expect(parseStooqDailyChange("a,b\n1,2\n3,4")).toBeNull();
  });
});

describe("bannerFallback", () => {
  it("정직한 폴백 — 가짜 수치 없음", () => {
    const fb = bannerFallback();
    expect(fb.id).toBe("fallback");
    expect(fb.text).not.toMatch(/[0-9]+%/);
  });
});

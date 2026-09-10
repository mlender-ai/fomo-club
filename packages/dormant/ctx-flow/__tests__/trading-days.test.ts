import { describe, expect, it } from "vitest";
import { deriveTradingDays } from "../src/compute/trading-days";
import { computeStreak } from "../src/compute/streak";

const WEEK = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];

/** 시장 전체가 다 관측된 유니버스 10종목. */
const fullMarket = (days: readonly string[]) => Array.from({ length: 10 }, () => [...days]);

describe("deriveTradingDays — 휴장과 결손을 가른다", () => {
  it("시장 전체가 관측된 날만 거래일이 된다", () => {
    expect(deriveTradingDays(fullMarket(WEEK))).toEqual(WEEK);
  });

  it("**아무도 거래 안 한 날은 휴장이라 거래일이 아니다**", () => {
    // 08-15 광복절: 어느 종목에도 행이 없다.
    const days = deriveTradingDays(fullMarket(WEEK));
    expect(days).not.toContain("2026-08-15");
  });

  it("**한 종목만 빠진 날은 거래일로 남는다** — 그 종목에겐 결손이다", () => {
    const universe = fullMarket(WEEK);
    universe[0] = WEEK.filter((d) => d !== "2026-08-12"); // 거래정지 1종목
    const days = deriveTradingDays(universe);
    expect(days).toContain("2026-08-12");

    // 그 종목의 연속은 08-12 에서 끊기고 사유가 남는다 — 이어붙이지 않는다.
    const rows = universe[0]!.map((d) => ({ date: d, net_value: 100, net_shares: 1 }));
    expect(computeStreak(rows, days)).toMatchObject({
      streak_days: 2,
      streak_start: "2026-08-13",
      streak_broken_by: "missing_data",
    });
  });

  it("표본이 얇으면 거래일로 판정하지 않는다 — 틀릴 거면 짧게 틀린다", () => {
    // 2종목만 관측 → minObserved(5) 미달.
    expect(deriveTradingDays([["2026-08-10"], ["2026-08-10"]])).toEqual([]);
  });

  it("절반 이하만 관측된 날은 거래일이 아니다 — 대량 수집 실패로 본다", () => {
    const universe = Array.from({ length: 20 }, (_, i) =>
      i < 6 ? ["2026-08-10", "2026-08-11"] : ["2026-08-11"]
    );
    const days = deriveTradingDays(universe);
    expect(days).toEqual(["2026-08-11"]); // 08-10 은 6/20 = 30%
  });

  it("빈 유니버스는 빈 목록이다 — 추측하지 않는다", () => {
    expect(deriveTradingDays([])).toEqual([]);
  });

  it("같은 종목이 같은 날짜를 중복 제출해도 한 번만 센다", () => {
    const universe = [["2026-08-10", "2026-08-10"], ...Array.from({ length: 3 }, () => ["2026-08-10"])];
    // 4종목만 관측 → minObserved 미달로 거래일 아님(중복이 표본 수를 부풀리지 못한다).
    expect(deriveTradingDays(universe)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { judge, isDue, addDays, type Bet } from "../outcome-judge";

const bet = (over: Partial<Bet>): Bet => ({
  pr: 1,
  issue: 10,
  metricId: "o1-kr3-blockers",
  expectedDirection: "down",
  baselineValue: 4,
  mergedAt: "2026-06-04",
  checkAfterDays: 7,
  status: "pending",
  ...over,
});

describe("addDays", () => {
  it("날짜 산술", () => {
    expect(addDays("2026-06-04", 7)).toBe("2026-06-11");
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
  });
});

describe("isDue", () => {
  it("pending + 기한 도래 → true", () => {
    expect(isDue(bet({ mergedAt: "2026-06-04", checkAfterDays: 7 }), "2026-06-11")).toBe(true);
    expect(isDue(bet({ mergedAt: "2026-06-04", checkAfterDays: 7 }), "2026-06-12")).toBe(true);
  });
  it("기한 전 → false", () => {
    expect(isDue(bet({ mergedAt: "2026-06-04", checkAfterDays: 7 }), "2026-06-10")).toBe(false);
  });
  it("이미 checked → false", () => {
    expect(isDue(bet({ status: "checked" }), "2026-12-31")).toBe(false);
  });
});

describe("judge", () => {
  it("원하는 방향(down)으로 의미있게 이동 → moved", () => {
    const v = judge(bet({ baselineValue: 4, expectedDirection: "down" }), 1, "2026-06-11");
    expect(v.verdict).toBe("moved");
    expect(v.baseline).toBe(4);
    expect(v.after).toBe(1);
  });
  it("반대 방향(증가했는데 down 기대) → worsened", () => {
    expect(judge(bet({ baselineValue: 4, expectedDirection: "down" }), 7, "x").verdict).toBe("worsened");
  });
  it("거의 변화 없음 → flat (5% 미만)", () => {
    expect(judge(bet({ baselineValue: 100, expectedDirection: "up" }), 102, "x").verdict).toBe("flat");
  });
  it("baseline 0 → 절대 1 이상 변화해야 이동", () => {
    expect(judge(bet({ baselineValue: 0, expectedDirection: "down" }), 0, "x").verdict).toBe("flat");
    expect(judge(bet({ baselineValue: 0, expectedDirection: "up" }), 2, "x").verdict).toBe("moved");
  });
  it("baseline 또는 현재값 null → unknown", () => {
    expect(judge(bet({ baselineValue: null }), 3, "x").verdict).toBe("unknown");
    expect(judge(bet({ baselineValue: 4 }), null, "x").verdict).toBe("unknown");
  });
  it("방향 미지정 + 변화 있음 → moved(중립 움직임)", () => {
    expect(judge(bet({ expectedDirection: null, baselineValue: 10 }), 4, "x").verdict).toBe("moved");
  });
  it("ledger 엔트리 형식", () => {
    const v = judge(bet({}), 1, "2026-06-11");
    expect(v).toMatchObject({ pr: 1, issue: 10, metricId: "o1-kr3-blockers", checkedAt: "2026-06-11" });
  });
});

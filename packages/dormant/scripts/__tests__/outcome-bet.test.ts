import { describe, it, expect } from "vitest";
import { parseTargetMetric, parseIssueRef, buildBet } from "../outcome-bet";

describe("parseTargetMetric", () => {
  it("Target-Metric / Expected-Direction 추출", () => {
    const t = "## 제안\nTarget-Metric: o1-kr3-blockers\nExpected-Direction: down";
    expect(parseTargetMetric(t)).toEqual({ metricId: "o1-kr3-blockers", direction: "down" });
  });
  it("필드 없으면 null", () => {
    expect(parseTargetMetric("그냥 제안")).toEqual({ metricId: null, direction: null });
  });
  it("placeholder(none/tbd/metric)는 무시", () => {
    expect(parseTargetMetric("Target-Metric: none").metricId).toBeNull();
    expect(parseTargetMetric("Target-Metric: <metric id>").metricId).toBeNull();
  });
  it("direction 만 있고 metric 없으면 metricId null", () => {
    expect(parseTargetMetric("Expected-Direction: up")).toEqual({ metricId: null, direction: "up" });
  });
});

describe("parseIssueRef", () => {
  it("첫 #NNN 추출", () => {
    expect(parseIssueRef("closes #305 and #307")).toBe(305);
  });
  it("없으면 null", () => {
    expect(parseIssueRef("no ref")).toBeNull();
  });
});

describe("buildBet", () => {
  const base = {
    pr: 312,
    snapshotValues: { "o1-kr3-blockers": 4, "o4-kr1-e2e": 1 },
    mergedAt: "2026-06-04",
  };

  it("Target-Metric 있으면 baseline 과 함께 베팅 카드 생성", () => {
    const bet = buildBet({
      ...base,
      text: "closes #300\nTarget-Metric: o1-kr3-blockers\nExpected-Direction: down",
    });
    expect(bet).not.toBeNull();
    expect(bet!.pr).toBe(312);
    expect(bet!.issue).toBe(300);
    expect(bet!.metricId).toBe("o1-kr3-blockers");
    expect(bet!.expectedDirection).toBe("down");
    expect(bet!.baselineValue).toBe(4);
    expect(bet!.checkAfterDays).toBe(7);
    expect(bet!.status).toBe("pending");
  });

  it("Target-Metric 없으면 null(베팅 카드 안 만듦)", () => {
    expect(buildBet({ ...base, text: "일반 PR, 지표 없음" })).toBeNull();
  });

  it("스냅샷에 해당 지표 없으면 baseline=null(unknown)", () => {
    const bet = buildBet({ ...base, text: "Target-Metric: o2-kr3-crash" });
    expect(bet).not.toBeNull();
    expect(bet!.baselineValue).toBeNull();
  });

  it("checkAfterDays 오버라이드", () => {
    const bet = buildBet({ ...base, text: "Target-Metric: o4-kr1-e2e", checkAfterDays: 0 });
    expect(bet!.checkAfterDays).toBe(0);
    expect(bet!.baselineValue).toBe(1);
  });
});

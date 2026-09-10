import { describe, expect, it } from "vitest";
import {
  buildQuietPickEvidenceLine,
  buildQuietPickHook,
  findBannedTerms,
  type QuietPickAnomalyFacts,
} from "../src";

/**
 * DS-01 §3-④ 근거 한 줄 — 칩 3개를 대신한다.
 * "최대 3항목 · 규모→인원→희소성 · 결론에 나온 숫자 반복 금지 · 같은 축 두 번 금지".
 */

const insider = (over: Partial<QuietPickAnomalyFacts> = {}): QuietPickAnomalyFacts => ({
  kind: "insider_cluster",
  actorNoun: "임원",
  scale: "$4.0M",
  days: 5,
  insiderCount: 2,
  priorBuys12mo: 3,
  volumePct: 51,
  ...over,
});

const streak = (over: Partial<QuietPickAnomalyFacts> = {}): QuietPickAnomalyFacts => ({
  kind: "institution_streak",
  actorNoun: "기관",
  scale: "74주",
  days: 25,
  isLongestStreak: true,
  streakWindowDays: 40,
  volumeVacuumRatio: 0.25,
  ...over,
});

describe("buildQuietPickEvidenceLine — 규모 → 인원 → 희소성", () => {
  it("임원 매수는 금액·인원·희소성 순서로 이어진다", () => {
    const line = buildQuietPickEvidenceLine(insider());
    expect(line.split(" · ")).toEqual(["$4.0M", "2명", "1년 매수 3건"]);
  });

  it("항목은 3개를 넘지 않는다", () => {
    const line = buildQuietPickEvidenceLine(insider({ mcapPct: 4, pctAboveYearLow: 2, mentionCount: 0 }));
    expect(line.split(" · ").length).toBeLessThanOrEqual(3);
  });

  it("결론에 이미 나온 숫자는 근거에서 빠진다 (같은 숫자 반복 금지)", () => {
    const facts = insider();
    const hook = buildQuietPickHook(facts); // "임원 2명이 최근 5일 새 같이 샀어요"
    const line = buildQuietPickEvidenceLine(facts, hook);
    expect(line).not.toContain("2명");
    // 훅이 말하지 않는 축은 남는다.
    expect(line).toContain("$4.0M");
  });

  it("연속 매수는 인원 항목이 없다", () => {
    const line = buildQuietPickEvidenceLine(streak());
    expect(line).not.toMatch(/\d+명/);
    expect(line.startsWith("74주")).toBe(true);
  });

  it("같은 축을 두 번 넣지 않는다", () => {
    // unusual 축(최장) 과 quiet 축(거래량 진공) 은 다른 축이라 둘 다 올 수 있지만, 각 축은 한 번만.
    const items = buildQuietPickEvidenceLine(streak()).split(" · ");
    expect(new Set(items).size).toBe(items.length);
  });

  it("규모가 비어 있으면 그 자리를 비워두지 않는다", () => {
    const line = buildQuietPickEvidenceLine(streak({ scale: "" }));
    expect(line.startsWith(" · ")).toBe(false);
    expect(line).not.toContain(" ·  · ");
  });

  it("금지어가 섞이지 않는다", () => {
    for (const facts of [insider(), streak()]) {
      expect(findBannedTerms(buildQuietPickEvidenceLine(facts))).toEqual([]);
    }
  });

  it("한 줄 예산(DS-01) 안에 들어간다", () => {
    for (const facts of [insider(), streak()]) {
      expect(buildQuietPickEvidenceLine(facts).length).toBeLessThanOrEqual(38);
    }
  });
});

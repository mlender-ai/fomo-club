import { describe, it, expect } from "vitest";
import {
  validateConstraint,
  activeConstraints,
  renderForLane,
  renderForBrief,
  dedupeAndCompact,
  normalizeRule,
  makeId,
  normalizeIncoming,
  mergeConstraints,
  type Constraint,
} from "../constraints";

const base = (over: Partial<Constraint>): Constraint => ({
  id: "c-1",
  rule: "테스트 규칙",
  scope: ["all"],
  kind: "prohibition",
  source: "test",
  permanent: true,
  createdAt: "2026-01-01",
  expiresAt: null,
  hits: 0,
  ...over,
});

describe("validateConstraint", () => {
  it("정상 객체를 통과시킨다", () => {
    expect(validateConstraint(base({})).id).toBe("c-1");
  });
  it("잘못된 kind 는 throw", () => {
    expect(() => validateConstraint(base({ kind: "bogus" as never }))).toThrow(/kind/);
  });
  it("빈 scope 는 throw", () => {
    expect(() => validateConstraint(base({ scope: [] }))).toThrow(/scope/);
  });
  it("비영구인데 expiresAt 없으면 throw", () => {
    expect(() => validateConstraint(base({ permanent: false, expiresAt: null }))).toThrow(/expiresAt/);
  });
});

describe("activeConstraints", () => {
  it("permanent 와 미만료만 남기고 만료된 것은 제외", () => {
    const all = [
      base({ id: "perm", permanent: true }),
      base({ id: "future", permanent: false, expiresAt: "2026-12-31" }),
      base({ id: "past", permanent: false, expiresAt: "2026-01-05" }),
    ];
    const active = activeConstraints(all, "2026-06-02");
    expect(active.map((c) => c.id).sort()).toEqual(["future", "perm"]);
  });
});

describe("renderForLane", () => {
  it("scope 에 lane 또는 all 이 포함된 것만 렌더", () => {
    const cs = [
      base({ id: "pmonly", rule: "PM 전용", scope: ["pm"] }),
      base({ id: "ctoonly", rule: "CTO 전용", scope: ["cto"] }),
      base({ id: "allrule", rule: "전체 규칙", scope: ["all"] }),
    ];
    const pm = renderForLane(cs, "pm");
    expect(pm).toContain("PM 전용");
    expect(pm).toContain("전체 규칙");
    expect(pm).not.toContain("CTO 전용");
  });
  it("all scope 는 모든 lane 에 나타난다", () => {
    const cs = [base({ rule: "전체", scope: ["all"] })];
    for (const lane of ["pm", "frontend", "cto", "security"]) {
      expect(renderForLane(cs, lane)).toContain("전체");
    }
  });
  it("매칭 없으면 빈 문자열", () => {
    expect(renderForLane([base({ scope: ["pm"] })], "qa")).toBe("");
  });
});

describe("renderForBrief", () => {
  it("비면 안내, 있으면 전체 나열", () => {
    expect(renderForBrief([])).toContain("없음");
    expect(renderForBrief([base({ rule: "X규칙" })])).toContain("X규칙");
  });
});

describe("dedupeAndCompact", () => {
  it("만료 constraint 를 제거한다", () => {
    const all = [
      base({ id: "keep", permanent: true }),
      base({ id: "expired", permanent: false, expiresAt: "2026-01-05" }),
    ];
    const { kept, removed } = dedupeAndCompact(all, "2026-06-02");
    expect(kept.map((c) => c.id)).toEqual(["keep"]);
    expect(removed.map((c) => c.id)).toEqual(["expired"]);
  });
  it("정규화 동일 rule 중복을 제거하고 scope/hits 병합", () => {
    const all = [
      base({ id: "a", rule: "데이터 불일치 배너 금지", scope: ["pm"], hits: 2 }),
      base({ id: "b", rule: "데이터  불일치  배너  금지!!", scope: ["frontend"], hits: 3 }),
    ];
    const { kept, removed } = dedupeAndCompact(all, "2026-06-02");
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(kept[0].hits).toBe(5);
    expect(kept[0].scope.sort()).toEqual(["frontend", "pm"]);
  });
});

describe("normalizeRule / makeId", () => {
  it("공백·구두점·대소문자 차이를 무시", () => {
    expect(normalizeRule("Hello, World!")).toBe(normalizeRule("helloworld"));
  });
  it("makeId 는 결정론적", () => {
    expect(makeId("데이터 불일치 금지", "2026-05-30")).toBe(makeId("데이터 불일치 금지", "2026-05-30"));
    expect(makeId("규칙", "2026-05-30")).toMatch(/^c-20260530-/);
  });
});

describe("normalizeIncoming / mergeConstraints", () => {
  it("부분 입력에 기본값을 채운다", () => {
    const c = normalizeIncoming({ rule: "새 규칙" }, "2026-06-02");
    expect(c.scope).toEqual(["all"]);
    expect(c.kind).toBe("prohibition");
    expect(c.permanent).toBe(true);
    expect(c.hits).toBe(0);
    expect(c.createdAt).toBe("2026-06-02");
  });
  it("기존과 중복인 후보는 skip, 새 것만 added", () => {
    const existing = [base({ id: "x", rule: "이미 있는 규칙" })];
    const merged = mergeConstraints(
      existing,
      [{ rule: "이미 있는 규칙" }, { rule: "완전히 새로운 규칙", scope: ["cto"] }],
      "2026-06-02",
    );
    expect(merged.added).toHaveLength(1);
    expect(merged.added[0].rule).toBe("완전히 새로운 규칙");
    expect(merged.skipped).toHaveLength(1);
    expect(merged.constraints).toHaveLength(2);
  });
  it("rule 없는 잘못된 후보는 skip", () => {
    const merged = mergeConstraints([], [{ rule: "" }], "2026-06-02");
    expect(merged.added).toHaveLength(0);
    expect(merged.skipped).toHaveLength(1);
  });
});

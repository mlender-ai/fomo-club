import { describe, it, expect } from "vitest";
import {
  lessonsFromMergedPRs,
  lessonsFromDecisions,
  parseDistilled,
  mergeLessons,
  renderDistilled,
  renderDailyNote,
} from "../knowledge-base";

describe("lessonsFromMergedPRs", () => {
  it("머지 PR → shipped 교훈 (Auto 접두사 제거 + ref)", () => {
    const l = lessonsFromMergedPRs([{ number: 457, title: "[Auto] #457 — 챌린지 상태 DB ChallengeState" }], "2026-06-10");
    expect(l[0]).toEqual({ date: "2026-06-10", kind: "shipped", text: "챌린지 상태 DB ChallengeState", ref: "PR#457" });
  });
  it("번호 없거나 제목 빈 PR 제외", () => {
    expect(lessonsFromMergedPRs([{ number: 0, title: "x" }, { number: 5, title: "  " }], "d")).toEqual([]);
  });
});

describe("parseDistilled / renderDistilled 라운드트립", () => {
  it("렌더한 걸 다시 파싱하면 동일 교훈", () => {
    const lessons = [
      { date: "2026-06-10", kind: "shipped" as const, text: "챌린지 DB", ref: "PR#457" },
      { date: "2026-06-09", kind: "decision" as const, text: "포인트 유료화 보류", ref: "issue#450" },
    ];
    const md = renderDistilled(lessons);
    const back = parseDistilled(md);
    expect(back).toHaveLength(2);
    expect(back.find((l) => l.ref === "PR#457")!.text).toBe("챌린지 DB");
    expect(back.find((l) => l.ref === "issue#450")!.kind).toBe("decision");
  });
  it("최신 날짜가 위로 정렬", () => {
    const md = renderDistilled([
      { date: "2026-06-08", kind: "shipped" as const, text: "a", ref: "PR#1" },
      { date: "2026-06-10", kind: "shipped" as const, text: "b", ref: "PR#2" },
    ]);
    expect(md.indexOf("PR#2")).toBeLessThan(md.indexOf("PR#1"));
  });
});

describe("mergeLessons (멱등 누적)", () => {
  const existing = [{ date: "2026-06-09", kind: "shipped" as const, text: "기존", ref: "PR#100" }];
  it("같은 ref 는 중복 적재 안 함", () => {
    const merged = mergeLessons(existing, [{ date: "2026-06-10", kind: "shipped", text: "갱신본", ref: "PR#100" }]);
    expect(merged).toHaveLength(1);
  });
  it("새 ref 는 추가", () => {
    const merged = mergeLessons(existing, [{ date: "2026-06-10", kind: "shipped", text: "신규", ref: "PR#101" }]);
    expect(merged).toHaveLength(2);
  });
  it("ref 없으면 text 로 중복 판정", () => {
    const ex = [{ date: "d", kind: "decision" as const, text: "포인트 보류", ref: "" }];
    expect(mergeLessons(ex, [{ date: "d2", kind: "decision", text: "포인트 보류", ref: "" }])).toHaveLength(1);
    expect(mergeLessons(ex, [{ date: "d2", kind: "decision", text: "다른 결정", ref: "" }])).toHaveLength(2);
  });
});

describe("renderDailyNote", () => {
  it("출고·결정·제약 hit 섹션", () => {
    const lessons = [
      ...lessonsFromMergedPRs([{ number: 457, title: "[Auto] #457 — 챌린지 DB" }], "2026-06-10"),
      ...lessonsFromDecisions(["포인트 유료화 보류"], "2026-06-10"),
    ];
    const note = renderDailyNote("2026-06-10", lessons, [{ id: "c-tarot-reject", count: 2 }]);
    expect(note).toContain("2026-06-10 — 에이전트 두뇌 daily");
    expect(note).toContain("챌린지 DB [PR#457]");
    expect(note).toContain("포인트 유료화 보류");
    expect(note).toContain("c-tarot-reject: 2회");
  });
  it("빈 입력은 (없음)", () => {
    const note = renderDailyNote("2026-06-10", [], []);
    expect(note).toContain("- (없음)");
  });
});

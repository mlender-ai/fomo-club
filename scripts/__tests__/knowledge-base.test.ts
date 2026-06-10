import { describe, it, expect } from "vitest";
import {
  lessonsFromMergedPRs,
  lessonsFromDecisions,
  lessonsFromConstraints,
  extractPlanDecisions,
  compactLessons,
  parseDistilled,
  mergeLessons,
  renderDistilled,
  renderDailyNote,
} from "../knowledge-base";

describe("extractPlanDecisions", () => {
  const body = [
    "## 🗺️ 상위 프로젝트: P2",
    "본문",
    "## ✅ CEO 결정 (승인 — 일부 수정 반영)",
    "- 🚫 **포모 포인트의 사용처/유료화는 보류.** 향후 별도 논의.",
    "- ✅ 이번엔 적립 로직만 설계·구현한다",
    "- 짧음",
    "## 기능 요구사항",
    "- 이건 결정 아님",
  ].join("\n");
  it("CEO 결정 섹션의 불릿만 추출(마크업 정리, 다음 섹션 제외)", () => {
    const d = extractPlanDecisions(body);
    expect(d).toHaveLength(2);
    expect(d[0]).toContain("포모 포인트의 사용처/유료화는 보류");
    expect(d[0]).not.toContain("**");
    expect(d.some((x) => x.includes("결정 아님"))).toBe(false);
  });
  it("섹션 없으면 빈 배열", () => {
    expect(extractPlanDecisions("# 그냥 문서\n- 불릿")).toEqual([]);
  });
});

describe("compactLessons", () => {
  it("rule/decision 전부 보존, shipped 는 최신 N개", () => {
    const lessons = [
      { date: "2026-06-01", kind: "rule" as const, text: "규칙", ref: "c-1" },
      { date: "2026-06-01", kind: "decision" as const, text: "결정", ref: "" },
      { date: "2026-06-01", kind: "shipped" as const, text: "옛출고", ref: "PR#1" },
      { date: "2026-06-09", kind: "shipped" as const, text: "신출고1", ref: "PR#2" },
      { date: "2026-06-10", kind: "shipped" as const, text: "신출고2", ref: "PR#3" },
    ];
    const c = compactLessons(lessons, 2);
    expect(c.filter((l) => l.kind !== "shipped")).toHaveLength(2);
    const shipped = c.filter((l) => l.kind === "shipped");
    expect(shipped.map((l) => l.ref)).toEqual(["PR#3", "PR#2"]); // 최신 2개만
  });
});

describe("lessonsFromConstraints", () => {
  it("active constraint → rule 교훈 (ref=id, createdAt 우선)", () => {
    const l = lessonsFromConstraints(
      [{ id: "c-tarot-reject", rule: "타로 신규작업 거부", createdAt: "2026-06-09" }],
      "2026-06-10",
    );
    expect(l[0]).toEqual({ date: "2026-06-09", kind: "rule", text: "타로 신규작업 거부", ref: "c-tarot-reject" });
  });
  it("id/rule 없으면 제외, createdAt 없으면 fallback", () => {
    const l = lessonsFromConstraints([{ id: "", rule: "x" }, { id: "c1", rule: "규칙" }], "2026-06-10");
    expect(l).toHaveLength(1);
    expect(l[0]!.date).toBe("2026-06-10");
  });
});

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
  it("decision 은 같은 ref(이슈)에 여러 결정 허용 — ref+text 멱등", () => {
    const ex = [{ date: "d", kind: "decision" as const, text: "포인트 유료화 보류", ref: "issue#450" }];
    const merged = mergeLessons(ex, [
      { date: "d", kind: "decision", text: "적립 로직만 구현", ref: "issue#450" }, // 같은 이슈, 다른 결정 → 추가
      { date: "d2", kind: "decision", text: "포인트 유료화 보류", ref: "issue#450" }, // 동일 → 스킵
    ]);
    expect(merged).toHaveLength(2);
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

import { describe, it, expect } from "vitest";
import {
  buildLaneState,
  renderLaneSliceMarkdown,
  renderLaneStateJson,
  extractIssueRefs,
  mergedPrIssueRefs,
  type BuildInput,
} from "../build-lane-state";

describe("extractIssueRefs", () => {
  it("#NNN / closes #NNN 형태를 모두 추출하고 중복 제거한다", () => {
    expect(extractIssueRefs("fix: foo (closes #262) and #262 also #270").sort()).toEqual([262, 270]);
    expect(extractIssueRefs("")).toEqual([]);
  });
});

describe("mergedPrIssueRefs", () => {
  it("PR 제목+본문에서 참조 이슈 번호를 모은다", () => {
    const refs = mergedPrIssueRefs([
      { number: 300, title: "feat: SWR (closes #267)", body: "also #268" },
      { number: 301, title: "chore: noop", body: "" },
    ]);
    expect([...refs].sort()).toEqual([267, 268]);
  });
});

describe("buildLaneState 분류", () => {
  it("머지 PR 연결된 닫힌 이슈 → DONE", () => {
    const input: BuildInput = {
      mergedPRs: [{ number: 262, title: "feat: SWR TTL (closes #267)" }],
      closedIssues: [{ number: 267, title: "[CTO] SWR TTL 차등화", lane: "cto" }],
      openIssues: [],
    };
    const state = buildLaneState(input);
    expect(state.cto.done.map((e) => e.number)).toEqual([267]);
    expect(state.cto.killed).toEqual([]);
    expect(state.cto.closedUnknown).toEqual([]);
  });

  it("머지 PR 연결 없는 score-missing 닫힌 이슈 → KILLED(reason)", () => {
    const input: BuildInput = {
      mergedPRs: [],
      closedIssues: [
        { number: 277, title: "[CTO] SWR TTL 최적화", lane: "cto", scoreLabel: "score-missing" },
      ],
      openIssues: [],
    };
    const state = buildLaneState(input);
    expect(state.cto.killed).toHaveLength(1);
    expect(state.cto.killed[0].number).toBe(277);
    expect(state.cto.killed[0].reason).toBe("score-missing");
    expect(state.cto.done).toEqual([]);
  });

  it("연결·라벨 둘 다 애매 → CLOSED(사유불명), KILLED 아님", () => {
    const input: BuildInput = {
      mergedPRs: [],
      closedIssues: [{ number: 290, title: "[PM] 모호한 제안", lane: "pm" }],
      openIssues: [],
    };
    const state = buildLaneState(input);
    expect(state.pm.killed).toEqual([]);
    expect(state.pm.closedUnknown.map((e) => e.number)).toEqual([290]);
  });

  it("CEO 킬리스트 번호 → KILLED(ceo-killlist)", () => {
    const input: BuildInput = {
      mergedPRs: [],
      closedIssues: [{ number: 288, title: "[Designer] 글로우 효과", lane: "design" }],
      openIssues: [],
      ceoKilledNumbers: [288],
    };
    const state = buildLaneState(input);
    expect(state.design.killed[0].reason).toBe("ceo-killlist");
  });

  it("open score-strong/conditional → IN-PROGRESS, 그 외 open 은 무시", () => {
    const input: BuildInput = {
      mergedPRs: [],
      closedIssues: [],
      openIssues: [
        { number: 269, title: "[QA] THREE_CARD", lane: "qa", scoreLabel: "score-strong" },
        { number: 270, title: "[QA] 미채점", lane: "qa", scoreLabel: "score-none" },
      ],
    };
    const state = buildLaneState(input);
    expect(state.qa.inProgress.map((e) => e.number)).toEqual([269]);
  });
});

describe("renderLaneSliceMarkdown", () => {
  it("DONE/KILLED/IN-PROGRESS 섹션을 정확히 포함한다", () => {
    const input: BuildInput = {
      mergedPRs: [{ number: 262, title: "feat (closes #267)" }],
      closedIssues: [
        { number: 267, title: "[CTO] SWR 차등화", lane: "cto" },
        { number: 277, title: "[CTO] SWR 최적화", lane: "cto", scoreLabel: "score-missing" },
      ],
      openIssues: [{ number: 269, title: "[CTO] 캐시 워밍", lane: "cto", scoreLabel: "score-strong" }],
    };
    const md = renderLaneSliceMarkdown(buildLaneState(input), "cto");
    expect(md).toContain("✅ DONE");
    expect(md).toContain("#267");
    expect(md).toContain("❌ KILLED");
    expect(md).toContain("#277");
    expect(md).toContain("🔄 IN-PROGRESS");
    expect(md).toContain("#269");
  });

  it("빈 lane → '이력 없음' 안내", () => {
    const md = renderLaneSliceMarkdown(buildLaneState({ mergedPRs: [], closedIssues: [], openIssues: [] }), "pm");
    expect(md).toContain("이력 없음");
  });

  it("degrade 마커 → 보수적 조회 실패 안내", () => {
    const degraded = JSON.parse('{"__degraded__": true}');
    const md = renderLaneSliceMarkdown(degraded, "pm");
    expect(md).toContain("조회 실패");
    expect(md).toContain("자제");
  });
});

describe("renderLaneStateJson", () => {
  it("round-trip 파싱 가능한 JSON 을 만든다", () => {
    const state = buildLaneState({ mergedPRs: [], closedIssues: [], openIssues: [] });
    const json = renderLaneStateJson(state);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).pm).toBeDefined();
  });
});

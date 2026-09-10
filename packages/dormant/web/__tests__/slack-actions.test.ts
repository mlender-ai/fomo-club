import { describe, it, expect } from "vitest";
import { parseActions, KNOWN_ACTIONS, HIGH_IMPACT_ACTIONS } from "@/lib/slack/actions";

describe("parseActions", () => {
  it("페이로드 없는 액션을 파싱하고 토큰 제거", () => {
    const r = parseActions("의회 돌릴게요.\n[[ACTION:run_council]]");
    expect(r.actions).toEqual([{ name: "run_council", payload: {} }]);
    expect(r.cleaned).toBe("의회 돌릴게요.");
  });

  it("JSON 페이로드 액션 파싱", () => {
    const r = parseActions('머지합니다.\n[[ACTION:merge]] {"pr":291}');
    expect(r.actions).toEqual([{ name: "merge", payload: { pr: 291 } }]);
    expect(r.cleaned).toBe("머지합니다.");
  });

  it("comment 액션 본문 파싱", () => {
    const r = parseActions('남길게요 [[ACTION:comment]] {"issue":298,"body":"온보딩은 토스 스타일로"}');
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]!.name).toBe("comment");
    expect(r.actions[0]!.payload).toEqual({ issue: 298, body: "온보딩은 토스 스타일로" });
  });

  it("벌크 액션: merge_all (페이로드 없음)", () => {
    const r = parseActions("이상 없는 PR 전부 머지할게요.\n[[ACTION:merge_all]]");
    expect(r.actions).toEqual([{ name: "merge_all", payload: {} }]);
    expect(r.cleaned).toBe("이상 없는 PR 전부 머지할게요.");
  });

  it("벌크 액션: close_completed (페이로드 없음)", () => {
    const r = parseActions("완료된 이슈 정리합니다.\n[[ACTION:close_completed]]");
    expect(r.actions).toEqual([{ name: "close_completed", payload: {} }]);
  });

  it("merge_all + close_completed 동시 (한 메시지 두 토큰)", () => {
    const r = parseActions("머지하고 이슈 닫을게요.\n[[ACTION:merge_all]]\n[[ACTION:close_completed]]");
    expect(r.actions.map((a) => a.name)).toEqual(["merge_all", "close_completed"]);
  });

  it("벌크 액션: close_all (페이로드 없음)", () => {
    const r = parseActions("열린 이슈 전부 닫을게요.\n[[ACTION:close_all]]");
    expect(r.actions).toEqual([{ name: "close_all", payload: {} }]);
    expect(r.cleaned).toBe("열린 이슈 전부 닫을게요.");
  });

  it("merge_all + close_all 동시 (한 메시지 두 토큰)", () => {
    const r = parseActions("머지하고 이슈 다 닫을게요.\n[[ACTION:merge_all]]\n[[ACTION:close_all]]");
    expect(r.actions.map((a) => a.name)).toEqual(["merge_all", "close_all"]);
  });

  // 2026-06-11 사고: LLM 이 같은 토큰을 2번 출력 → 워크플로 2번 dispatch → main push race
  it("같은 액션 중복 출력은 한 번만 (멱등)", () => {
    const r = parseActions("프로젝트 제안할게요.\n[[ACTION:propose_projects]]\n[[ACTION:propose_projects]]");
    expect(r.actions).toEqual([{ name: "propose_projects", payload: {} }]);
  });

  it("같은 이름이라도 페이로드가 다르면 둘 다 유지", () => {
    const r = parseActions('[[ACTION:merge]] {"pr":1}\n[[ACTION:merge]] {"pr":2}');
    expect(r.actions).toEqual([
      { name: "merge", payload: { pr: 1 } },
      { name: "merge", payload: { pr: 2 } },
    ]);
  });

  it("merge_all·close_completed·close_all 은 고영향으로 분류", () => {
    expect(HIGH_IMPACT_ACTIONS.has("merge_all")).toBe(true);
    expect(HIGH_IMPACT_ACTIONS.has("close_completed")).toBe(true);
    expect(HIGH_IMPACT_ACTIONS.has("close_all")).toBe(true);
    expect(KNOWN_ACTIONS.has("merge_all")).toBe(true);
    expect(KNOWN_ACTIONS.has("close_completed")).toBe(true);
    expect(KNOWN_ACTIONS.has("close_all")).toBe(true);
  });

  it("하위호환: [[TRIGGER_IMPLEMENT]] → implement", () => {
    const r = parseActions("개발 시작!\n[[TRIGGER_IMPLEMENT]]");
    expect(r.actions).toEqual([{ name: "implement", payload: {} }]);
    expect(r.cleaned).toBe("개발 시작!");
  });

  it("하위호환: [[ADD_CONSTRAINT]]{json} → add_constraint", () => {
    const r = parseActions('규칙 등록합니다 [[ADD_CONSTRAINT]]{"rule":"X 금지","scope":["all"]}');
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]!.name).toBe("add_constraint");
    expect(r.actions[0]!.payload).toEqual({ rule: "X 금지", scope: ["all"] });
    expect(r.cleaned).toBe("규칙 등록합니다");
  });

  it("알 수 없는 액션은 무시", () => {
    const r = parseActions("[[ACTION:delete_everything]] {}");
    expect(r.actions).toEqual([]);
  });

  it("액션 없으면 빈 배열 + 원문 유지", () => {
    const r = parseActions("그냥 일반 답변입니다.");
    expect(r.actions).toEqual([]);
    expect(r.cleaned).toBe("그냥 일반 답변입니다.");
  });

  it("잘못된 JSON 은 빈 payload 로 안전 처리", () => {
    const r = parseActions("[[ACTION:implement]] {bad json}");
    expect(r.actions).toEqual([{ name: "implement", payload: {} }]);
  });
});

describe("log_feedback 액션", () => {
  it("note 페이로드 파싱", () => {
    const r = parseActions('기억할게요 [[ACTION:log_feedback]] {"note":"온보딩은 토스 스타일 선호"}');
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]!.name).toBe("log_feedback");
    expect(r.actions[0]!.payload).toEqual({ note: "온보딩은 토스 스타일 선호" });
  });
});

describe("액션 집합", () => {
  it("KNOWN_ACTIONS 에 7개 포함", () => {
    for (const a of ["run_council", "implement", "merge", "approve", "comment", "add_constraint", "log_feedback", "pipeline_check", "source_discovery", "integrity_check", "monitor"]) {
      expect(KNOWN_ACTIONS.has(a)).toBe(true);
    }
  });
  it("HIGH_IMPACT 에 merge/implement/add_constraint", () => {
    expect(HIGH_IMPACT_ACTIONS.has("merge")).toBe(true);
    expect(HIGH_IMPACT_ACTIONS.has("run_council")).toBe(false);
  });
});

describe("select_project 액션 (톱다운 프로젝트 선택)", () => {
  it("id 페이로드 파싱", () => {
    const r = parseActions('P1 시작할게요 [[ACTION:select_project]] {"id":"P1"}');
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]!.name).toBe("select_project");
    expect(r.actions[0]!.payload).toEqual({ id: "P1" });
    expect(r.cleaned).toBe("P1 시작할게요");
  });
  it("KNOWN + HIGH_IMPACT 에 포함", () => {
    expect(KNOWN_ACTIONS.has("select_project")).toBe(true);
    expect(HIGH_IMPACT_ACTIONS.has("select_project")).toBe(true);
  });
  it("propose_projects 는 KNOWN (페이로드 없음)", () => {
    const r = parseActions("프로젝트 제안해드릴게요\n[[ACTION:propose_projects]]");
    expect(r.actions).toEqual([{ name: "propose_projects", payload: {} }]);
    expect(KNOWN_ACTIONS.has("propose_projects")).toBe(true);
  });
  it("approve_plan id 파싱 + KNOWN/HIGH_IMPACT", () => {
    const r = parseActions('P2 기획 승인합니다 [[ACTION:approve_plan]] {"id":"P2"}');
    expect(r.actions).toEqual([{ name: "approve_plan", payload: { id: "P2" } }]);
    expect(KNOWN_ACTIONS.has("approve_plan")).toBe(true);
    expect(HIGH_IMPACT_ACTIONS.has("approve_plan")).toBe(true);
  });
  it("implement_task issue 파싱 + KNOWN/HIGH_IMPACT", () => {
    const r = parseActions('457 개발할게요 [[ACTION:implement_task]] {"issue":457}');
    expect(r.actions).toEqual([{ name: "implement_task", payload: { issue: 457 } }]);
    expect(KNOWN_ACTIONS.has("implement_task")).toBe(true);
    expect(HIGH_IMPACT_ACTIONS.has("implement_task")).toBe(true);
  });
  it("monitor 액션 파싱 + KNOWN/HIGH_IMPACT", () => {
    const r = parseActions("데일리 모니터링 실행\n[[ACTION:monitor]]");
    expect(r.actions).toEqual([{ name: "monitor", payload: {} }]);
    expect(KNOWN_ACTIONS.has("monitor")).toBe(true);
    expect(HIGH_IMPACT_ACTIONS.has("monitor")).toBe(true);
  });
  it("monitor 보고 전용 페이로드 파싱", () => {
    const r = parseActions('보고만 실행\n[[ACTION:monitor]] {"auto_fix":false}');
    expect(r.actions).toEqual([{ name: "monitor", payload: { auto_fix: false } }]);
  });
});

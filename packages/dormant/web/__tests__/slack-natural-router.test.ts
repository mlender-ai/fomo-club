import { describe, expect, it } from "vitest";
import { routeNaturalLanguage } from "@/lib/slack/natural-router";

function names(text: string) {
  return routeNaturalLanguage(text).actions.map((action) => action.name);
}

describe("routeNaturalLanguage", () => {
  it("파이프라인 점검 요청을 pipeline_check로 라우팅", () => {
    const r = routeNaturalLanguage("파이프라인 점검해. fallback 비율도 봐줘");
    expect(r.confidence).toBe("high");
    expect(r.actions).toEqual([
      { name: "pipeline_check", payload: { query: "파이프라인 점검해. fallback 비율도 봐줘" } },
    ]);
  });

  it("소스 후보 발굴 요청을 source_discovery로 라우팅", () => {
    expect(names("소스 후보 찾아줘. 한국 개인투자자 커뮤니티 중심으로")).toEqual(["source_discovery"]);
    expect(names("source candidate research 해줘")).toEqual(["source_discovery"]);
  });

  it("정합성/금칙어 검수 요청을 integrity_check로 라우팅", () => {
    expect(names("정합성 체크해. 투자조언 표현도 같이 봐줘")).toEqual(["integrity_check"]);
    expect(names("grounding 검증해줘")).toEqual(["integrity_check"]);
  });

  it("데일리 제품 모니터링 요청을 monitor로 라우팅", () => {
    expect(routeNaturalLanguage("데일리 제품 모니터링 돌려줘").actions[0]).toEqual({ name: "monitor", payload: { auto_fix: true } });
    expect(routeNaturalLanguage("제품 모니터링 보고만 해줘").actions[0]).toEqual({ name: "monitor", payload: { auto_fix: false } });
  });

  it("조회/상태 질문은 실행하지 않음", () => {
    expect(routeNaturalLanguage("파이프라인 상태 알려줘").confidence).toBe("low");
    expect(routeNaturalLanguage("개발됐어?").confidence).toBe("low");
    expect(routeNaturalLanguage("PR 뭐 있어?").confidence).toBe("low");
  });

  it("프로젝트 자율 제안은 실행하지 않고 LLM/안내 경로로 넘김", () => {
    expect(routeNaturalLanguage("프로젝트 제안해줘").confidence).toBe("low");
  });

  it("사람이 지정한 프로젝트 단계는 액션으로 라우팅", () => {
    expect(routeNaturalLanguage("P1 시작하자").actions[0]).toEqual({ name: "select_project", payload: { id: "P1" } });
    expect(routeNaturalLanguage("P2 기획 승인").actions[0]).toEqual({ name: "approve_plan", payload: { id: "P2" } });
  });

  it("특정 이슈 개발과 일반 개발을 구분", () => {
    expect(routeNaturalLanguage("#457 개발해").actions[0]).toEqual({ name: "implement_task", payload: { issue: 457 } });
    expect(routeNaturalLanguage("오늘자 이슈 작업 진행해줘").actions[0]).toEqual({ name: "implement", payload: { target: "latest_issue" } });
    expect(routeNaturalLanguage("다음 작업 개발 진행해").actions[0]).toEqual({ name: "implement", payload: { target: "latest_issue" } });
  });

  it("PR 머지와 이슈 닫기를 안전하게 분류", () => {
    expect(routeNaturalLanguage("PR #602 머지해").actions[0]).toEqual({ name: "merge", payload: { pr: 602 } });
    expect(routeNaturalLanguage("이상 없으면 PR 전부 머지").actions[0]).toEqual({ name: "merge_all", payload: {} });
    expect(routeNaturalLanguage("완료된 이슈 닫아").actions[0]).toEqual({ name: "close_completed", payload: {} });
    expect(routeNaturalLanguage("이슈 전부 닫아").actions[0]).toEqual({ name: "close_all", payload: {} });
  });

  it("머지하고 이슈 닫아 같은 복합 지시를 두 액션으로 라우팅", () => {
    expect(routeNaturalLanguage("이상 없으면 PR 머지하고 이슈도 닫아").actions).toEqual([
      { name: "merge_all", payload: {} },
      { name: "close_all", payload: {} },
    ]);
  });
});

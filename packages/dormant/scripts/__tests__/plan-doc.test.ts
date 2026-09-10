import { describe, it, expect } from "vitest";
import { planDocReady, renderPlanDocIssue, renderPlanDocSlack } from "../plan-doc";

const prd = `## 배경
사용자가 매일 올 이유가 약하다.
## 목표
데일리 챌린지로 재방문 +10%.
## 기능 요구사항
- 챌린지 카드, 포인트, 완료 화면.`;

describe("planDocReady", () => {
  it("충분한 분량이면 true", () => {
    expect(planDocReady(prd)).toBe(true);
  });
  it("빈/짧은 건 false", () => {
    expect(planDocReady("")).toBe(false);
    expect(planDocReady("짧음")).toBe(false);
  });
});

describe("renderPlanDocIssue", () => {
  it("상위 프로젝트·승인 안내·PRD 본문 포함", () => {
    const b = renderPlanDocIssue("P2", "게임화 데일리 챌린지", prd);
    expect(b).toContain("상위 프로젝트: P2 · 게임화 데일리 챌린지");
    expect(b).toContain("P2 기획 승인");
    expect(b).toContain("데일리 챌린지로 재방문");
    expect(b).toContain("보류/수정");
  });
  it("PRD 비면 경고 문구", () => {
    expect(renderPlanDocIssue("P2", "x", "")).toContain("비었거나 너무 짧");
  });
});

describe("renderPlanDocSlack", () => {
  it("승인 안내 한 줄", () => {
    const s = renderPlanDocSlack("P2", "챌린지", "http://x");
    expect(s).toContain("기획문서 작성됨");
    expect(s).toContain("P2 기획 승인");
    expect(s).toContain("http://x");
  });
});

import { describe, it, expect } from "vitest";
import { parseProposals, renderRoadmap, renderProposalIssue, renderProposalSlack } from "../project-proposal";
import { parseRoadmap, getActiveProject } from "../project-roadmap";

const raw = JSON.stringify([
  { title: "단 하나의 사랑스러운 순간", why: "제품의 심장", success: "창업자가 열고 싶다", scope: "포모·감정선택·한마디", milestone: "M1", okr: "O1, O3" },
  { title: "매일 돌아올 이유", why: "습관화", success: "잔잔한 날도 연다", scope: "감정 캘린더", milestone: "M2", okr: "O3" },
  { bad: "no title" },
]);

describe("parseProposals", () => {
  it("title 있는 후보만, id P1.. 재채번", () => {
    const c = parseProposals(raw);
    expect(c.map((x) => x.id)).toEqual(["P1", "P2"]);
    expect(c[0]!.milestone).toBe("M1");
    expect(c[1]!.title).toBe("매일 돌아올 이유");
  });
  it("코드펜스 허용", () => {
    expect(parseProposals("```json\n" + raw + "\n```")).toHaveLength(2);
  });
  it("불량 입력 빈 배열", () => {
    expect(parseProposals("nope")).toEqual([]);
    expect(parseProposals("")).toEqual([]);
  });
});

describe("renderRoadmap → project-roadmap 재파싱 라운드트립", () => {
  it("생성된 로드맵이 parseRoadmap 으로 다시 읽힌다(전부 backlog)", () => {
    const md = renderRoadmap(parseProposals(raw));
    const ps = parseRoadmap(md);
    expect(ps.map((p) => p.id)).toEqual(["P1", "P2"]);
    expect(ps[0]!.title).toBe("단 하나의 사랑스러운 순간");
    expect(ps.every((p) => p.status === "backlog")).toBe(true);
    expect(getActiveProject(ps)).toBeNull();
    expect(md).toContain("## 진행 원칙");
  });
});

describe("renderProposalIssue / Slack", () => {
  it("제안서에 후보·임팩트·성공기준 포함", () => {
    const txt = renderProposalIssue(parseProposals(raw));
    expect(txt).toContain("CEO 프로젝트 제안");
    expect(txt).toContain("P1 · 단 하나의 사랑스러운 순간");
    expect(txt).toContain("제품의 심장");
    expect(txt).toContain("P1 시작");
  });
  it("후보 0건 안내", () => {
    expect(renderProposalIssue([])).toContain("실패");
    expect(renderProposalSlack([])).toContain("0건");
  });
  it("Slack 요약은 후보별 한 줄", () => {
    const s = renderProposalSlack(parseProposals(raw));
    expect(s).toContain("*P1*");
    expect(s).toContain("*P2*");
  });
});

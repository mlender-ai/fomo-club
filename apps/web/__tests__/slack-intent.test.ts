import { describe, it, expect } from "vitest";
import { classifyIntent, extractNumbers, truncate } from "@/lib/slack/intent";

describe("extractNumbers", () => {
  it("#NNN 을 추출하고 중복 제거", () => {
    expect(extractNumbers("이슈 #298 과 #298, #301 봐줘")).toEqual([298, 301]);
    expect(extractNumbers("번호 없음")).toEqual([]);
  });
  it("최대 5개", () => {
    expect(extractNumbers("#1 #2 #3 #4 #5 #6 #7")).toHaveLength(5);
  });
});

describe("classifyIntent", () => {
  it("브리핑 질문 → brief", () => {
    expect(classifyIntent("오늘자 CEO 브리핑 내용 알려줘").kind).toBe("brief");
  });
  it("PR + 번호 → pr, prNumbers 채움", () => {
    const r = classifyIntent("이 PR #291 머지해줘");
    expect(r.kind).toBe("pr");
    expect(r.prNumbers).toEqual([291]);
    expect(r.issueNumbers).toEqual([]);
  });
  it("이슈 번호만 → issue, issueNumbers 채움", () => {
    const r = classifyIntent("#298 이슈 뭐야?");
    expect(r.kind).toBe("issue");
    expect(r.issueNumbers).toEqual([298]);
    expect(r.prNumbers).toEqual([]);
  });
  it("의회/실행 → workflow", () => {
    expect(classifyIntent("지금 의회 한 번 돌려").kind).toBe("workflow");
    expect(classifyIntent("현재 진행 상황 status").kind).toBe("workflow");
  });
  it("규칙 → constraints", () => {
    expect(classifyIntent("등록된 규칙 목록 보여줘").kind).toBe("constraints");
  });
  it("일반 잡담 → general, 번호 없음", () => {
    const r = classifyIntent("안녕 오늘 기분 어때");
    expect(r.kind).toBe("general");
    expect(r.issueNumbers).toEqual([]);
    expect(r.prNumbers).toEqual([]);
  });
  it("브리핑이 PR 키워드보다 우선", () => {
    // 브리핑 질문에 우연히 숫자가 있어도 brief 로 분류
    expect(classifyIntent("브리핑 #298 요약").kind).toBe("brief");
  });
});

describe("truncate", () => {
  it("긴 텍스트를 자르고 생략 표기", () => {
    const t = truncate("a".repeat(5000), 3000);
    expect(t.length).toBeLessThan(3100);
    expect(t).toContain("생략");
  });
  it("짧으면 그대로", () => {
    expect(truncate("짧음", 3000)).toBe("짧음");
  });
});

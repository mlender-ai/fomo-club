import { describe, it, expect } from "vitest";
import { resolveAgent, axisHeader, AXES } from "@/lib/slack/agents";

describe("resolveAgent — 명시 멘션 우선", () => {
  it("@CTO → cto", () => {
    expect(resolveAgent("@CTO 이거 구현 가능해?").id).toBe("cto");
  });
  it("@PM → pm", () => {
    expect(resolveAgent("@PM 이 기능 우선순위 어때").id).toBe("pm");
  });
  it("@Security → security", () => {
    expect(resolveAgent("@Security 검토 부탁").id).toBe("security");
  });
  it("한글 멘션 @보안 → security", () => {
    expect(resolveAgent("@보안 이거 안전해?").id).toBe("security");
  });
  it("대소문자 무시", () => {
    expect(resolveAgent("@cto 봐줘").id).toBe("cto");
  });
});

describe("resolveAgent — 멘션 없으면 키워드 휴리스틱", () => {
  it("보안 키워드 → security", () => {
    expect(resolveAgent("이 결제 흐름에 취약점 없어?").id).toBe("security");
  });
  it("제품/사용자 키워드 → pm", () => {
    expect(resolveAgent("이 기능이 사용자 리텐션에 가치 있을까").id).toBe("pm");
  });
  it("구현/코드 키워드 → cto", () => {
    expect(resolveAgent("이 API 빌드 성능 어때").id).toBe("cto");
  });
});

describe("resolveAgent — 기본값", () => {
  it("아무 단서 없으면 default(Hermes)", () => {
    expect(resolveAgent("안녕 오늘 상태 어때").id).toBe("default");
  });
});

describe("resolveAgent — @ 없는 호명/호출 (실사용 패턴)", () => {
  it("'Pm 호출해봐' → pm (@ 없이도)", () => {
    expect(resolveAgent("Pm 호출해봐").id).toBe("pm");
  });
  it("'CTO한테 물어봐' → cto", () => {
    expect(resolveAgent("CTO한테 물어봐").id).toBe("cto");
  });
  it("'보안 의견 줘' → security", () => {
    expect(resolveAgent("보안 의견 줘").id).toBe("security");
  });
  it("문장 맨 앞 이름 호명 'PM 이거 어때' → pm", () => {
    expect(resolveAgent("PM 이거 어때").id).toBe("pm");
  });
  it("'개발해줘' 는 호출 아님 → cto로 오인하지 않음(default)", () => {
    expect(resolveAgent("개발해줘").id).toBe("default");
  });
});

describe("axisHeader — 본문 발화자 헤더 (스코프 무관 가시성)", () => {
  it("비-default 축은 이모지+이름 헤더", () => {
    expect(axisHeader(AXES.find((a) => a.id === "cto")!)).toContain("CTO Agent");
    expect(axisHeader(AXES.find((a) => a.id === "security")!)).toMatch(/:shield:/);
  });
  it("default(Hermes)는 헤더 없음(운영봇 — 잡음 최소화)", () => {
    expect(axisHeader(AXES.find((a) => a.id === "default")!)).toBe("");
  });
});

describe("AXES 레지스트리", () => {
  it("4개 축 정의 (cto/pm/security/default)", () => {
    const ids = AXES.map((a) => a.id).sort();
    expect(ids).toEqual(["cto", "default", "pm", "security"]);
  });
  it("각 축은 username·icon_emoji·personaPrompt 보유", () => {
    for (const a of AXES) {
      expect(a.username.length).toBeGreaterThan(0);
      expect(a.icon_emoji).toMatch(/^:.+:$/);
      expect(a.personaPrompt.length).toBeGreaterThan(0);
    }
  });
});

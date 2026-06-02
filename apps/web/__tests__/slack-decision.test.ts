import { describe, it, expect } from "vitest";
import {
  CEO_DECISION_MARKER,
  classifyDecision,
  isCeoDecisionThread,
  parseInterventionLevel,
  decisionGuidance,
} from "@/lib/slack/decision";

describe("classifyDecision — CEO 판정 분류", () => {
  it("채택/진행 → adopt", () => {
    expect(classifyDecision("이거 채택. 진행해")).toBe("adopt");
    expect(classifyDecision("좋아 가자")).toBe("adopt");
  });
  it("거부/폐기 → reject", () => {
    expect(classifyDecision("거부. 지금은 안 함")).toBe("reject");
    expect(classifyDecision("별로야 폐기해")).toBe("reject");
  });
  it("보류/나중에 → hold (adopt보다 우선)", () => {
    expect(classifyDecision("나중에 하자")).toBe("hold");
    expect(classifyDecision("일단 보류")).toBe("hold");
  });
  it("판정 아님 → none", () => {
    expect(classifyDecision("이게 무슨 뜻이야?")).toBe("none");
  });
});

describe("isCeoDecisionThread — 합의 실패 스레드 감지", () => {
  it("봇 메시지에 마커 있으면 true", () => {
    const history = [
      { text: "안건 발제", bot_id: "B1" },
      { text: `합의 실패. ${CEO_DECISION_MARKER}`, bot_id: "B1" },
    ];
    expect(isCeoDecisionThread(history)).toBe(true);
  });
  it("마커 없으면 false", () => {
    expect(isCeoDecisionThread([{ text: "그냥 잡담", bot_id: "B1" }])).toBe(false);
  });
  it("사용자 메시지에만 마커가 있으면 무시(봇 발화만 신뢰)", () => {
    expect(isCeoDecisionThread([{ text: CEO_DECISION_MARKER }])).toBe(false);
  });
});

describe("parseInterventionLevel — 개입 레벨", () => {
  it("관전/지켜봐 → observe", () => {
    expect(parseInterventionLevel("일단 지켜볼게")).toBe("observe");
  });
  it("기본은 lead (CEO가 결정 주도)", () => {
    expect(parseInterventionLevel("거부")).toBe("lead");
  });
});

describe("decisionGuidance — 판정→규칙화 유도", () => {
  it("reject 는 prohibition add_constraint 를 유도", () => {
    const g = decisionGuidance("reject");
    expect(g).toMatch(/add_constraint/);
    expect(g).toMatch(/prohibition/);
  });
  it("none 은 빈 문자열 (간섭 안 함)", () => {
    expect(decisionGuidance("none")).toBe("");
  });
});

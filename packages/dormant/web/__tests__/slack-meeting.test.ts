import { describe, it, expect } from "vitest";
import {
  classifyTopic,
  selectParticipants,
  isDuplicateAgenda,
  detectConsensus,
  MAX_STATEMENTS_PER_AXIS,
  MAX_REBUTTALS_PER_AXIS,
} from "@/lib/slack/meeting";

describe("classifyTopic", () => {
  it("UI/화면 키워드 → ui", () => {
    expect(classifyTopic("이 화면 레이아웃 컴포넌트 바꾸자")).toBe("ui");
  });
  it("보안/규제 키워드 → security", () => {
    expect(classifyTopic("결제 흐름 취약점 점검")).toBe("security");
  });
  it("규제/금칙어 → compliance", () => {
    expect(classifyTopic("투자 조언 금칙어 약관 검토")).toBe("compliance");
  });
  it("API/성능 → backend", () => {
    expect(classifyTopic("이 API 캐싱으로 성능 개선")).toBe("backend");
  });
  it("사용자 가치/우선순위 → product", () => {
    expect(classifyTopic("이 기능 사용자 리텐션 우선순위")).toBe("product");
  });
  it("분류 불가 → general", () => {
    expect(classifyTopic("음 글쎄")).toBe("general");
  });
});

describe("selectParticipants — 관련 축만 소집 (노이즈 통제)", () => {
  it("UI 안건 → pm + cto (security 제외)", () => {
    const p = selectParticipants("화면 레이아웃 개선");
    expect(p).toContain("pm");
    expect(p).toContain("cto");
    expect(p).not.toContain("security");
  });
  it("보안 안건 → security + cto (pm 제외)", () => {
    const p = selectParticipants("결제 취약점");
    expect(p).toContain("security");
    expect(p).toContain("cto");
    expect(p).not.toContain("pm");
  });
  it("general 안건 → 3축 전부 (폴백)", () => {
    const p = selectParticipants("음 글쎄");
    expect(p.sort()).toEqual(["cto", "pm", "security"]);
  });
  it("default 축은 절대 회의 참가자가 아니다", () => {
    expect(selectParticipants("음 글쎄")).not.toContain("default");
  });
});

describe("isDuplicateAgenda — 중복 차단 (이미 done/killed 재회의 금지)", () => {
  const prior = ["데이터 불일치 배너 추가", "온보딩 튜토리얼 개선"];
  it("유사 안건이면 중복", () => {
    expect(isDuplicateAgenda("데이터 불일치 배너를 추가하자", prior)).toBe(true);
  });
  it("새 안건이면 중복 아님", () => {
    expect(isDuplicateAgenda("위젯 차트 색상 변경", prior)).toBe(false);
  });
  it("prior 비면 항상 중복 아님", () => {
    expect(isDuplicateAgenda("아무거나", [])).toBe(false);
  });
});

describe("detectConsensus — 합의 판정", () => {
  it("반대(반박) 없으면 합의", () => {
    const r = detectConsensus([
      { axis: "pm", oppose: false },
      { axis: "cto", oppose: false },
    ]);
    expect(r.consensus).toBe(true);
    expect(r.needsCEO).toBe(false);
  });
  it("반대 있으면 합의 실패 → CEO 호출 필요", () => {
    const r = detectConsensus([
      { axis: "pm", oppose: false },
      { axis: "security", oppose: true },
    ]);
    expect(r.consensus).toBe(false);
    expect(r.needsCEO).toBe(true);
  });
});

describe("라운드 제한 상수 (무한 수다 금지)", () => {
  it("축당 1발언 + 1반박", () => {
    expect(MAX_STATEMENTS_PER_AXIS).toBe(1);
    expect(MAX_REBUTTALS_PER_AXIS).toBe(1);
  });
});

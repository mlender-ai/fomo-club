import { describe, it, expect } from "vitest";
import {
  checkSafety,
  sanitizeInterpretation,
  REQUIRED_DISCLAIMER,
} from "../safety/forbidden.js";

describe("checkSafety", () => {
  it("CLEAN — 정상 해석 텍스트", () => {
    const result = checkSafety("별 카드는 희망과 회복을 상징합니다. 우주의 기운이 흐릅니다.");
    expect(result.result).toBe("CLEAN");
    expect(result.matchedTerms).toHaveLength(0);
  });

  it("BLOCKED — 매수 단어 포함", () => {
    const result = checkSafety("이 종목은 매수 타이밍입니다.");
    expect(result.result).toBe("BLOCKED");
    expect(result.matchedTerms).toContain("매수");
  });

  it("BLOCKED — 매도 단어 포함", () => {
    const result = checkSafety("지금 바로 매도하는 것이 좋습니다.");
    expect(result.result).toBe("BLOCKED");
    expect(result.matchedTerms).toContain("매도");
  });

  it("BLOCKED — 투자 추천 포함", () => {
    const result = checkSafety("이것은 전문가의 투자 추천입니다.");
    expect(result.result).toBe("BLOCKED");
  });

  it("BLOCKED — 수익 보장 포함", () => {
    const result = checkSafety("수익 보장이 됩니다.");
    expect(result.result).toBe("BLOCKED");
  });

  it("BLOCKED — 대소문자 무관 (영어)", () => {
    const result = checkSafety("You should Buy now!");
    expect(result.result).toBe("BLOCKED");
  });

  it("RISK — 좋은 타이밍 포함", () => {
    const result = checkSafety("지금은 좋은 타이밍일 수 있습니다.");
    expect(result.result).toBe("RISK");
    expect(result.matchedTerms).toContain("좋은 타이밍");
  });

  it("RISK — % 상승 예상 포함", () => {
    const result = checkSafety("10% 상승 예상됩니다.");
    expect(result.result).toBe("RISK");
  });

  it("BLOCKED 우선순위가 RISK보다 높음", () => {
    const result = checkSafety("매수하기 좋은 타이밍입니다.");
    expect(result.result).toBe("BLOCKED");
  });

  it("matchedTerms에 실제 매칭된 단어 포함", () => {
    const result = checkSafety("파세요, 지금 당장 사야합니다.");
    expect(result.result).toBe("BLOCKED");
    expect(result.matchedTerms.length).toBeGreaterThan(0);
  });

  it("빈 문자열은 CLEAN", () => {
    const result = checkSafety("");
    expect(result.result).toBe("CLEAN");
  });
});

describe("sanitizeInterpretation", () => {
  it("금칙어를 *** 로 대체", () => {
    const sanitized = sanitizeInterpretation("이 종목을 매수하세요.");
    expect(sanitized).toContain("***");
    expect(sanitized).not.toContain("매수");
  });

  it("금칙어 없으면 원문 유지", () => {
    const text = "별빛이 당신을 인도합니다.";
    expect(sanitizeInterpretation(text)).toBe(text);
  });
});

describe("REQUIRED_DISCLAIMER", () => {
  it("투자 조언 아님 문구 포함", () => {
    expect(REQUIRED_DISCLAIMER).toContain("투자 조언이 아닙니다");
  });
});

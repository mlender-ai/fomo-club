import { describe, it, expect } from "vitest";
import {
  checkSafety,
  sanitizeInterpretation,
  FORBIDDEN_TERMS_BLOCKED,
  FORBIDDEN_TERMS_RISK,
  REQUIRED_DISCLAIMER,
} from "../src/safety/forbidden";

describe("checkSafety", () => {
  it("CLEAN 텍스트 통과", () => {
    const result = checkSafety("시장의 흐름이 변화하고 있습니다. 관망의 시기입니다.");
    expect(result.result).toBe("CLEAN");
    expect(result.matchedTerms).toHaveLength(0);
  });

  it("BLOCKED: 매수 포함 시 차단", () => {
    const result = checkSafety("지금 매수하면 좋겠습니다");
    expect(result.result).toBe("BLOCKED");
    expect(result.matchedTerms).toContain("매수");
  });

  it("BLOCKED: 매도 포함 시 차단", () => {
    const result = checkSafety("매도 타이밍입니다");
    expect(result.result).toBe("BLOCKED");
    expect(result.matchedTerms.some((t) => t === "매도" || t === "매도 타이밍")).toBe(true);
  });

  it("BLOCKED: 수익 보장 표현", () => {
    const result = checkSafety("이 종목은 수익 보장이 됩니다");
    expect(result.result).toBe("BLOCKED");
    expect(result.matchedTerms).toContain("수익 보장");
  });

  it("BLOCKED: 영어 buy/sell도 차단", () => {
    expect(checkSafety("You should buy this stock").result).toBe("BLOCKED");
    expect(checkSafety("It's time to sell").result).toBe("BLOCKED");
  });

  it("BLOCKED: 대소문자 무시", () => {
    const result = checkSafety("BUY this stock now");
    expect(result.result).toBe("BLOCKED");
  });

  it("RISK: 좋은 타이밍 표현", () => {
    const result = checkSafety("좋은 타이밍이 될 수 있습니다");
    expect(result.result).toBe("RISK");
    expect(result.matchedTerms).toContain("좋은 타이밍");
  });

  it("RISK: 강한 매수세 → BLOCKED (매수 포함)", () => {
    // "강한 매수세"에 "매수"가 포함되어 BLOCKED가 RISK보다 우선
    const result = checkSafety("강한 매수세가 관측됩니다");
    expect(result.result).toBe("BLOCKED");
  });

  it("RISK: 적기입니다 표현", () => {
    const result = checkSafety("지금이 적기입니다");
    expect(result.result).toBe("RISK");
    expect(result.matchedTerms).toContain("적기입니다");
  });

  it("BLOCKED가 RISK보다 우선", () => {
    const result = checkSafety("좋은 타이밍에 매수하세요");
    expect(result.result).toBe("BLOCKED");
  });

  it("모든 BLOCKED 용어가 실제로 감지됨", () => {
    for (const term of FORBIDDEN_TERMS_BLOCKED) {
      const result = checkSafety(`테스트 ${term} 테스트`);
      expect(result.result).toBe("BLOCKED");
      expect(result.matchedTerms).toContain(term);
    }
  });

  it("모든 RISK 용어가 실제로 감지됨", () => {
    for (const term of FORBIDDEN_TERMS_RISK) {
      const result = checkSafety(`테스트 ${term} 테스트`);
      expect(result.result === "RISK" || result.result === "BLOCKED").toBe(true);
    }
  });
});

describe("sanitizeInterpretation", () => {
  it("금칙어를 ***로 치환", () => {
    const text = "지금 매수하면 수익 보장됩니다";
    const sanitized = sanitizeInterpretation(text);
    expect(sanitized).not.toContain("매수");
    expect(sanitized).not.toContain("수익 보장");
    expect(sanitized).toContain("***");
  });

  it("CLEAN 텍스트는 변경 없음", () => {
    const text = "시장의 에너지가 변화하고 있습니다";
    expect(sanitizeInterpretation(text)).toBe(text);
  });

  it("대소문자 무시하며 치환", () => {
    const text = "BUY now and SELL later";
    const sanitized = sanitizeInterpretation(text);
    expect(sanitized).not.toMatch(/buy/i);
    expect(sanitized).not.toMatch(/sell/i);
  });
});

describe("REQUIRED_DISCLAIMER", () => {
  it("면책 문구 존재", () => {
    expect(REQUIRED_DISCLAIMER).toBeTruthy();
    expect(REQUIRED_DISCLAIMER).toContain("투자 조언이 아닙니다");
  });
});

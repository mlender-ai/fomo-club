import { describe, it, expect } from "vitest";
import { marketLine, mineLine } from "../src/mascot-lines";
import { EMOTION_TYPES } from "../src/types";

const STATES = ["무관심", "관망", "관심", "FOMO", "광기"] as const;
// 담담한 솔직함 위반 단어: 가짜긍정/거침/투자조언/단정 (정체성 §2.1, regulation-reviewer)
const FORBIDDEN = /매수|매도|사세요|파세요|반드시|보장|폭락|급등|존버|가즈아|오릅니다|떨어집니다|수익률/;

describe("포모 멘트 — 담담한 솔직함 (lovable + regulation)", () => {
  it("모든 시장 멘트가 존재하고 금칙 표현이 없다", () => {
    for (const s of STATES) {
      const line = marketLine(s);
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(FORBIDDEN);
    }
  });

  it("모든 감정 반응 멘트가 존재하고 금칙 표현이 없다", () => {
    for (const e of EMOTION_TYPES) {
      const line = mineLine(e);
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(FORBIDDEN);
    }
  });

  it("위로의 핵심(혼자 아님/괜찮음/담담함) 톤을 담는다", () => {
    // 가짜 긍정이 아니라 사실 인정 + 위로 — 표본 점검
    expect(mineLine("fear")).toContain("괜찮");
    expect(marketLine("FOMO")).toContain("너만 그런 거 아니야");
  });
});

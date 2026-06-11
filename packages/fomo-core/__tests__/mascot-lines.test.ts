import { describe, it, expect } from "vitest";
import { marketLine, marketSummary, mineLine, restorativeLine, isCalmDay, personalLine } from "../src/mascot-lines";
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

  it("지표 한 줄 요약은 5구간 모두 짧고(직관) 금칙 표현이 없다", () => {
    for (const s of STATES) {
      const summary = marketSummary(s);
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThanOrEqual(16); // 3초 안에 읽히는 길이
      expect(summary).not.toMatch(FORBIDDEN);
    }
  });

  it("위로의 핵심(혼자 아님/괜찮음/담담함) 톤을 담는다", () => {
    // 가짜 긍정이 아니라 사실 인정 + 위로 — 표본 점검
    expect(mineLine("fear")).toContain("괜찮");
    expect(marketLine("FOMO")).toContain("너만 그런 거 아니야");
  });
});

describe("잔잔한 날 = 치유의 날 (M2 회복 콘텐츠)", () => {
  it("무관심/관망만 잔잔한 날로 본다", () => {
    expect(isCalmDay("무관심")).toBe(true);
    expect(isCalmDay("관망")).toBe(true);
    expect(isCalmDay("관심")).toBe(false);
    expect(isCalmDay("FOMO")).toBe(false);
    expect(isCalmDay("광기")).toBe(false);
  });

  it("회복 콘텐츠는 날짜별 결정적(같은 날 동일)이고 금칙 표현이 없다", () => {
    expect(restorativeLine("2026-06-07")).toBe(restorativeLine("2026-06-07"));
    expect(restorativeLine("2026-06-07").length).toBeGreaterThan(0);
    expect(restorativeLine("2026-06-07")).not.toMatch(FORBIDDEN);
  });

  it("여러 날에 걸쳐 한 가지 문구에만 고정되지 않는다(돌아올 이유)", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 14; d++) {
      seen.add(restorativeLine(`2026-06-${String(d).padStart(2, "0")}`));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("personalLine — 포모의 기억 (나를 기억하는 캐릭터)", () => {
  it("연속 기록 마일스톤이 최우선", () => {
    const l = personalLine({ yesterdayEmotion: "fear", todayEmotion: "fomo", streak: 7 });
    expect(l).toBe("오늘로 7일째야. 네가 남긴 색들, 전부 기억하고 있어.");
  });

  it("감정 전환을 기억한다", () => {
    const l = personalLine({ yesterdayEmotion: "fear", todayEmotion: "conviction", streak: 2 });
    expect(l).toBe("어제의 너는 공포, 오늘은 확신. 그 변화, 내가 기억할게.");
  });

  it("같은 감정이 이어져도 기억한다", () => {
    const l = personalLine({ yesterdayEmotion: "fomo", todayEmotion: "fomo", streak: 3 });
    expect(l).toBe("어제도 오늘도 FOMO. 이어지는 마음도 그대로 적어뒀어.");
  });

  it("어제 기록이 없으면 null (폴백 — 거짓 기억 금지)", () => {
    expect(personalLine({ yesterdayEmotion: null, todayEmotion: "fomo", streak: 1 })).toBeNull();
    expect(personalLine({ todayEmotion: "fomo" })).toBeNull();
    expect(personalLine({})).toBeNull();
  });

  it("마일스톤 아닌 streak 는 전환/이어짐 규칙으로", () => {
    const l = personalLine({ yesterdayEmotion: "greed", todayEmotion: "greed", streak: 8 });
    expect(l).toContain("어제도 오늘도");
  });

  it("금칙 표현(조언·단정·죄책감) 없음", () => {
    const lines = [
      personalLine({ yesterdayEmotion: "fear", todayEmotion: "fomo", streak: 7 }),
      personalLine({ yesterdayEmotion: "fear", todayEmotion: "fomo", streak: 2 }),
      personalLine({ yesterdayEmotion: "fomo", todayEmotion: "fomo", streak: 2 }),
    ];
    for (const l of lines) {
      expect(l).toBeTruthy();
      expect(l!).not.toMatch(FORBIDDEN);
      expect(l!).not.toMatch(/하세요|해야|안 오면|죽어|미안하지/); // 조언·죄책감 어휘
    }
  });
});

import { describe, it, expect } from "vitest";
import { scoreToState, scoreToFace, scoreToEmoji, clampScore } from "../src/state";
import { EMOTION_TYPES, EMOTION_COLORS, EMOTION_LABELS } from "../src/types";

describe("scoreToState — 5구간 경계값 (docs/FOMO_INDEX.md)", () => {
  it("구간 하한 경계값이 올바른 상태로 매핑된다", () => {
    expect(scoreToState(0)).toBe("무관심");
    expect(scoreToState(20)).toBe("무관심");
    expect(scoreToState(21)).toBe("관망");
    expect(scoreToState(40)).toBe("관망");
    expect(scoreToState(41)).toBe("관심");
    expect(scoreToState(60)).toBe("관심");
    expect(scoreToState(61)).toBe("FOMO");
    expect(scoreToState(80)).toBe("FOMO");
    expect(scoreToState(81)).toBe("광기");
    expect(scoreToState(100)).toBe("광기");
  });

  it("표정(face)이 상태와 1:1 직결된다 (docs/MASCOT.md §5)", () => {
    expect(scoreToFace(10)).toBe("sleepy");
    expect(scoreToFace(30)).toBe("calm");
    expect(scoreToFace(50)).toBe("curious");
    expect(scoreToFace(74)).toBe("excited");
    expect(scoreToFace(95)).toBe("manic");
  });

  it("이모지가 구간과 일치한다", () => {
    expect(scoreToEmoji(10)).toBe("😴");
    expect(scoreToEmoji(74)).toBe("🔥");
    expect(scoreToEmoji(90)).toBe("🚀");
  });
});

describe("clampScore", () => {
  it("0~100 범위로 보정하고 반올림한다", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(73.6)).toBe(74);
    expect(clampScore(NaN)).toBe(0);
  });
});

describe("감정 상수 — 5종 일관성 (docs/MASCOT.md §4)", () => {
  it("모든 EmotionType에 색/라벨이 정의돼 있다", () => {
    expect(EMOTION_TYPES).toHaveLength(5);
    for (const e of EMOTION_TYPES) {
      expect(EMOTION_COLORS[e]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(EMOTION_LABELS[e].length).toBeGreaterThan(0);
    }
  });
});

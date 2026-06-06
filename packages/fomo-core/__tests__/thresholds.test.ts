import { describe, it, expect } from "vitest";
import { INDEX_THRESHOLDS, INDEX_HINT_TEXT } from "../src/constants/indexThresholds";
import { scoreToFace, scoreToState } from "../src/index";

/**
 * FOMO Index 5구간 ↔ 마스코트 표정 매핑 검증.
 * indexThresholds.ts의 경계값이 state.ts 매핑과 항상 일치함을 보장한다.
 * 경계값이 바뀌면 이 테스트가 먼저 실패 → 의도치 않은 변경 방지.
 */
describe("INDEX_THRESHOLDS ↔ scoreToFace 매핑 일관성", () => {
  it("manic 구간 하한에서 face=manic", () => {
    expect(scoreToFace(INDEX_THRESHOLDS.manic)).toBe("manic");
    expect(scoreToFace(100)).toBe("manic");
  });

  it("fomo 구간 하한에서 face=excited", () => {
    expect(scoreToFace(INDEX_THRESHOLDS.fomo)).toBe("excited");
    expect(scoreToFace(80)).toBe("excited");
  });

  it("curious 구간 하한에서 face=curious", () => {
    expect(scoreToFace(INDEX_THRESHOLDS.curious)).toBe("curious");
    expect(scoreToFace(60)).toBe("curious");
  });

  it("calm 구간 하한에서 face=calm", () => {
    expect(scoreToFace(INDEX_THRESHOLDS.calm)).toBe("calm");
    expect(scoreToFace(40)).toBe("calm");
  });

  it("sleepy 구간(0~20)에서 face=sleepy", () => {
    expect(scoreToFace(INDEX_THRESHOLDS.sleepy)).toBe("sleepy");
    expect(scoreToFace(20)).toBe("sleepy");
  });

  it("각 구간 경계 바로 아래는 다른 face", () => {
    expect(scoreToFace(INDEX_THRESHOLDS.manic - 1)).toBe("excited");
    expect(scoreToFace(INDEX_THRESHOLDS.fomo - 1)).toBe("curious");
    expect(scoreToFace(INDEX_THRESHOLDS.curious - 1)).toBe("calm");
    expect(scoreToFace(INDEX_THRESHOLDS.calm - 1)).toBe("sleepy");
  });
});

describe("INDEX_THRESHOLDS ↔ scoreToState 매핑 일관성", () => {
  const cases: Array<[number, string]> = [
    [INDEX_THRESHOLDS.manic, "광기"],
    [INDEX_THRESHOLDS.fomo, "FOMO"],
    [INDEX_THRESHOLDS.curious, "관심"],
    [INDEX_THRESHOLDS.calm, "관망"],
    [INDEX_THRESHOLDS.sleepy, "무관심"],
  ];

  it.each(cases)("점수 %i → 상태 %s", (score, state) => {
    expect(scoreToState(score)).toBe(state);
  });
});

describe("INDEX_HINT_TEXT — 5구간 모두 커버", () => {
  const states = ["무관심", "관망", "관심", "FOMO", "광기"];

  it.each(states)("구간 '%s' 도움말 텍스트가 존재함", (state) => {
    expect(INDEX_HINT_TEXT[state]).toBeTruthy();
    expect(INDEX_HINT_TEXT[state]!.length).toBeGreaterThan(10);
  });
});

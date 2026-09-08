import { describe, it, expect } from "vitest";
import { groundedInSource, hasLatinUnitWord } from "../../lib/us-company-about";

/**
 * LAUNCH-P2 §C-3 — **근거 검증 패스.** 요약이 원문에 없는 숫자·고유명사를 넣으면 버린다.
 *
 * 이 경로의 유일한 큰 위험이 그것이다: 회사 소개는 그럴듯하게 지어내기 쉽고(설립연도·매출·
 * 직원 수), 지어낸 숫자는 「사실 정확성」의 정중앙을 어긴다. 표현 제약과 달리 이 규칙은
 * 개발 편의로 풀 수 있는 것이 아니다.
 */
const SOURCE =
  "On was born in the Swiss Alps in 2010 with the mission to ignite the human spirit through movement. " +
  "On develops premium running shoes and apparel sold in over 60 countries.";

describe("근거 검증 — 원문에 없는 것은 못 나온다", () => {
  it("원문에 있는 숫자·이름만 쓴 요약은 통과한다", () => {
    expect(groundedInSource("스위스에서 시작한 러닝화·의류 브랜드예요. 60개국 넘는 곳에서 팔아요.", SOURCE)).toBe(true);
  });

  it("원문에 없는 숫자는 막는다 — 매출·직원 수를 지어내는 경로다", () => {
    expect(groundedInSource("2010년에 시작해 직원 3,200명을 두고 있어요.", SOURCE)).toBe(false);
  });

  it("원문에 없는 라틴 고유명사는 막는다", () => {
    expect(groundedInSource("Nike와 경쟁하는 러닝화 회사예요.", SOURCE)).toBe(false);
  });

  it("원문에 있는 라틴 이름은 통과한다", () => {
    expect(groundedInSource("On은 러닝화를 만들어요.", SOURCE)).toBe(true);
  });

  it("숫자·라틴이 없는 순한글 요약은 통과한다", () => {
    expect(groundedInSource("러닝화와 운동 의류를 만들어 파는 회사예요.", SOURCE)).toBe(true);
  });
});

/**
 * LAUNCH-P2 §C 실측 — 「숫자는 원문 형태 그대로」라고 지시하니 LLM 이
 * `15.8 million 명의 회원` 을 냈다. 근거 검증은 통과한다(원문에 그 숫자가 있다) —
 * **한영혼용은 다른 규칙이 막아야 한다.**
 */
describe("영문 단위어를 한국어 문장에 남기지 않는다", () => {
  it("million·billion 이 남아 있으면 버린다(숫자 없이 다시 쓴다)", () => {
    expect(hasLatinUnitWord("15.8 million 명의 회원이 이용해요.")).toBe(true);
    expect(hasLatinUnitWord("전 세계 134 million 개 계정을 지원해요.")).toBe(true);
    expect(hasLatinUnitWord("1.2 bn 규모예요.")).toBe(true);
  });

  it("영문 고유명사는 막지 않는다 — 회사·제품 이름은 원문에 있다", () => {
    expect(hasLatinUnitWord("On은 CloudTec® 기술로 러닝화를 만들어요.")).toBe(false);
    expect(hasLatinUnitWord("Rocket Lab은 Electron 발사체를 만들어요.")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { groundedInSource } from "../../lib/us-company-about";

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

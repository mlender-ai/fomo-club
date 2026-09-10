import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { detectableMde, dilutionFactor, perArm } from "../../../../scripts/ab-power";

/**
 * WO-SUB-04 검정력 산출 — 계산과 문서가 어긋나지 않게 고정한다.
 *
 * 문서(`POWER_wo_sub_04_ab.md`)가 이 스크립트 출력을 인용한다. 손계산으로 문서를 쓰면 입력이
 * 바뀌었을 때 어긋나고 그 어긋남은 어떤 게이트에도 안 걸린다.
 */

const Z80 = 0.8416212336;
const BASE = 1 / 23;

describe("2비율 검정 표본 산출", () => {
  it("문서에 인용한 수치와 일치한다 (상대 +30%, 검정력 80%)", () => {
    expect(Math.round(perArm(BASE, 0.3, Z80))).toBe(4382);
  });

  it("효과가 클수록 표본이 줄어든다", () => {
    expect(perArm(BASE, 1.0, Z80)).toBeLessThan(perArm(BASE, 0.3, Z80));
  });

  /** `p2 > 1` 은 정의역 밖이다 — 계산하면 sqrt(음수)가 되어 NaN 이 조용히 퍼진다. */
  it("도달 불가능한 효과는 Infinity 로 막는다", () => {
    expect(perArm(0.5, 2.0, Z80)).toBe(Number.POSITIVE_INFINITY);
    expect(perArm(BASE, 0, Z80)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("ITT 희석 보정", () => {
  it("처치 비율 70% 면 필요 표본이 약 2.04배", () => {
    expect(dilutionFactor(0.7)).toBeCloseTo(2.04, 2);
  });

  it("전원 처치면 보정이 없다", () => {
    expect(dilutionFactor(1)).toBe(1);
  });

  /** 이 보정을 빼면 필요 기간을 과소평가한다 — 실험을 돌릴 수 있다고 오판한다. */
  it("처치 비율이 낮을수록 급격히 커진다", () => {
    expect(dilutionFactor(0.3)).toBeGreaterThan(dilutionFactor(0.7) * 4);
  });
});

describe("기간별 탐지 가능 효과", () => {
  it("문서에 인용한 14일 수치와 일치한다", () => {
    const perArmSamples = ((23 * 14) / dilutionFactor(0.7)) / 2;
    const mde = detectableMde(BASE, perArmSamples, Z80);
    expect(mde).not.toBeNull();
    expect(Math.round(mde! * 100)).toBe(323);
  });

  it("표본이 아주 작으면 null — 억지 숫자를 만들지 않는다", () => {
    expect(detectableMde(BASE, 1, Z80)).toBeNull();
  });
});

describe("문서와 판정이 일치한다", () => {
  const DOC = readFileSync(new URL("../../../../docs/audit/POWER_wo_sub_04_ab.md", import.meta.url), "utf8");

  it("판정이 'A/B 미룸' 이다", () => {
    expect(DOC).toContain("A/B 미룸");
  });

  it("처치 비율 실측(70%)이 지시서 가정(30%)과 다르다는 사실을 남긴다", () => {
    expect(DOC).toContain("실측은 70%");
  });

  it("기저 전환율이 성공 1건 기반이라는 한계를 밝힌다", () => {
    expect(DOC).toContain("성공 1건");
  });

  it("사후 비교가 인과가 아니라는 경고를 담는다", () => {
    expect(DOC).toContain("무작위 배정이 아니다");
    expect(DOC).toContain("선택 편향");
  });
});

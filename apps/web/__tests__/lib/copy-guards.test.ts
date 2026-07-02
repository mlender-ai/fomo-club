import { describe, expect, it } from "vitest";

import { DEV_CONSTRAINTS_LIFTED, hasForbiddenCopy, hasEnglishFragmentHeadline } from "../../lib/copy-guards";

describe("headline latin fragment guard", () => {
  it("blocks English fragments mixed into Korean card headlines", () => {
    expect(hasEnglishFragmentHeadline("its NVIDIA와 제품 협력")).toBe(true);
    expect(hasEnglishFragmentHeadline("Can와 파트너십 체결")).toBe(true);
    expect(hasEnglishFragmentHeadline("SHPH, ILLR, IVF: Why These Stocks Posted Double-Digit Gains")).toBe(true);
  });

  it("allows Koreanized company names and known technical acronyms", () => {
    expect(hasEnglishFragmentHeadline("엔비디아와 제품 협력에 +34%")).toBe(false);
    expect(hasEnglishFragmentHeadline("AI 모델 출시")).toBe(false);
    expect(hasEnglishFragmentHeadline("SEC 8-K 주요 공시 제출")).toBe(false);
  });
});

describe("개발 단계 제약 해제 토글 (DEV_CONSTRAINTS_LIFTED)", () => {
  const advice = "엔비디아 지금 매수 추천, 추가 상승 기대";
  const decision = "와이코프 스프링 확인, 지지선 위 매수 시점으로 보이고 목표가 12만원·손절선 10만원";

  it("해제(lifted) 상태에서는 투자조언·예측 표현을 통과시킨다", () => {
    expect(hasForbiddenCopy(advice, { liftDevConstraints: true })).toBe(false);
  });

  it("해제(lifted) 상태에서는 매수/매도 판단·목표가·TA 표현도 통과시킨다", () => {
    expect(hasForbiddenCopy(decision, { liftDevConstraints: true })).toBe(false);
  });

  it("복원(false) 상태에서는 투자조언·예측 표현을 다시 막는다 — 단일 토글로 복원", () => {
    expect(hasForbiddenCopy(advice, { liftDevConstraints: false })).toBe(true);
    expect(hasForbiddenCopy(decision, { liftDevConstraints: false })).toBe(true);
  });

  it("현재 기본 플래그가 해제 상태이므로 옵션 없이도 통과한다", () => {
    expect(DEV_CONSTRAINTS_LIFTED).toBe(true);
    expect(hasForbiddenCopy(advice)).toBe(false);
  });

  it("사실 정확성·품질 가드는 플래그와 무관하게 항상 막는다", () => {
    // 한영혼용(가독성/사실) — 해제 상태에서도 reject
    expect(hasForbiddenCopy("its NVIDIA와 제품 협력", { liftDevConstraints: true })).toBe(true);
    // 매체명 노출(품질) — 해제 상태에서도 reject
    expect(hasForbiddenCopy("한국경제 보도에 따르면 호남 투자", { liftDevConstraints: true })).toBe(true);
  });
});

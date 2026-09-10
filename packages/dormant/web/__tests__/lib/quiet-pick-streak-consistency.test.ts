import { describe, expect, it } from "vitest";
import { reconcileStreakClaim } from "../../lib/quiet-pick";

/**
 * WO-SYNC F-1 회귀 고정 — 훅과 디테일이 같은 사실에 다른 숫자를 달면 안 된다.
 * 실제 2026-08-15 발행분에서 나온 문장을 그대로 쓴다.
 */
describe("reconcileStreakClaim", () => {
  it("같은 주체의 연속일수가 어긋나면 signal.days 로 맞춘다 (빅텍 26 vs 20)", () => {
    const summary = "기관 20일 연속 순매수 가세 — 가격 구간과 수급 방향을 함께 확인 중. 관점 경계 2,500원.";
    expect(reconcileStreakClaim(summary, "기관", 26)).toBe(
      "기관 26일 연속 순매수 가세 — 가격 구간과 수급 방향을 함께 확인 중. 관점 경계 2,500원."
    );
  });

  it("DB하이텍 6 vs 4 도 같은 규칙으로 맞는다", () => {
    expect(reconcileStreakClaim("기관 4일 연속 순매수", "기관", 6)).toBe("기관 6일 연속 순매수");
  });

  it("이미 일치하면 문장을 건드리지 않는다", () => {
    const summary = "기관 26일 연속 순매수 가세 — 관점 경계 2,500원.";
    expect(reconcileStreakClaim(summary, "기관", 26)).toBe(summary);
  });

  it("다른 주체의 주장은 서로 다른 사실이므로 건드리지 않는다", () => {
    // 훅은 임원(내부자) 카드인데 디테일이 기관 수급을 말하는 경우.
    const summary = "기관 4일 연속 순매수 가세";
    expect(reconcileStreakClaim(summary, "임원 3명", 12)).toBe(summary);
  });

  it("복합 주체는 해당 주체만 맞춘다", () => {
    const summary = "외국인 3일 연속 순매수, 기관 5일 연속 순매수";
    expect(reconcileStreakClaim(summary, "외국인·기관", 7)).toBe(
      "외국인 7일 연속 순매수, 기관 7일 연속 순매수"
    );
  });

  it("days 가 없거나 비정상이면 원문을 보존한다", () => {
    const summary = "기관 4일 연속 순매수";
    expect(reconcileStreakClaim(summary, "기관", 0)).toBe(summary);
    expect(reconcileStreakClaim(summary, "기관", Number.NaN)).toBe(summary);
  });
});

import { describe, it, expect } from "vitest";
import { pickComparisonSnapshot, ARK_COMPARE_DAYS } from "../../lib/investor-collect";

/**
 * ARK 는 **하루 전과 비교하면 안 된다** (2026-08-29 실측).
 *
 * 조건 없이 잰 일별 변화율 분포(보유 90종목): `≥2% 2 · ≥5% 0 · ≥20% 0 · 최대 4.1%`,
 * 신규 편입 0 · 전량 매도 0. **하루 사이의 움직임은 매매가 아니라 자금 유출입이다** —
 * ARKK 순자산이 바뀌면 전 종목 주식 수가 비례해 함께 움직인다.
 *
 * 임계(20%)는 틀리지 않았다. 그 노이즈를 정확히 걸러낸다. 틀린 건 **창**이었다.
 */
const snap = (asOf: string) => ({ asOf, holdings: [] });

describe("ARK 비교 시점 고르기", () => {
  it("5일 이상 지난 것 중 **가장 최근**을 고른다", () => {
    const history = ["2026-08-29", "2026-08-28", "2026-08-24", "2026-08-20"].map(snap);
    expect(pickComparisonSnapshot(history, "2026-08-29", ARK_COMPARE_DAYS)?.asOf).toBe("2026-08-24");
  });

  it("창을 아직 못 채웠으면 **비교하지 않는다** — 하루 차이로 「더 샀어요」를 말하지 않는다", () => {
    const history = ["2026-08-29", "2026-08-28"].map(snap);
    expect(pickComparisonSnapshot(history, "2026-08-29", ARK_COMPARE_DAYS)).toBeNull();
  });

  it("정확히 경계일이면 비교 대상이다", () => {
    const history = ["2026-08-29", "2026-08-24"].map(snap);
    expect(pickComparisonSnapshot(history, "2026-08-29", 5)?.asOf).toBe("2026-08-24");
  });

  it("날짜 형식이 아니면 고르지 않는다", () => {
    expect(pickComparisonSnapshot([snap("언제")], "2026-08-29", 5)).toBeNull();
    expect(pickComparisonSnapshot([snap("2026-08-20")], "오늘", 5)).toBeNull();
  });

  it("창은 5일이다 — 더 길면 「최근」이 아니고 짧으면 자금 유출입에 묻힌다", () => {
    expect(ARK_COMPARE_DAYS).toBe(5);
  });
});

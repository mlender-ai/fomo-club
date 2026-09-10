import { describe, expect, it } from "vitest";
import { DOCTRINE } from "../src/archetype/classify";
import { bannedWordHits } from "../src/invariants/banned-words";
import {
  NO_BUSINESS_INVALIDATION,
  businessInvalidationCatalog,
  businessInvalidationFor,
  judgeBusinessInvalidation,
  judgeability,
} from "../src/risk/business-invalidation";

/**
 * WO-SUB-06 §5-3 · 완료 조건 5 — "사업 무효 조건이 다음 실적 발표 데이터로 자동 판정 가능한
 * 형태다(WO-SUB-07 이 소비 가능)."
 *
 * 채점 못 하는 조건은 표시만 되고 검증되지 않는다 = 무효 조건이 아니라 장식이다.
 * 그래서 정의 시점에 판정 가능성을 검사한다.
 */

const NO_CHECKPOINT = { date: null, status: "unknown" as const };

describe("카탈로그 — 전 유형이 조건 또는 사유를 갖는다", () => {
  it("독트린의 모든 아키타입이 조건이나 부재 사유 중 하나를 갖는다 (누락 금지)", () => {
    const missing = DOCTRINE.archetypes
      .map((frame) => frame.code)
      .filter((code) => !businessInvalidationFor(code, NO_CHECKPOINT) && !NO_BUSINESS_INVALIDATION[code]);
    expect(missing).toEqual([]);
  });

  it("조건이 있으면 부재 사유가 없고, 없으면 사유가 있다 — 둘 다이거나 둘 다 아닌 상태 금지", () => {
    for (const row of businessInvalidationCatalog()) {
      const hasCondition = row.invalidation !== null;
      const hasReason = row.absentReason !== null;
      expect(hasCondition !== hasReason, `${row.code}: 조건=${hasCondition} 사유=${hasReason}`).toBe(true);
    }
  });

  it("모든 조건이 자동 판정 가능하다 (완료 조건 5)", () => {
    const failures = businessInvalidationCatalog()
      .filter((row) => row.invalidation)
      .map((row) => ({ code: row.code, check: judgeability(row.invalidation!) }))
      .filter((entry) => !entry.check.judgeable)
      .map((entry) => `${entry.code}: ${entry.check.reason}`);
    expect(failures).toEqual([]);
  });

  it("문안이 해요체이고 금지어 사전을 통과한다", () => {
    for (const row of businessInvalidationCatalog()) {
      if (!row.invalidation) continue;
      const text = row.invalidation.condition_text;
      expect(text, row.code).not.toMatch(/(습니다|합니다|입니다|됩니다)/);
      expect(bannedWordHits(text).map((hit) => hit.rule), row.code).toEqual([]);
    }
  });

  it("check_at 이 null 이면 상태가 짝으로 붙는다 (#1040 규약)", () => {
    const row = businessInvalidationFor("CYCLICAL_COMMODITY", NO_CHECKPOINT)!;
    expect(row.check_at).toBeNull();
    expect(row.check_at_status).toBe("unknown");
  });
});

describe("judgeability — 형태 검사", () => {
  const base = businessInvalidationFor("CYCLICAL_COMMODITY", NO_CHECKPOINT)!;

  it("추세 조건은 연속 N회에 값 N+1 개를 요구한다", () => {
    expect(judgeability(base)).toEqual({ judgeable: true, reason: null, requiredObservations: 3 });
  });

  it("추세 조건에 임계값이 붙으면 판정 규칙이 둘이 되므로 거부한다", () => {
    expect(judgeability({ ...base, threshold: 5 }).judgeable).toBe(false);
  });

  it("임계값 조건에 threshold 가 없으면 거부한다", () => {
    const runway = businessInvalidationFor("BIOTECH_PIPELINE", NO_CHECKPOINT)!;
    expect(judgeability(runway).judgeable).toBe(true);
    expect(judgeability({ ...runway, threshold: null }).judgeable).toBe(false);
  });
});

describe("judgeBusinessInvalidation — 자동 판정", () => {
  const decline = businessInvalidationFor("CYCLICAL_COMMODITY", NO_CHECKPOINT)!;
  const rise = businessInvalidationFor("BANK_FINANCIAL", NO_CHECKPOINT)!;
  const runway = businessInvalidationFor("BIOTECH_PIPELINE", NO_CHECKPOINT)!;
  const payout = businessInvalidationFor("MATURE_INCOME", NO_CHECKPOINT)!;
  const signChange = businessInvalidationFor("TURNAROUND_LOSS", NO_CHECKPOINT)!;

  it("2분기 연속 하락이면 무효", () => {
    expect(judgeBusinessInvalidation(decline, { series: [12, 10, 8] })).toBe("invalidated");
  });

  it("한 분기만 하락했으면 유효 유지", () => {
    expect(judgeBusinessInvalidation(decline, { series: [12, 8, 9] })).toBe("holding");
  });

  it("관측이 부족하면 holding 이 아니라 insufficient_data — '유효함'과 '판정 못 함'은 다른 말이다", () => {
    expect(judgeBusinessInvalidation(decline, { series: [12, 10] })).toBe("insufficient_data");
  });

  it("결측(NaN)은 0 으로 대체하지 않고 표본에서 빠진다", () => {
    expect(judgeBusinessInvalidation(decline, { series: [12, Number.NaN, 10] })).toBe("insufficient_data");
  });

  it("2분기 연속 증가(대손)이면 무효", () => {
    expect(judgeBusinessInvalidation(rise, { series: [100, 140, 190] })).toBe("invalidated");
    expect(judgeBusinessInvalidation(rise, { series: [100, 190, 140] })).toBe("holding");
  });

  it("런웨이가 임계값 아래면 무효", () => {
    expect(judgeBusinessInvalidation(runway, { series: [3.2] })).toBe("invalidated");
    expect(judgeBusinessInvalidation(runway, { series: [6.1] })).toBe("holding");
  });

  it("배당이 잉여현금을 넘어서면 무효 (비율 > 1)", () => {
    expect(judgeBusinessInvalidation(payout, { series: [1.3] })).toBe("invalidated");
    expect(judgeBusinessInvalidation(payout, { series: [0.7] })).toBe("holding");
  });

  it("부호 전환 — TURNAROUND 는 흑자 전환을 기다리므로 positive 방향", () => {
    expect(judgeBusinessInvalidation(signChange, { series: [-50, 20], signChangeTo: "positive" })).toBe("invalidated");
    expect(judgeBusinessInvalidation(signChange, { series: [-50, -20], signChangeTo: "positive" })).toBe("holding");
  });

  it("같은 입력이면 항상 같은 결론 (결정론)", () => {
    const input = { series: [12, 10, 8] };
    expect(judgeBusinessInvalidation(decline, input)).toBe(judgeBusinessInvalidation(decline, input));
  });
});

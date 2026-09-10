import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WO-SUB-CLOSE PART C-2 — **가격 무효선이 실제로 무언가를 재는지** 행동으로 검사한다.
 *
 * ## 못 박는 버그 클래스
 *
 * 처음 구현은 발행 시점 값끼리 비교했다(`reference_price` 와 `invalidation_price`). 그 두 값은
 * 발행 순간에 이미 확정돼 있어서 **시간이 지나도 변하지 않는다** — 즉 도달 여부를 재는 것이
 * 아니라 무효선이 발행가 위냐 아래냐를 다시 말한 것이었다. 모든 발행이 결정적으로
 * `도달` 또는 `미도달` 로 분류되고, 비율은 그럴듯한 숫자로 화면에 떴다.
 *
 * **타입 검사도 통과하고 테스트도 통과했다.** 기존 테스트가 전부 소스 문자열 스캔이었기
 * 때문이다 — 필요한 식별자가 파일에 있으면 초록색이었다. 계산이 무엇을 재는지는 아무도 묻지 않았다.
 *
 * 그래서 이 파일은 소스를 읽지 않는다. 원장 행을 먹여 **집계 결과**를 본다.
 * 발행 이후 관측 없이 `도달` 이 생기면 실패한다.
 */

const selections: Array<{ id: string; payload: Record<string, unknown> }> = [];
const outcomeRows: Array<{ payload: Record<string, unknown> }> = [];

vi.mock("../../lib/prisma", () => ({
  prisma: {
    judgmentLedger: {
      findMany: vi.fn(async () => outcomeRows),
    },
  },
}));

vi.mock("../../lib/judgment-ledger", () => ({
  readLedgerSelections: vi.fn(async () => selections),
}));

const { readInvalidationSummary } = await import("../../lib/ledger/invalidation-summary");

/** 발행 스탬프 1건 — 무효선과 발행가만 관여한다. */
function publish(id: string, referencePrice: number, invalidationPrice: number | null): void {
  selections.push({
    id,
    payload: {
      publication: {
        ruleset_version: "archetype-v1.2.0",
        reference_price: referencePrice,
        invalidation_price: invalidationPrice,
      },
    },
  });
}

/** 발행 이후 관측 1건 — 평가가는 `발행가 × (1 + 수익률)` 로 복원된다. */
function observe(selectionId: string, selectedPrice: number, returnPct: number): void {
  outcomeRows.push({
    payload: {
      selectionId,
      selectionDate: "2026-07-01",
      windowDays: 30,
      evaluationDate: "2026-07-31",
      selectedPrice,
      returnPct,
      asset: "stock",
      signalTypes: [],
    },
  });
}

beforeEach(() => {
  selections.length = 0;
  outcomeRows.length = 0;
});

describe("관측이 없으면 아무것도 재지 않는다", () => {
  it("발행 이후 관측이 0건이면 판정 불가다 — 도달도 미도달도 아니다", async () => {
    // 버그 버전은 여기서 `reference(100) > level(80)` 을 보고 결정적으로 분류했다.
    publish("s1", 100, 80);
    const summary = await readInvalidationSummary();
    expect(summary.price.undetermined).toBe(1);
    expect(summary.price.reached).toBe(0);
    expect(summary.price.notReached).toBe(0);
  });

  it("판정 불가도 분모에 남는다 (§6-5 생존 편향)", async () => {
    publish("s1", 100, 80);
    const summary = await readInvalidationSummary();
    expect(summary.price.n).toBe(1);
  });

  it("무효선이 박히지 않은 발행은 분모에 들어가지 않는다", async () => {
    publish("s1", 100, null);
    const summary = await readInvalidationSummary();
    expect(summary.price.n).toBe(0);
    expect(summary.price.rate).toBeNull();
  });
});

describe("하방 무효선 — 발행가 아래", () => {
  it("이후 가격이 무효선을 깨면 도달", async () => {
    publish("s1", 100, 80);
    observe("s1", 100, -25); // 평가가 75 ≤ 80
    const summary = await readInvalidationSummary();
    expect(summary.price.reached).toBe(1);
    expect(summary.price.notReached).toBe(0);
  });

  it("이후 가격이 무효선 위에 머물면 미도달", async () => {
    publish("s1", 100, 80);
    observe("s1", 100, -10); // 평가가 90 > 80
    const summary = await readInvalidationSummary();
    expect(summary.price.reached).toBe(0);
    expect(summary.price.notReached).toBe(1);
  });

  it("관측이 여러 건이면 한 번이라도 깨면 도달이다 — 마지막 값만 보지 않는다", async () => {
    publish("s1", 100, 80);
    observe("s1", 100, -25); // 30일: 75 → 깼다
    observe("s1", 100, 5); // 90일: 105 → 회복
    const summary = await readInvalidationSummary();
    expect(summary.price.reached).toBe(1);
  });
});

describe("상방 무효선 — 발행가 위", () => {
  it("방향은 무효선의 위치가 정한다 — 위로 이탈해야 도달", async () => {
    publish("s1", 100, 130);
    observe("s1", 100, 40); // 평가가 140 ≥ 130
    const summary = await readInvalidationSummary();
    expect(summary.price.reached).toBe(1);
  });

  it("상방 무효선인데 가격이 내려가면 도달이 아니다", async () => {
    // 하방 논리를 상방에 그대로 쓰면 여기서 도달로 잡힌다(부호 실수의 표준 형태).
    publish("s1", 100, 130);
    observe("s1", 100, -40); // 평가가 60
    const summary = await readInvalidationSummary();
    expect(summary.price.reached).toBe(0);
    expect(summary.price.notReached).toBe(1);
  });
});

describe("집계가 발행마다 독립이다", () => {
  it("한 발행의 관측이 다른 발행의 판정에 쓰이지 않는다", async () => {
    publish("s1", 100, 80);
    publish("s2", 100, 80);
    observe("s1", 100, -25); // s1 만 깼다
    const summary = await readInvalidationSummary();
    expect(summary.price.reached).toBe(1);
    expect(summary.price.undetermined).toBe(1);
    expect(summary.price.n).toBe(2);
  });

  it("비율은 분모가 0 이면 null 이다 — 0% 로 쓰지 않는다", async () => {
    const summary = await readInvalidationSummary();
    expect(summary.price.rate).toBeNull();
  });

  it("도달률은 판정 불가를 포함한 분모로 계산된다", async () => {
    publish("s1", 100, 80);
    publish("s2", 100, 80);
    observe("s1", 100, -25);
    const summary = await readInvalidationSummary();
    // 1/2 = 50%. 판정 불가를 빼고 1/1 = 100% 로 계산하면 성적이 조용히 좋아진다.
    expect(summary.price.rate).toBe(50);
  });
});

describe("발행가가 없으면 판정하지 않는다", () => {
  it("발행가가 0 이하면 분모에 들어가지 않는다 — 비율의 기준이 없다", async () => {
    publish("s1", 0, 80);
    observe("s1", 100, -50);
    const summary = await readInvalidationSummary();
    expect(summary.price.n).toBe(0);
  });
});

/**
 * 판정 불가 **사유 분류**가 화면에서 진실을 말하는지 (WO-SUB-CLOSE PART A 후속).
 *
 * 이 분포는 "다음에 무엇을 해야 하나" 를 정하는 데 쓰인다. 이미 배선한 것이 `미배선` 으로
 * 묶이면 같은 일을 다시 하게 된다 — 실제로 대손 수집을 붙인 직후 그 일이 일어났다.
 * 사유에 `수집` 이라는 낱말이 있다는 이유로 `지표 수집 미배선` 에 묶였다.
 */
describe("판정 불가 사유가 오라벨되지 않는다", () => {
  function judged(selectionId: string, verdict: string, reason: string | null): void {
    outcomeRows.push({ payload: { outcomeKind: "business_invalidation", selectionId, verdict, reason } });
  }

  function publishWithRule(id: string): void {
    selections.push({
      id,
      payload: {
        publication: {
          ruleset_version: "archetype-v1.2.0",
          reference_price: 100,
          invalidation_price: null,
          invalidation_business_rule: { metric: "fiscal.quarters[].credit_loss_provision", direction: "consecutive_rise" },
        },
      },
    });
  }

  it("관측 0건은 '관측 부족' 이다 — 사유에 '수집 실패' 가 들어 있어도 미배선이 아니다", async () => {
    publishWithRule("s1");
    judged("s1", "insufficient_data", "대손충당금 전입액 관측 0건(비은행이거나 SEC 수집 실패)");
    const summary = await readInvalidationSummary();
    expect(summary.businessUndeterminedReasons).toEqual({ "관측 부족": 1 });
  });

  it("진짜 미배선만 '지표 수집 미배선' 이다", async () => {
    publishWithRule("s1");
    judged("s1", "insufficient_data", "추세 전환은 직전 발행 시점 값이 필요(스냅샷 비교 미배선)");
    const summary = await readInvalidationSummary();
    // 스냅샷 사유는 스냅샷 버킷이 먼저 잡는다 — '미배선' 이라는 낱말이 있어도 원인이 다르다.
    expect(summary.businessUndeterminedReasons).toEqual({ "직전 스냅샷 필요": 1 });
  });

  it("연속 분기 부족도 관측 문제로 묶인다", async () => {
    publishWithRule("s1");
    judged("s1", "insufficient_data", "대손 연속 분기 부족(관측 6건, 인접 분기 구간 최장 1개)");
    const summary = await readInvalidationSummary();
    expect(summary.businessUndeterminedReasons).toEqual({ "관측 부족": 1 });
  });

  it("판정된 건은 사유 분포에 들어가지 않는다", async () => {
    publishWithRule("s1");
    judged("s1", "invalidated", null);
    const summary = await readInvalidationSummary();
    expect(summary.business.reached).toBe(1);
    expect(summary.businessUndeterminedReasons).toEqual({});
  });
});

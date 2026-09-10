import { describe, it, expect } from "vitest";
import { quietPickPublishBlockReason } from "../../lib/quiet-pick";

/**
 * 붕괴 가드(§12)와 3일 규칙(WO-RESET-06)이 **정면으로 부딪혔다** (2026-08-27 프로덕션).
 *
 * ```
 * blocked: "직전 15장 → 5장 붕괴(하한 50%) — 직전 페이로드를 유지한다"
 * exposure: { blocked: 14 }
 * ```
 *
 * 가드가 잡으려는 것은 **까닭 모를 붕괴**다. 여기선 14장이 왜 빠졌는지 우리가 정확히 안다 —
 * 규칙이 의도대로 동작한 것이다. 가드를 끄는 게 아니라 **세는 대상을 바로잡는다.**
 */
const picks = (n: number) => Array.from({ length: n }, () => ({}) as never);
const next = (n: number, exposureBlocked?: number, inputFailures: string[] = []) => ({
  picks: picks(n),
  qualification: {
    inputFailures,
    ...(exposureBlocked === undefined ? {} : { exposure: { blocked: exposureBlocked, readmitted: 0, byReason: {} } }),
  } as never,
});

describe("설명된 축소는 붕괴가 아니다", () => {
  it("3일 규칙이 뺀 만큼을 되더하면 붕괴가 아니다 — 실측 그대로(15 → 5, 제외 14)", () => {
    expect(quietPickPublishBlockReason(next(5, 14), { picks: picks(15) })).toBeNull();
  });

  it("되더해도 반토막이면 여전히 막는다 — 가드를 끈 것이 아니다", () => {
    const reason = quietPickPublishBlockReason(next(2, 1), { picks: picks(15) });
    expect(reason).toContain("붕괴");
    expect(reason).toContain("되더한 뒤에도");
  });

  it("설명이 없는 축소는 종전대로 막는다", () => {
    expect(quietPickPublishBlockReason(next(5), { picks: picks(15) })).toContain("붕괴");
  });

  it("0장은 설명이 있어도 발행하지 않는다 — 빈 덱은 어떤 이유로도 안 된다", () => {
    expect(quietPickPublishBlockReason(next(0, 30), { picks: picks(15) })).toContain("0장");
  });

  it("필수 입력이 실패했으면 설명을 보기 전에 막는다 — 장애가 우선이다", () => {
    const reason = quietPickPublishBlockReason(
      next(5, 14, ["readSupplyDemandHistoryByTickers"]),
      { picks: picks(15) }
    );
    expect(reason).toContain("읽지 못함");
  });
});

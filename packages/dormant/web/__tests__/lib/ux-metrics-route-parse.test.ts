import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyUxEvents, slotGroupKey, type UxSessionRow } from "../../lib/ux-telemetry";

/**
 * `POST /api/fomo/ux-metrics` 의 이벤트 파서는 **필드 화이트리스트**다.
 *
 * ## 왜 이 테스트가 있나 (실측 사고)
 *
 * 슬롯 라벨(WO-SUB-04 사후 비교)을 프론트·서버 집계에 심고 배포했는데, 라우트 파서에 필드를
 * 추가하지 않아 **입구에서 버려졌다.** 프로덕션에 `hasChart: true` 를 보내니 집계가
 * `라벨없음` 군으로 셌다. 타입도 통과했고 단위 테스트도 통과했다 — 파서가 조용히 필드를
 * 떨어뜨리는 것은 어느 게이트에도 안 걸린다.
 *
 * 그래서 **라우트 소스에 필드가 있는지**와 **집계가 그 필드를 실제로 군으로 세는지**를 함께 본다.
 */

const ROUTE = readFileSync(new URL("../../app/api/fomo/ux-metrics/route.ts", import.meta.url), "utf8");

describe("라우트 파서가 라벨을 통과시킨다", () => {
  it("세 라벨이 모두 파서에 등재돼 있다", () => {
    for (const field of ["hasChart", "hasSubstance", "hasRisk"]) {
      expect(ROUTE, `파서에 ${field} 없음 — 프론트가 보내도 버려진다`).toContain(field);
    }
  });

  it("불리언만 받는다 — 문자열 'true' 가 통과하면 군이 오염된다", () => {
    expect(ROUTE).toMatch(/typeof x === "boolean"/);
  });

  /** 파서가 화이트리스트라는 사실을 주석으로 남겨야 다음 사람이 같은 함정에 안 빠진다. */
  it("화이트리스트라는 경고가 주석에 있다", () => {
    expect(ROUTE).toContain("화이트리스트");
  });
});

describe("라벨 → 군 매핑 (프론트가 보내는 형태 그대로)", () => {
  const empty = (): UxSessionRow => ({
    sessionId: "s",
    date: "2026-08-08",
    updatedAt: "",
    counts: {},
    dwellMs: [],
    scrollRatios: [],
    cardsConsumed: [],
    viewByPosition: {},
    skipByPosition: {},
    bySlotGroup: {},
  });

  it("프로덕션에서 실패한 그 입력이 이제 ③있음 군으로 간다", () => {
    // 실측 사고 재현: 이 payload 를 보냈는데 `라벨없음` 으로 셌다.
    const next = applyUxEvents(empty(), [
      { event: "card_view", position: 1, hasChart: true, hasSubstance: true, hasRisk: true },
    ]);
    expect(next.bySlotGroup?.["chart:1|substance:1|risk:1"]).toEqual({ card_view: 1 });
    expect(next.bySlotGroup?.["chart:?|substance:?|risk:?"]).toBeUndefined();
  });

  it("군 키가 세 축을 모두 담는다", () => {
    expect(slotGroupKey({ hasChart: true, hasSubstance: false })).toBe("chart:1|substance:0|risk:?");
  });
});

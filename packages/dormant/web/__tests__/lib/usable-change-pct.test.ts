/**
 * B-1 회귀 — 장전에 구운 `0.0%` 껍데기가 카드에 박히던 문제(WO-RESET-01 B-1).
 *
 * 실측(2026-08-25): 덱 7장이 전부 `0.0%`. `asOf` 가 08:57 KST(장 시작 3분 전)였다.
 */
import { describe, expect, it } from "vitest";
import { usableChangePct } from "../../lib/quiet-pick";

describe("usableChangePct", () => {
  it("장전 껍데기 0 은 쓰지 않는다 — 등락률 자체를 안 보여준다", () => {
    expect(usableChangePct(0)).toBeUndefined();
    expect(usableChangePct(0, 0, 0)).toBeUndefined();
  });

  it("앞 소스의 0 이 뒤 소스의 실값을 가로막지 않는다", () => {
    expect(usableChangePct(0, -1.2)).toBe(-1.2);
    // 종전 코드는 `front ?? row ?? hint` 였다. `??` 는 0 을 nullish 로 보지 않으므로
    // 앞 소스의 껍데기 0 이 그대로 살아남았다 — 그것이 화면의 `0.0%` 였다.
    const nullishCoalesce = (a: number | undefined, b: number) => a ?? b;
    expect(nullishCoalesce(0, -1.2)).toBe(0);
  });

  it("실값은 부호 그대로 통과한다", () => {
    expect(usableChangePct(-1.37)).toBe(-1.37);
    expect(usableChangePct(0.7)).toBe(0.7);
  });

  it("없거나 숫자가 아니면 undefined", () => {
    expect(usableChangePct(undefined)).toBeUndefined();
    expect(usableChangePct(Number.NaN, Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(usableChangePct()).toBeUndefined();
  });
});

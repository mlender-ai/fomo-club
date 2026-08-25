/** WO-RESET-01 B-1 — 장전 껍데기 `0.0%` 를 그리지 않는다. */
import { describe, expect, it } from "vitest";
import { displayChangePct } from "../lib/pickChange";

describe("displayChangePct", () => {
  it("0 은 그리지 않는다 — 껍데기와 진짜 보합을 구별할 수 없다", () => {
    expect(displayChangePct(0)).toBeNull();
    expect(displayChangePct(-0)).toBeNull();
  });

  it("실값은 부호 그대로 통과한다", () => {
    expect(displayChangePct(-1.2)).toBe(-1.2);
    expect(displayChangePct(0.7)).toBe(0.7);
  });

  it("없거나 숫자가 아니면 null", () => {
    expect(displayChangePct(undefined)).toBeNull();
    expect(displayChangePct(Number.NaN)).toBeNull();
  });
});

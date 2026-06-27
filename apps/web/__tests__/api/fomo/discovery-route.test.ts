import { describe, expect, it } from "vitest";

import { shouldUseTargetedMaterial } from "../../../lib/discovery-route-policy";

describe("discovery route loading policy", () => {
  it("keeps US material hooks enabled even on the fast first-load path", () => {
    expect(shouldUseTargetedMaterial("US", true)).toBe(true);
    expect(shouldUseTargetedMaterial("US", false)).toBe(true);
  });

  it("keeps KR fast path lightweight", () => {
    expect(shouldUseTargetedMaterial("KR", true)).toBe(false);
    expect(shouldUseTargetedMaterial("KR", false)).toBe(true);
  });
});

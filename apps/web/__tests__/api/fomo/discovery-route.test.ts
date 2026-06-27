import { describe, expect, it } from "vitest";

import { shouldUseTargetedMaterial, targetedMaterialLimitFor } from "../../../lib/discovery-route-policy";

describe("discovery route loading policy", () => {
  it("keeps US material hooks enabled even on the fast first-load path", () => {
    expect(shouldUseTargetedMaterial("US", true)).toBe(true);
    expect(shouldUseTargetedMaterial("US", false)).toBe(true);
  });

  it("keeps KR material hooks enabled with a capped fast budget", () => {
    expect(shouldUseTargetedMaterial("KR", true)).toBe(true);
    expect(shouldUseTargetedMaterial("KR", false)).toBe(true);
  });

  it("caps targeted material work on fast routes instead of disabling hooks", () => {
    expect(targetedMaterialLimitFor("KR", true)).toBe(36);
    expect(targetedMaterialLimitFor("US", true)).toBe(50);
    expect(targetedMaterialLimitFor("KR", false)).toBe(120);
    expect(targetedMaterialLimitFor("US", false)).toBe(80);
  });
});

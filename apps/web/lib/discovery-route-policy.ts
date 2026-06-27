import type { DiscoveryCountryScope } from "./market-source-types";

export function shouldUseTargetedMaterial(country: DiscoveryCountryScope, fast: boolean): boolean {
  // Fast cards still need material hooks; cap the work in the route instead of disabling it.
  return true;
}

export function targetedMaterialLimitFor(country: DiscoveryCountryScope, fast: boolean): number | undefined {
  if (fast) return country === "US" ? 50 : 36;
  return country === "US" ? 80 : 120;
}

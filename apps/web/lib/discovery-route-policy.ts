import type { DiscoveryCountryScope } from "./market-source-types";

export function shouldUseTargetedMaterial(country: DiscoveryCountryScope, fast: boolean): boolean {
  // US fast deck has no KR-style sector/news cache yet, so keep cheap per-symbol material on.
  return country === "US" ? true : !fast;
}

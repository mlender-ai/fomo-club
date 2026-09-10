export function stockInsightCacheControl(coldFallback: boolean): string {
  return coldFallback
    ? "no-store, max-age=0"
    : "public, s-maxage=900, stale-while-revalidate=1800";
}

/**
 * US-02 PART A — 미국 커버리지 진단.
 *
 * 원칙: 고치기 전에 숫자부터 찍는다. 이 스크립트는 **읽기 전용**이며 외부 호출 없이
 * 정적 유니버스 규모(A-1)만 센다. 신호별·단계별 카운트(A-2·A-3)는 실제 파이프라인을
 * 돌려야 하므로 별도 경로(us-coverage-live.ts)에서 잰다.
 */
import { US_DISCOVERY_SYMBOLS, usDiscoveryUniverse, usStockDefs } from "../../apps/web/lib/us-symbols";
import { STOCK_VOCAB } from "@fomo/core";

function main(): void {
  const vocab = STOCK_VOCAB as ReadonlyArray<{ country?: string; market?: string }>;
  const byCountry = new Map<string, number>();
  const byMarket = new Map<string, number>();
  for (const def of vocab) {
    byCountry.set(def.country ?? "?", (byCountry.get(def.country ?? "?") ?? 0) + 1);
    byMarket.set(def.market ?? "?", (byMarket.get(def.market ?? "?") ?? 0) + 1);
  }
  const uni = usDiscoveryUniverse();
  console.log("[A-1] 정적 유니버스");
  console.log("  STOCK_VOCAB 전체:", vocab.length);
  console.log("  country별:", Object.fromEntries(byCountry));
  console.log("  market별:", Object.fromEntries(byMarket));
  console.log("  US_DISCOVERY_SYMBOLS(큐레이션):", US_DISCOVERY_SYMBOLS.length);
  console.log("  usStockDefs():", usStockDefs().length);
  console.log("  usDiscoveryUniverse() 합계:", uni.length);
  console.log("    NASDAQ:", uni.filter((u) => u.market === "NASDAQ").length);
  console.log("    NYSE:", uni.filter((u) => u.market === "NYSE").length);
  console.log("    sector=미국주식(vocab 보강분):", uni.filter((u) => u.sector === "미국주식").length);
}

main();

/**
 * 수급 일별 수집·누적 cron. SUPPLY DEMAND SCORE HANDOFF §1·§2.
 *
 * 네이버 금융 일별 외국인·기관 순매매를 **픽 엔진과 같은 유니버스**로 수집 →
 * SupplyDemandDaily 에 (ticker,date) upsert(누적). 장 마감 확정치 — 시점(기준일)은 데이터에 부착됨.
 *
 * ## 유니버스는 픽 엔진과 같아야 한다 (WO-RESET-04 PART D)
 *
 * 종전에는 `STOCK_VOCAB`(80종목)만 훑었다. 픽 엔진 유니버스를 시세 행으로 넓혀놓고 이쪽을
 * 그대로 두면, 새로 들어온 종목은 **수급 이력이 없어서** 기관·외인 신호가 영원히 안 뜬다.
 * 그래서 `buildKrPickUniverse` 를 그대로 쓴다 — 두 쪽이 같은 함수를 보므로 어긋날 수 없다.
 * 시세 조회가 실패하면 그 함수가 사전으로 후퇴하므로 종전 동작이 최악의 경우다.
 *
 * DATABASE_URL 없으면 수집만 하고 로그(드라이런). 테이블 미생성이면 store 가 폴백(0건) — 누락 가시화.
 * 차단/실패해도 throw 없이 다음 종목 진행(빈 값 폴백). 레이트: 종목 간 짧은 간격.
 */
import { STOCK_VOCAB } from "@fomo/core";
import { fetchKrMarketRows } from "../apps/web/lib/discovery-supply";
import { buildKrPickUniverse } from "../apps/web/lib/pick-universe";
import { fetchSupplyDemand } from "../apps/web/lib/supply-demand";
import { fetchKisInvestorFlow, kisEnabled } from "../apps/web/lib/kis";
import { writeSupplyDemand } from "../apps/web/lib/supply-demand-store";

const GAP_MS = 400; // 종목 간 간격(네이버 레이트 보호)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows = await fetchKrMarketRows().catch((err: unknown) => {
    // 조용한 후퇴 금지 — 사전으로 돌아간 사실을 로그에 남긴다.
    console.warn(`[supply-demand] 시세 행 조회 실패 → 사전 유니버스로 후퇴: ${(err as Error)?.message}`);
    return [];
  });
  const universe = buildKrPickUniverse(rows, STOCK_VOCAB);
  const targets = universe.defs.filter((d) => d.naverCode); // 국내 상장만
  const hasDb = !!process.env.DATABASE_URL;
  const useKis = kisEnabled(); // 앱키 있으면 KIS(개인 포함), 없으면 네이버(외인·기관)
  console.log(
    `[supply-demand] 대상 ${targets.length}종목 (출처=${universe.source} · 사전 ${universe.fromVocab} + 신규 ${universe.fromRows}), ` +
      `DB=${hasDb ? "on" : "dry-run"}, 소스=${useKis ? "KIS(개인 포함)" : "네이버"}`
  );

  let collected = 0;
  let saved = 0;
  for (const d of targets) {
    // KIS 우선(개인까지) → 실패/미설정 시 네이버 폴백(외인·기관). 둘 다 시점(기준일) 부착.
    const kis = useKis ? await fetchKisInvestorFlow(d.naverCode!) : null;
    const flows = kis ? [kis] : await fetchSupplyDemand(d.naverCode!);
    if (flows.length === 0) {
      console.warn(`  ✗ ${d.canonical}(${d.naverCode}): 수급 0(차단/형식변경?)`);
      await sleep(GAP_MS);
      continue;
    }
    collected += flows.length;
    const latest = flows[0]!;
    if (hasDb) {
      const n = await writeSupplyDemand(d.naverCode!, flows);
      saved += n;
      console.log(`  ✓ ${d.canonical}: ${flows.length}건 수집 / ${n}건 누적 (최근 ${latest.date} 외인 ${latest.foreignNet} 기관 ${latest.institutionNet})`);
    } else {
      console.log(`  ✓ ${d.canonical}: ${flows.length}건 (DRY, 최근 ${latest.date})`);
    }
    await sleep(GAP_MS);
  }
  console.log(`[supply-demand] 완료 — 수집 ${collected}건, 누적 저장 ${saved}건`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[supply-demand] 실패", err);
    process.exit(1);
  });

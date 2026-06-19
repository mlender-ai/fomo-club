/**
 * 수급 일별 수집·누적 cron. SUPPLY DEMAND SCORE HANDOFF §1·§2.
 *
 * 네이버 금융 일별 외국인·기관 순매매를 STOCK_VOCAB 국내 종목(naverCode 보유)별로 수집 →
 * SupplyDemandDaily 에 (ticker,date) upsert(누적). 장 마감 확정치 — 시점(기준일)은 데이터에 부착됨.
 *
 * DATABASE_URL 없으면 수집만 하고 로그(드라이런). 테이블 미생성이면 store 가 폴백(0건) — 누락 가시화.
 * 차단/실패해도 throw 없이 다음 종목 진행(빈 값 폴백). 레이트: 종목 간 짧은 간격.
 */
import { STOCK_VOCAB } from "@fomo/core";
import { fetchSupplyDemand } from "../apps/web/lib/supply-demand";
import { fetchKisInvestorFlow, kisEnabled } from "../apps/web/lib/kis";
import { writeSupplyDemand } from "../apps/web/lib/supply-demand-store";

const GAP_MS = 400; // 종목 간 간격(네이버 레이트 보호)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = STOCK_VOCAB.filter((d) => d.naverCode); // 국내 상장만
  const hasDb = !!process.env.DATABASE_URL;
  const useKis = kisEnabled(); // 앱키 있으면 KIS(개인 포함), 없으면 네이버(외인·기관)
  console.log(`[supply-demand] 대상 ${targets.length}종목, DB=${hasDb ? "on" : "dry-run"}, 소스=${useKis ? "KIS(개인 포함)" : "네이버"}`);

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

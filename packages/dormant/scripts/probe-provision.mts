/**
 * PART A 실측 — 실제 SEC companyfacts 로 대손 전입액이 판정 가능한 형태로 붙는지 센다.
 *
 * 실행: `npx tsx scripts/probe-provision.mts JPM BAC WFC ...`
 *
 * **이 프로브는 수집 상한을 잰다.** 여기서는 `collectCreditLossProvision` 이 뽑은 기간
 * 전부를 분기 레코드로 만들지만, 실제 파이프라인은 **오버레이**라 이미 존재하는 분기
 * 레코드에만 값을 얹는다(그렇게 해야 매출·순이익이 전부 null 인 레코드가 생기지 않는다).
 * 따라서 실제 팩트시트의 관측 수는 여기 찍힌 수보다 적다 — 판정 가능 여부(연속 2분기 이상)는
 * 그래도 유지되지만, 이 숫자를 커버리지로 인용하면 과대평가다.
 */
import { collectCreditLossProvision, loadCikMap, type CompanyFacts } from "../apps/web/lib/fundamentals/sec-xbrl";
import { seriesForMetric } from "../packages/fomo-core/src/risk/invalidation-series";
import { businessInvalidationCatalog } from "../packages/fomo-core/src/risk/business-invalidation";
import { judgeBusinessInvalidation } from "../packages/fomo-core/src/risk/business-invalidation";
import type { FactSheet, QuarterRecord } from "../packages/fomo-core/src/fundamentals/types";

const SYMBOLS = process.argv.slice(2);
const inv = businessInvalidationCatalog().find((r) => r.code === "BANK_FINANCIAL")!.invalidation!;

async function main() {
const { map, failed } = await loadCikMap();
if (failed) { console.error("CIK 맵 로드 실패"); process.exit(1); }

let judgeable = 0;
const rows: string[] = [];
for (const symbol of SYMBOLS) {
  const cik = map.get(symbol.toUpperCase());
  if (!cik) { rows.push(`${symbol}\tCIK 없음`); continue; }
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: { "User-Agent": "fomo-club probe contact@fomo.club" },
  });
  if (!res.ok) { rows.push(`${symbol}\tHTTP ${res.status}`); continue; }
  const facts = (await res.json()) as CompanyFacts;
  const collected = collectCreditLossProvision(facts);
  const quarters: QuarterRecord[] = [...collected.entries()].map(([end, v]) => ({
    period: end.slice(0, 7), period_end: end, filed_at: end,
    revenue: null, operating_income: null, net_income: null, eps_diluted: null,
    credit_loss_provision: v.val, source: "probe",
  }));
  const sheet = { fiscal: { quarters } } as unknown as FactSheet;
  const series = seriesForMetric(inv.metric, sheet);
  const concepts = new Set([...collected.values()].map((v) => v.concept));
  if (series.ok) {
    judgeable += 1;
    const verdict = judgeBusinessInvalidation(inv, { series: series.series });
    rows.push(`${symbol}\t수집 ${collected.size}분기\t연속 ${series.series.length}\t판정 ${verdict}\t별칭 ${concepts.size}종`);
  } else {
    rows.push(`${symbol}\t수집 ${collected.size}분기\t판정불가: ${series.reason}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}
console.log(rows.join("\n"));
console.log(`\n판정 가능: ${judgeable}/${SYMBOLS.length}`);
}
await main();

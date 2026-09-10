/**
 * MACRO-01 완료 확인 6 — **하루 거시 카드가 1~3장 나오나.**
 *
 * 임계만 보면 후보 수는 알아도 카드 수는 모른다. 뒤에 연결 필터(업종·시장 2곳 이상)와
 * 분류별 상한(2장)이 있기 때문이다. 과거를 그대로 재생해 실제 카드 수를 센다.
 *
 * **미래를 보지 않는다** — 각 날짜에서 `p.date <= day` 로 잘라 그날까지만 보고 판정한다.
 * 전체 시리즈로 한 번에 재면 오늘 임계가 과거를 알고 있는 셈이 된다.
 *
 * ```bash
 * npx tsx scripts/macro-backtest.ts
 * ```
 *
 * 결과는 `docs/MACRO_THRESHOLDS.md` 에 기록한다.
 */
import { collectMacro } from "../apps/web/lib/macro-collect";
import {
  MACRO_INDICATORS, detectMacroMove, isMacroFresh, linkMacroToPicks, selectMacroMoves,
} from "../packages/fomo-core/src/keyword-cards/macro-link";

/**
 * 업종·시장이 골고루 있는 픽 세트 — 실제 덱과 비슷한 폭으로 둔다.
 *
 * 실제 최근 픽을 쓰려면 DB 가 필요하고, 그러면 이 스크립트가 로컬에서 안 돈다. 대신
 * **연결이 후하지도 박하지도 않은** 폭을 쓴다 — 업종 9개가 금융·건설·항공·화학까지
 * 흩어져 있어 어느 지표든 두세 곳은 닿는다.
 */
const PICKS = [
  ["A반도체","반도체와반도체장비","KOSPI"],["B화학","화학","KOSDAQ"],["C기계","기계","KOSDAQ"],
  ["D건설","건설","KOSPI"],["E은행","은행","KOSPI"],["F항공","항공사","KOSDAQ"],
  ["G조선","조선","KOSPI"],["H증권","증권","KOSPI"],["I소프트","소프트웨어","KOSDAQ"],
].map(([canonical, sector, market]) => ({ canonical: canonical!, sector, market, pickedAt: "2026-08-20" }));

async function main() {
  const col = await collectMacro("2026-09-01");
  // 모든 날짜를 모아 오름차순으로.
  const dates = [...new Set(Object.values(col.series).flatMap((p) => (p ?? []).map((x) => x.date)))].sort();
  const days = dates.slice(-70);

  const counts: number[] = [];
  const byIndicator = new Map<string, number>();
  const byKind = new Map<string, number>();
  const rows: Array<{ date: string; n: number; ids: string[] }> = [];

  for (const day of days) {
    const candidates: any[] = [];
    for (const ind of MACRO_INDICATORS) {
      // **그날까지만** 본다 — 미래를 보면 백테스트가 아니다.
      const pts = (col.series[ind.id] ?? []).filter((p) => p.date <= day);
      if (pts.length < 2) continue;
      const move = detectMacroMove({ id: ind.id, points: pts });
      if (!move || !isMacroFresh(move.asOf, day)) continue;
      const link = linkMacroToPicks(move, PICKS as any);
      if (!link) continue;
      candidates.push({ move, link });
    }
    const chosen = selectMacroMoves(candidates);
    counts.push(chosen.length);
    rows.push({ date: day, n: chosen.length, ids: chosen.map((c: any) => `${c.move.indicator.id}:${c.move.kind}`) });
    for (const c of chosen as any) {
      byIndicator.set(c.move.indicator.id, (byIndicator.get(c.move.indicator.id) ?? 0) + 1);
      byKind.set(c.move.kind, (byKind.get(c.move.kind) ?? 0) + 1);
    }
  }

  const total = counts.reduce((a, b) => a + b, 0);
  const zero = counts.filter((c) => c === 0).length;
  const inRange = counts.filter((c) => c >= 1 && c <= 3).length;
  console.log(`재생한 날 ${counts.length}일 · 총 ${total}장 · 하루 평균 ${(total / counts.length).toFixed(2)}장`);
  console.log(`0장인 날 ${zero}일 (${((zero / counts.length) * 100).toFixed(0)}%) · 1~3장인 날 ${inRange}일 (${((inRange / counts.length) * 100).toFixed(0)}%)`);
  console.log(`분포: ${[0,1,2,3].map((n) => `${n}장 ${counts.filter((c) => c === n).length}일`).join(" · ")}`);
  console.log(`상한 초과: ${counts.filter((c) => c > 3).length}일`);

  console.log("\n지표별 등장");
  for (const [id, n] of [...byIndicator.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${id.padEnd(13)} ${n}회`);
  console.log("\n사건 종류별");
  for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${n}회`);

  console.log("\n최근 15일");
  for (const r of rows.slice(-15)) console.log(`  ${r.date}  ${r.n}장  ${r.ids.join(", ")}`);
}
main();

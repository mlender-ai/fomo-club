/**
 * WO-SUB-08 착수 조건 — 카드 3슬롯 커버리지 실측.
 *
 * 08 §4-1: "②③이 모두 없으면 카드는 지금과 동일한 모습이 된다. 그런 카드의 비율을 계측하고
 * 대시보드에 노출한다. **이 비율이 곧 이 배치의 진척도다.**"
 *
 * 지시(2026-08-03): "①만 있는 카드 비율이 절반을 넘으면, 08 의 레이아웃 설계가 '3슬롯 채워진
 * 카드'가 아니라 '①만 있는 카드'를 기준으로 가야 한다."
 *
 * 그래서 **설계 전에** 센다. 로컬에 DB 가 없어 CI 에서 돈다(`card-slot-coverage.yml`).
 *
 * 실행: npx tsx --env-file=.env scripts/card-slot-coverage.ts --out docs/audit
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CardSlotCoverageReport, CardSlotSummary } from "../apps/web/lib/card-slots/coverage";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

function pct(value: number, total: number): string {
  return total === 0 ? "—" : `${((value / total) * 100).toFixed(1)}%`;
}

function summaryTable(label: string, summary: CardSlotSummary): string[] {
  const lines: string[] = [];
  const n = summary.n;
  lines.push(`### ${label} (n=${n})`);
  lines.push("");
  if (n === 0) {
    lines.push("표본 0 — 셀 것이 없다.");
    lines.push("");
    return lines;
  }
  lines.push("| 조합 | 카드 수 | 비율 |");
  lines.push("|---|---|---|");
  for (const [key, value] of Object.entries(summary.combinations)) {
    const mark = key === "①만" && value / n > 0.5 ? " ⚠️" : "";
    lines.push(`| ${key}${mark} | ${value} | ${pct(value, n)} |`);
  }
  lines.push("");
  lines.push(`- 슬롯 ② 실체 **${summary.slot2}/${n} (${pct(summary.slot2, n)})** · 슬롯 ③ 값의 위치 **${summary.slot3}/${n} (${pct(summary.slot3, n)})**`);
  lines.push("");
  lines.push("| 슬롯 | 못 나오는 사유 | 건수 |");
  lines.push("|---|---|---|");
  for (const [reason, count] of Object.entries(summary.slot2_reasons).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ② | \`${reason}\` | ${count} |`);
  }
  for (const [reason, count] of Object.entries(summary.slot3_reasons).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ③ | \`${reason}\` | ${count} |`);
  }
  lines.push("");
  lines.push("| 아키타입 | n | 슬롯③ 성공 |");
  lines.push("|---|---|---|");
  for (const [code, bucket] of Object.entries(summary.by_archetype).sort((a, b) => b[1].n - a[1].n)) {
    lines.push(`| \`${code}\` | ${bucket.n} | ${bucket.slot3} (${pct(bucket.slot3, bucket.n)}) |`);
  }
  lines.push("");
  return lines;
}

function render(report: CardSlotCoverageReport): string {
  const lines: string[] = [];
  const u = report.universe;
  const onlyOne = u.n === 0 ? 0 : u.combinations["①만"] / u.n;

  lines.push("# 카드 3슬롯 커버리지 (WO-SUB-08 착수 조건)");
  lines.push("");
  lines.push(`측정일: ${report.date} · 룰셋 \`${report.ruleset_version}\``);
  lines.push("");
  lines.push("> **필드 존재가 아니라 화면에 낼 수 있는지로 셌다.**");
  lines.push("> 슬롯 ② 는 `toRenderable(context)`, 슬롯 ③ 은 `buildValuationChart(...).renderable` 이 게이트다.");
  lines.push("> `slot1_revenue_source !== null` 로 세면 화면에 못 나오는 것을 있다고 세게 된다.");
  lines.push("");
  lines.push("> 슬롯 ① 은 **발행 카드라는 사실 자체가 근거**라 100% 다(§4-1: 없으면 카드가 성립하지 않는다).");
  lines.push("> 표본은 원장 발행 종목이라 수급 엔진의 선택 편향이 있다 — 다만 08 이 묻는 것이");
  lines.push("> \"우리가 발행하는 카드가 어떤 모양인가\"라 여기서는 그 편향이 맞는 모수다.");
  lines.push("");
  lines.push("## 판정");
  lines.push("");
  lines.push(
    onlyOne > 0.5
      ? `**①만 있는 카드가 ${pct(u.combinations["①만"], u.n)} 로 과반이다.** 지시대로 08 의 레이아웃 설계는\n"3슬롯 채워진 카드"가 아니라 **"①만 있는 카드"를 기준**으로 가야 한다. §4-1 의\n"②③이 모두 없으면 지금과 동일한 모습" 이 예외가 아니라 **기본형**이다.`
      : `①만 있는 카드가 ${pct(u.combinations["①만"], u.n)} 로 과반이 아니다. 3슬롯 구조를 기준으로 설계하되\n생략 시 승격 규칙을 지킨다.`
  );
  lines.push("");
  lines.push("## 1. 오늘 노출 중인 덱");
  lines.push("");
  lines.push(...summaryTable("live deck", report.live_deck));
  lines.push("## 2. 365일 발행 이력");
  lines.push("");
  lines.push(...summaryTable("universe", report.universe));
  lines.push("## 3. 사유 읽는 법");
  lines.push("");
  lines.push("| 사유 | 뜻 | 해소 경로 |");
  lines.push("|---|---|---|");
  lines.push("| `no_record` | 사업 실체 레코드 자체가 없다 | WO-SUB-03 배치가 아직 안 돈 종목 |");
  lines.push("| `not_renderable` | 레코드는 있는데 배지가 `없음`이거나 슬롯1 미검증 | 입력 크기·검증기 문제(03.5 C-1) |");
  lines.push("| `no_factsheet` | 팩트시트가 없다 | WO-SUB-01 백필 |");
  lines.push("| `unclassified` | 아키타입 미분류 | 02R 카탈로그 재도출 |");
  lines.push("| `bar_series_unavailable` | 그 유형의 막대축 시계열이 소스에 없다 | **데이터를 더 모아도 안 된다** — 축 설계 문제 |");
  lines.push("| `no_bar_data` | 축은 되는데 이 종목에 값이 없다 | 그 종목의 결손 |");
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const outDir = flag("--out");
  const { buildCardSlotCoverage } = await import("../apps/web/lib/card-slots/coverage");
  console.log("[08] 3슬롯 커버리지 집계…");
  const report = await buildCardSlotCoverage();
  const doc = render(report);
  // stdout 에도 찍는다 — Step Summary 는 API 로 읽을 수 없다(실측 교훈).
  console.log(doc);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "COVERAGE_card_slots.md"), doc);
    writeFileSync(join(outDir, "card_slots_raw.json"), JSON.stringify(report, null, 1));
    console.log(`\n[08] 저장 — ${join(outDir, "COVERAGE_card_slots.md")}`);
  }
}

main().catch((error) => {
  console.error("[08] 실패", error);
  process.exit(1);
});

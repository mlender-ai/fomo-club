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
import type { CardSlotCoverageReport, CardSlotRow, CardSlotSummary } from "../apps/web/lib/card-slots/coverage";

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
  const unclassifiedEntries = Object.entries(summary.unclassified_reasons).sort((a, b) => b[1] - a[1]);
  if (unclassifiedEntries.length > 0) {
    lines.push("| `unclassified` 사유 | 건수 | 02R 카탈로그가 푸나 |");
    lines.push("|---|---|---|");
    for (const [reason, count] of unclassifiedEntries) {
      lines.push(`| \`${reason}\` | ${count} | ${CATALOG_VERDICT[reason] ?? "판정 없음"} |`);
    }
    lines.push("");
  }
  lines.push("| 아키타입 | n | 슬롯③ 성공 |");
  lines.push("|---|---|---|");
  for (const [code, bucket] of Object.entries(summary.by_archetype).sort((a, b) => b[1].n - a[1].n)) {
    lines.push(`| \`${code}\` | ${bucket.n} | ${bucket.slot3} (${pct(bucket.slot3, bucket.n)}) |`);
  }
  lines.push("");
  return lines;
}

/**
 * A-0 판정표 — 사유별로 **카탈로그 재도출이 그 카드를 구제하는지**.
 * WO-SUB-FINISH [A-0] 이 요구한 분류다. 여기서 "아니오" 인 건수에 02R 을 쓰면 헛수고다.
 */
const CATALOG_VERDICT: Record<string, string> = {
  no_rule_matched: "**예** — 02R 이 정확히 이걸 푼다",
  no_sector: "아니오 — 분류 코드 결손",
  no_fiscal: "아니오 — 재무 데이터 결손",
  unknown_scheme: "아니오 — 분류 체계 미지원",
};

function num(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

/** 미분류 종목별 관측값 — 사유 뒤에 있는 사실을 본다. 집계만 보면 왜 안 걸렸는지 모른다. */
function unclassifiedRows(label: string, rows: readonly CardSlotRow[]): string[] {
  const lines: string[] = [];
  const targets = rows.filter((row) => row.unclassified !== null && row.slot3_reason === "unclassified");
  lines.push(`### ${label} — 미분류 종목별 관측값 (n=${targets.length})`);
  lines.push("");
  if (targets.length === 0) {
    lines.push("미분류 0.");
    lines.push("");
    return lines;
  }
  lines.push("| 종목 | 시장 | 사유 | 체계 | 업종 | 재무 | 순이익TTM | 매출YoY | CAGR3Y | 배당률 | PBR | 순현금비 | 연간관측 |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of targets) {
    const d = row.unclassified!;
    lines.push(
      `| \`${row.canonical}\` | ${row.market} | \`${d.reason}\` | ${d.scheme ?? "—"} | ${d.industry ?? "—"} | ${d.coverage_flag} | ` +
        `${d.net_income_ttm === null ? "—" : d.net_income_ttm > 0 ? "흑자" : "적자"} | ${num(d.revenue_yoy)} | ${num(d.revenue_cagr_3y)} | ` +
        `${num(d.dividend_yield, 2)} | ${num(d.pbr, 2)} | ${num(d.net_cash_ratio, 2)} | ${d.operating_stdev_annual_years} |`
    );
  }
  lines.push("");
  lines.push("> 단위: 매출YoY·CAGR3Y·배당률 = %, 순현금비 = 순현금/시가총액, 연간관측 = 영업이익률 표준편차 관측 연수(5 미만이면 통계 미신뢰).");
  lines.push("");
  return lines;
}

/** 사유 집계에서 카탈로그가 푸는 건수(= `no_rule_matched`)와 전체를 뽑는다. */
function catalogSplit(summary: CardSlotSummary): { solvable: number; total: number } {
  const reasons = summary.unclassified_reasons;
  const total = Object.values(reasons).reduce((sum, count) => sum + count, 0);
  return { solvable: reasons.no_rule_matched ?? 0, total };
}

/**
 * A-0 판정 — B2(549종목 수집) 를 그대로 갈지, 줄일지, 멈출지.
 *
 * 덱은 n=10 이라 그것만으로 2~3일 수집을 결정할 수 없다. 그래서 **덱(질문의 대상)과
 * 유니버스(표본이 큰 쪽)를 같이 낸다.** 임계값은 판정 기준을 문서에 고정하려고 여기 둔다 —
 * 숫자를 보고 사후에 기준을 만들면 판정이 아니라 합리화가 된다.
 */
const A0_SOLVABLE_FLOOR = 0.5;

function a0Verdict(live: CardSlotSummary, universe: CardSlotSummary): string[] {
  const lines: string[] = ["### A-0 판정", ""];
  const deck = catalogSplit(live);
  const all = catalogSplit(universe);
  lines.push("| 모집단 | 미분류 | `no_rule_matched` | 카탈로그 구제 가능 비율 |");
  lines.push("|---|---|---|---|");
  lines.push(`| 오늘 덱 | ${deck.total} | ${deck.solvable} | ${pct(deck.solvable, deck.total)} |`);
  lines.push(`| 365일 유니버스 | ${all.total} | ${all.solvable} | ${pct(all.solvable, all.total)} |`);
  lines.push("");
  if (all.total === 0) {
    lines.push("유니버스 미분류 0 — 02R 이 풀 대상이 없다. B2 를 돌릴 이유가 없다.");
    lines.push("");
    return lines;
  }
  const ratio = all.solvable / all.total;
  lines.push(
    ratio >= A0_SOLVABLE_FLOOR
      ? `**유니버스 미분류의 ${pct(all.solvable, all.total)} 가 \`no_rule_matched\` 다 — 02R 이 푸는 종류다.**\n` +
          `B2(549종목 표본 수집)를 설계대로 진행한다.`
      : `**유니버스 미분류의 ${pct(all.solvable, all.total)} 만 \`no_rule_matched\` 다 (기준 ${A0_SOLVABLE_FLOOR * 100}%).**\n` +
          `나머지는 분류 코드·재무 결손이라 카탈로그를 늘려도 그대로다. A-0 지시대로 **B2 축소 또는 중단을 사람이 판정**한다 —\n` +
          `에이전트가 임의로 자르지 않는다. 결손 쪽(\`no_sector\`·\`no_fiscal\`)은 별도 소스 작업이다.`
  );
  lines.push("");
  if (deck.total > 0 && deck.total < 20) {
    lines.push(
      `> 덱 표본은 n=${deck.total} 이다. 비율로 읽지 말고 **건수로** 읽는다 — ` +
        `카탈로그가 구제할 수 있는 덱 카드는 최대 ${deck.solvable}장이고, 그것이 곧 02R 이 오늘 화면에 낼 수 있는 상한이다.`
    );
    lines.push("");
  }
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
  lines.push("## 3. 미분류 사유 분해 (WO-SUB-FINISH [A-0])");
  lines.push("");
  lines.push("> A-0: **549종목을 모으기 전에** 오늘 덱 미분류가 왜 미분류인지 사유별로 확인한다.");
  lines.push("> `no_rule_matched` 가 소수면 B2(표본 수집)를 축소하거나 중단한다 —");
  lines.push("> 카탈로그를 늘려도 안 풀리는 것에 2~3일을 쓰지 않는다.");
  lines.push("");
  const liveKeys = new Set(report.live_canonicals);
  const liveRows = report.rows.filter((row) => liveKeys.has(row.canonical));
  lines.push(...unclassifiedRows("live deck", liveRows));
  lines.push(...unclassifiedRows("universe", report.rows));
  lines.push(...a0Verdict(report.live_deck, report.universe));
  lines.push("## 4. 사유 읽는 법");
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
  lines.push("`unclassified` 안쪽 사유(A-0):");
  lines.push("");
  lines.push("| 사유 | 뜻 | 02R 카탈로그가 푸나 |");
  lines.push("|---|---|---|");
  lines.push("| `no_rule_matched` | 규칙을 전부 통과했는데 어디에도 안 걸렸다 | **예** |");
  lines.push("| `no_sector` | 업종·섹터 분류 코드가 없다 | 아니오 — 분류 코드 결손 |");
  lines.push("| `no_fiscal` | 재무 커버리지가 `none` 이다 | 아니오 — 재무 데이터 결손 |");
  lines.push("| `unknown_scheme` | 분류 체계를 업종 집합으로 해석할 수 없다 | 아니오 — 체계 매핑 부재 |");
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

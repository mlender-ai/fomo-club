/**
 * WO-SUB-01 §8-10 — 팩트시트 백필 + 커버리지 대시보드 생성.
 *
 * 두 가지 모드:
 *   1) 유니버스 백필(DB 필요) — 원장에서 커버 종목을 읽어 전부 갱신하고 저장한다.
 *      npx tsx scripts/fundamentals-backfill.ts --limit 200
 *   2) 지정 종목 실측(DB 불필요, `--dry`) — 소스 확보율을 실제 조회로 재는 용도.
 *      npx tsx scripts/fundamentals-backfill.ts --dry --symbols "CLBK:US,SHOP:US,185750:KR"
 *
 * `--out docs/fundamentals` 를 주면 커버리지 대시보드(마크다운 + 원본 JSON)를 쓴다.
 *
 * 주의: 외부 egress 가 필요하다. 막힌 환경에서 돌리면 전부 실패로 잡히므로,
 * 그 결과를 커버리지로 문서화하지 말 것(WO-SUB-00 에서 6번 재작업한 원인).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FactSheet } from "@fomo/core";
import { buildFactSheet } from "../apps/web/lib/fundamentals/build";
import { summarizeCoverage, COVERAGE_FIELDS, type CoverageReport } from "../apps/web/lib/fundamentals/coverage";
import { factsheetHash } from "../apps/web/lib/fundamentals/repository";
import type { UniverseEntry } from "../apps/web/lib/fundamentals/universe";

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function numericFlag(args: readonly string[], name: string, fallback: number): number {
  const raw = flag(args, name);
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** "CLBK:US,185750:KR" → 유니버스 엔트리. 국가 생략 시 6자리 숫자는 KR, 나머지는 US. */
function parseSymbols(raw: string): UniverseEntry[] {
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [idRaw, countryRaw] = token.split(":");
      const id = (idRaw ?? "").trim();
      const country = (countryRaw ?? (/^\d{6}$/.test(id) ? "KR" : "US")).trim().toUpperCase() === "KR" ? "KR" : "US";
      return {
        canonical: id,
        displayName: id,
        country,
        ...(country === "KR" ? { naverCode: id } : { symbol: id }),
        lastPublishedAt: new Date().toISOString().slice(0, 10),
      } satisfies UniverseEntry;
    });
}

function pctText(cell: { ok: number; n: number; pct: number | null }): string {
  return cell.n === 0 ? "—" : `${cell.ok}/${cell.n} (${cell.pct}%)`;
}

function renderDashboard(report: CoverageReport, notes: readonly string[]): string {
  const lines: string[] = [];
  lines.push("# 팩트시트 커버리지 대시보드 (WO-SUB-01)");
  lines.push("");
  lines.push("| 항목 | 값 |");
  lines.push("|---|---|");
  lines.push(`| 생성 | ${report.generatedAt} |`);
  lines.push(`| 기준일 | ${report.date} |`);
  lines.push(`| 유니버스 | ${report.universe}종목 |`);
  lines.push(`| 레코드 | ${report.records}종목 (완료 조건 1: 유니버스와 같아야 한다) |`);
  lines.push("");
  lines.push("> 이 표는 **저장된 팩트시트를 센 것**이다. 문서 조사·추정으로 채운 칸은 없다.");
  lines.push("> 값이 없는 칸은 `missing_fields` 에 그대로 등재되어 있다.");
  lines.push("");
  lines.push("## 1. 필드별 확보율");
  lines.push("");
  const groups = report.groups;
  lines.push(`| 필드 | ${groups.map((g) => `${g.group} (n=${g.count})`).join(" | ")} |`);
  lines.push(`|---|${groups.map(() => "---").join("|")}|`);
  for (const field of COVERAGE_FIELDS) {
    lines.push(`| \`${field}\` | ${groups.map((g) => pctText(g.fields[field]!)).join(" | ")} |`);
  }
  lines.push("");
  lines.push("## 2. 커버리지 플래그 · 최신성");
  lines.push("");
  lines.push("| 그룹 | full | partial | none | 밴드 계산됨 | 최신 분기 지연(중앙값) |");
  lines.push("|---|---|---|---|---|---|");
  for (const group of groups) {
    lines.push(
      `| ${group.group} | ${group.coverage_flags.full ?? 0} | ${group.coverage_flags.partial ?? 0} | ${group.coverage_flags.none ?? 0} | ${group.band_sufficient}/${group.count} | ${group.lag_days_median ?? "—"}일 |`
    );
  }
  lines.push("");
  lines.push("> 갱신 지연 = 최신 분기 **기간말**부터 기준일까지의 일수다. 공시 지연 + 소스 반영 지연의 합이며,");
  lines.push("> 분기 종료 후 45~90일(법정 제출기한)이 정상 범위다. WO-SUB-00 §5 의 미측정 항목을 여기서 갚는다.");
  lines.push("");
  lines.push("## 3. 밴드 미계산 사유");
  lines.push("");
  const reasons = Object.entries(report.band_insufficient_reasons).sort(([, a], [, b]) => b - a);
  if (reasons.length === 0) lines.push("없음.");
  else {
    lines.push("| 사유 | 건수 |");
    lines.push("|---|---|");
    for (const [reason, count] of reasons) lines.push(`| ${reason} | ${count} |`);
  }
  lines.push("");
  lines.push("## 4. 실패·결손 종목");
  lines.push("");
  if (report.failures.length === 0) lines.push("없음.");
  else {
    lines.push("| 종목 | 시장 | coverage | 결측 필드 수 | 사유 |");
    lines.push("|---|---|---|---|---|");
    for (const failure of report.failures) {
      lines.push(
        `| ${failure.canonical} | ${failure.market} | ${failure.coverage_flag} | ${failure.missing_count} | ${failure.errors.join(" · ") || "—"} |`
      );
    }
  }
  if (notes.length > 0) {
    lines.push("");
    lines.push("## 5. 실행 메모");
    lines.push("");
    for (const note of notes) lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const symbolsRaw = flag(args, "--symbols");
  const outDir = flag(args, "--out");
  const limit = numericFlag(args, "--limit", 200);

  let entries: UniverseEntry[];
  if (symbolsRaw) {
    entries = parseSymbols(symbolsRaw);
    console.log(`[backfill] 지정 종목 ${entries.length}개`);
  } else {
    const { loadFundamentalsUniverse } = await import("../apps/web/lib/fundamentals/universe");
    entries = (await loadFundamentalsUniverse()).slice(0, limit);
    console.log(`[backfill] 유니버스 ${entries.length}종목 (원장 기준)`);
  }
  if (entries.length === 0) throw new Error("대상 종목이 없다 — 표본 없이 커버리지를 적지 않는다");

  const factsheets: FactSheet[] = [];
  const notes: string[] = [];
  for (const [index, entry] of entries.entries()) {
    const factsheet = await buildFactSheet(entry);
    factsheets.push(factsheet);
    if (!dry) {
      const { writeFactSheet } = await import("../apps/web/lib/fundamentals/repository");
      await writeFactSheet(factsheet);
    }
    const hash = factsheetHash(factsheet);
    console.log(
      `  [${index + 1}/${entries.length}] ${entry.canonical} ${factsheet.market} coverage=${factsheet.fiscal.coverage_flag}` +
        ` quarters=${factsheet.fiscal.quarters.length} missing=${factsheet.missing_fields.length} hash=${hash.slice(0, 8)}` +
        (factsheet.source_errors.length > 0 ? ` errors=${factsheet.source_errors.length}` : "")
    );
    for (const error of factsheet.source_errors) console.log(`        · ${error}`);
  }

  const report = summarizeCoverage(factsheets, { universe: entries.length });
  notes.push(`실행 모드: ${symbolsRaw ? "지정 종목" : "유니버스"}${dry ? " · --dry(저장 안 함)" : " · 저장함"}`);
  notes.push(`대상 ${entries.length}종목 전부 레코드 생성됨(${report.records}건) — 완료 조건 1`);
  // 환경에 따라 확보율이 달라지는 축을 명시한다. 안 적으면 "무료 경로에 없다"와
  // "이 실행 환경에 키가 없다"가 문서에서 구별되지 않는다.
  notes.push(
    `\`TWELVE_DATA_API_KEY\`: ${process.env.TWELVE_DATA_API_KEY ? "있음 — US 5년 종가 조회됨" : "**없음 — US 일별 종가가 0일로 측정된다.** 프로덕션 크론에서 재측정 필요"}`
  );
  notes.push(
    `\`DATABASE_URL\`: ${process.env.DATABASE_URL ? "있음 — 봉인 캔들(us/kr-candles) 병합됨" : "**없음 — 봉인 캔들 캐시를 읽지 못한다.** KR/US 종가가 이 실행에서 짧게 잡힐 수 있다"}`
  );
  notes.push(
    `\`DART_API_KEY\`: ${process.env.DART_API_KEY ? "있음(단 WO-SUB-01 은 DART 파서를 쓰지 않는다 — 구조 덤프 선행)" : "없음 — KR 8분기·실공시일·현금흐름은 미확보 상태다"}`
  );

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "COVERAGE_dashboard.md"), renderDashboard(report, notes));
    writeFileSync(
      join(outDir, "coverage_raw.json"),
      JSON.stringify({ report, factsheets: factsheets.map((f) => ({ ...f, hash: factsheetHash(f) })) }, null, 2)
    );
    console.log(`[backfill] 대시보드 저장 — ${join(outDir, "COVERAGE_dashboard.md")}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((error) => {
  console.error("[backfill] 실패", error);
  process.exit(1);
});

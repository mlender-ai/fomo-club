/**
 * WO-SUB-03 §8 완료 조건 1 — 골든셋 30종목.
 *
 * 지시서는 "슬롯 1·2 가 **사람 검증**에서 근거 있음으로 판정되는 비율 ≥ 90%" 를 요구한다.
 * 이 스크립트는 **사람이 검증할 수 있는 표를 만든다** — 생성 문장과 그 문장이 인용한 청크 원문을
 * 나란히 놓는다. 사람 판정 칸은 비워 두고, 자동 검증기 판정만 채운다.
 * 자동 판정으로 사람 판정을 대체하지 않는다(§10: 검증기가 부정확하면 품질 신호가 거짓이 된다).
 *
 * 선행: `business-context-verifier-check.ts` 로 검증기 신뢰도를 먼저 확인할 것.
 *
 * ## 증분 저장 (2026-08-01 추가) — 타임아웃에도 결과가 남아야 한다
 *
 * 이전 구조는 30종목을 **다 돌고 나서야** 파일을 썼다. 실측(run 30678060170)에서 90분 타임아웃에
 * 걸리자 71분치 LLM 호출이 전부 사라졌고, 더 나쁘게는 **아티팩트에 저장소 커밋본(07-29)이 그대로
 * 올라가 새 결과처럼 보였다**(sha256 일치로 확인). 조용한 유실보다 조용한 오보가 위험하다.
 *
 * 그래서 세 가지를 한다.
 *   1. 시작 시 출력 파일을 `status: "running"` 스텁으로 **덮어쓴다** — 낡은 커밋본이 결과로 둔갑할 수 없다.
 *   2. 종목마다 `golden30_progress.jsonl` 에 append 하고, 전체 JSON·보고서를 다시 쓴다.
 *   3. `status` 는 running → partial → complete 로만 간다. 소비자(Summary 단계)는 이 값을 먼저 본다.
 *
 * ## 배치 실행 (2026-08-01 추가) — 무료 티어를 유지한 채 완주한다
 *
 * TPM 12,000 에서 30종목 일괄 실행은 감속이 겹쳐 90분 안에 못 끝난다(실측). 유료 전환 대신
 * **10종목씩 3배치**로 쪼갠다. 배치마다 러너와 타임아웃이 따로라 감속이 누적되지 않는다.
 *
 *   --slice 1/3  → 1~10번, --slice 2/3 → 11~20번, --slice 3/3 → 21~30번
 *   --carry <jsonl>  이전 배치의 진행 로그를 이어받는다(누적 보고서를 만든다)
 *
 * 이어붙이기가 성립하는 이유가 증분 저장이다 — 각 배치가 JSONL 을 누적해서 남기므로
 * 마지막 배치의 산출물이 곧 30종목 전체 결과다. `status: complete` 는 30행이 다 찼을 때만 된다.
 *
 * 실행: npx tsx --env-file=.env scripts/business-context-goldenset.ts --out docs/business-context
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BusinessContext } from "@fomo/core";
import { buildBusinessContext } from "../apps/web/lib/business-context/build";
import { fetchVariableObservations } from "../apps/web/lib/business-context/variable-values";
import { pacingReport, quotaExhausted } from "../apps/web/lib/business-context/synthesize";
import type { UniverseEntry } from "../apps/web/lib/fundamentals/universe";
import { SECTION_PROMPT_CHARS } from "../apps/web/lib/business-context/sec-filing";

/** [식별자, 표시명] — 6자리는 KR. 유니버스 성격(무명 롱테일 + 대표주)을 섞었다. */
const GOLDEN: ReadonlyArray<readonly [string, string]> = [
  // US — 공시(10-K Item 1) 경로
  ["CLBK", "Columbia Financial"],
  ["RBKB", "Rhinebeck Bancorp"],
  ["BYRN", "Byrna Technologies"],
  ["GLOO", "Gloo"],
  ["CRWV", "CoreWeave"],
  ["SHOP", "Shopify"],
  ["MU", "Micron"],
  ["NUE", "Nucor"],
  ["VLO", "Valero"],
  ["MATX", "Matson"],
  ["IBM", "IBM"],
  ["ELV", "Elevance Health"],
  ["ADBE", "Adobe"],
  ["DELL", "Dell"],
  ["ABNB", "Airbnb"],
  // KR — 벤더 요약(네이버 corporationSummary) 경로. DART 미확보로 공시 본문이 없다.
  ["185750", "종근당"],
  ["000660", "SK하이닉스"],
  ["005490", "POSCO홀딩스"],
  ["011200", "HMM"],
  ["015760", "한국전력"],
  ["105560", "KB금융"],
  ["000100", "유한양행"],
  ["012450", "한화에어로스페이스"],
  ["051910", "LG화학"],
  ["010950", "S-Oil"],
  ["035420", "NAVER"],
  ["069620", "대웅제약"],
  ["103140", "풍산"],
  ["298540", "더네이쳐홀딩스"],
  ["477850", "이수스페셜티케미컬"],
];

function entryOf(id: string, name: string): UniverseEntry {
  const kr = /^\d{6}$/.test(id);
  return {
    canonical: id,
    displayName: name,
    country: kr ? "KR" : "US",
    ...(kr ? { naverCode: id } : { symbol: id }),
    lastPublishedAt: "2026-07-29",
  };
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

/** `"2/3"` → 11~20번 종목. 범위를 벗어나면 실행을 멈춘다(조용히 빈 배치를 돌지 않는다). */
function parseSlice(raw: string | undefined, total: number): { start: number; end: number; label: string } {
  if (!raw) return { start: 0, end: total, label: "전체" };
  const match = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) throw new Error(`--slice 형식이 "N/M" 이 아니다: ${raw}`);
  const index = Number(match[1]);
  const parts = Number(match[2]);
  if (index < 1 || index > parts) throw new Error(`--slice 범위 밖: ${raw}`);
  const size = Math.ceil(total / parts);
  return { start: (index - 1) * size, end: Math.min(index * size, total), label: `${index}/${parts}` };
}

/** 이전 배치의 진행 로그. 없으면 빈 배열 — 1번 배치는 이어받을 것이 없다. */
function readCarry(path: string | undefined): Row[] {
  if (!path || !existsSync(path)) return [];
  const rows: Row[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as Row);
    } catch {
      // 잘린 마지막 줄은 버린다 — 죽는 순간 append 가 끊겼을 수 있다.
    }
  }
  return rows;
}

interface Row {
  id: string;
  name: string;
  market: "KR" | "US";
  context: BusinessContext;
}

function badgeCounts(rows: readonly Row[]): Record<string, number> {
  const out: Record<string, number> = { 충분: 0, 보통: 0, 낮음: 0, 없음: 0 };
  for (const row of rows) out[row.context.badge] = (out[row.context.badge] ?? 0) + 1;
  return out;
}

function citedText(context: BusinessContext, sourceIds: readonly string[]): string {
  return context.cited_chunks
    .filter((chunk) => sourceIds.includes(chunk.source_id))
    .map((chunk) => chunk.text)
    .join(" / ")
    .replace(/\|/g, "\\|")
    .slice(0, 400);
}

function renderReport(rows: readonly Row[], status: RunStatus): string {
  const lines: string[] = [];
  const all = badgeCounts(rows);
  const kr = badgeCounts(rows.filter((row) => row.market === "KR"));
  const us = badgeCounts(rows.filter((row) => row.market === "US"));
  const slot1 = rows.filter((row) => row.context.slot1_revenue_source !== null).length;
  const slot2 = rows.filter((row) => row.context.slot2_dependency !== null).length;
  const slot3 = rows.filter((row) => row.context.slot3_dependency_state !== null).length;

  lines.push("# 사업 실체 골든셋 30종목 (WO-SUB-03 §8)");
  lines.push("");
  if (status !== "complete") {
    lines.push(`> 🚧 **미완주 — ${rows.length}/${GOLDEN.length} 종목까지의 중간 상태다(\`status: ${status}\`).**`);
    lines.push("> 실행이 끝나기 전 스냅샷이므로 채움률·분포를 성적으로 인용하지 않는다.");
    if (status === "quota_exhausted") {
      lines.push("> **중단 사유는 시간이 아니라 일일 LLM 토큰 한도(TPD) 소진이다.**");
      lines.push("> 같은 날 안에서는 배치를 더 쪼개도 합계 한도가 같아 소용이 없다 — **날짜를 나눠** 재개한다.");
    } else {
      lines.push("> 이 파일이 이 문구를 달고 있으면, 실행이 타임아웃·취소·실패로 중단된 것이다.");
    }
    lines.push("");
  }
  lines.push(`> ⚠️ **이 표는 \`입력 ${SECTION_PROMPT_CHARS.toLocaleString("en-US")}자 조건 하 결과\`다 — AC#1 충족 판정에 쓰지 않는다.**`);
  lines.push("> 입력 크기가 품질 근거로 확정되기 전(WO-SUB-03.5 PART C-1)의 측정이라,");
  lines.push("> 여기서 통과율이 높게 나와도 \"사업 실체 합성이 잘 된다\"가 아니라");
  lines.push("> \"잘린 입력으로도 검증기를 통과하는 문장이 나온다\"로만 읽는다.");
  lines.push("> **AC#1 은 C-1 로 확정된 입력 크기에서 재실행한 결과로만 판정한다.**");
  lines.push("");
  lines.push("> **사람 검증용 표다.** 생성 문장과 그 문장이 인용한 청크 원문을 나란히 놓았다.");
  lines.push("> `사람 판정` 칸은 비어 있다 — 자동 검증기 판정으로 사람 판정을 대체하지 않는다(§10).");
  lines.push("> 완료 조건 1: 슬롯 1·2 가 사람 검증에서 \"근거 있음\"으로 판정되는 비율 ≥ 90%.");
  lines.push("");
  lines.push("## 1. 슬롯 채움률 · 배지 분포");
  lines.push("");
  lines.push("| 구분 | n | 슬롯1 | 슬롯2 | 슬롯3 | 충분 | 보통 | 낮음 | 없음 |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const [label, subset, counts] of [
    ["전체", rows, all],
    ["US(공시)", rows.filter((row) => row.market === "US"), us],
    ["KR(벤더요약)", rows.filter((row) => row.market === "KR"), kr],
  ] as const) {
    const s1 = subset.filter((row) => row.context.slot1_revenue_source !== null).length;
    const s2 = subset.filter((row) => row.context.slot2_dependency !== null).length;
    const s3 = subset.filter((row) => row.context.slot3_dependency_state !== null).length;
    lines.push(
      `| ${label} | ${subset.length} | ${s1} | ${s2} | ${s3} | ${counts.충분 ?? 0} | ${counts.보통 ?? 0} | ${counts.낮음 ?? 0} | ${counts.없음 ?? 0} |`
    );
  }
  lines.push("");
  lines.push(`- 슬롯 1 채움 ${slot1}/${rows.length} · 슬롯 2 ${slot2}/${rows.length} · 슬롯 3 ${slot3}/${rows.length}`);
  lines.push("");
  lines.push("## 2. 사람 검증 표 — 슬롯 1 (어디서 돈을 버는가)");
  lines.push("");
  lines.push("| 종목 | 시장 | 생성 문장 | 근거 청크 원문(인용) | 소스 종류 | 사람 판정 |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rows) {
    const slot = row.context.slot1_revenue_source;
    if (!slot) continue;
    lines.push(
      `| ${row.name} | ${row.market} | ${slot.text} | ${citedText(row.context, slot.source_ids)} | ${slot.kind} | |`
    );
  }
  lines.push("");
  lines.push("## 3. 사람 검증 표 — 슬롯 2 (무엇에 걸려 있는가)");
  lines.push("");
  lines.push("| 종목 | 시장 | 생성 문장 | 근거 청크 원문(인용) | 소스 종류 | 사람 판정 |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rows) {
    const slot = row.context.slot2_dependency;
    if (!slot) continue;
    lines.push(
      `| ${row.name} | ${row.market} | ${slot.text} | ${citedText(row.context, slot.source_ids)} | ${slot.kind} | |`
    );
  }
  lines.push("");
  lines.push("## 4. 슬롯 3 (그 대상은 지금 어떤 상태인가)");
  lines.push("");
  const withSlot3 = rows.filter((row) => row.context.slot3_dependency_state !== null);
  if (withSlot3.length === 0) lines.push("없음.");
  else {
    lines.push("| 종목 | 변수 | 문장 | 출처 |");
    lines.push("|---|---|---|---|");
    for (const row of withSlot3) {
      const slot3 = row.context.slot3_dependency_state!;
      lines.push(`| ${row.name} | \`${slot3.variable}\` | ${slot3.text} | ${slot3.source} |`);
    }
  }
  lines.push("");
  lines.push("## 5. 실패·폐기 사유");
  lines.push("");
  lines.push("| 종목 | 시장 | 배지 | 사유 |");
  lines.push("|---|---|---|---|");
  for (const row of rows) {
    if (row.context.errors.length === 0 && row.context.badge === "충분") continue;
    const reasons = [...row.context.errors];
    if (row.context.insufficient_reason) reasons.push(`모델 사유: ${row.context.insufficient_reason}`);
    lines.push(`| ${row.name} | ${row.market} | ${row.context.badge} | ${reasons.join(" · ").replace(/\|/g, "\\|") || "—"} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * `quota_exhausted` 는 `partial` 과 **원인이 다르다.**
 *
 * partial 은 "시간이 모자랐다"로 읽혀 배치를 더 쪼개는 대응으로 이어진다. 그런데 실측
 * (run 30740841495)에서 3배치가 5/30 에 그친 원인은 시간이 아니라 **일일 토큰 한도**였고,
 * 같은 날 안에서는 배치를 아무리 쪼개도 합계 한도가 같아 소용이 없다(날짜를 나눠야 한다).
 * 두 상태를 한 이름으로 저장하면 다음 사람이 같은 자리에서 또 오진한다.
 */
type RunStatus = "running" | "partial" | "complete" | "quota_exhausted";

/**
 * 증분 저장기. 종목 하나가 끝날 때마다 호출된다.
 *
 * 전량 재작성이 비싸 보이지만 30행이라 무시할 수 있고, 대신 **어느 시점에 죽어도 파일이 정합**이다.
 * JSONL 은 재작성 없이 append 만 하므로 전량 재작성이 도중에 끊겨도 원본은 남는다.
 */
function makeWriter(
  outDir: string | undefined,
  startedAt: string,
  variableFailures: () => readonly string[],
  carried: readonly Row[]
) {
  if (!outDir) return { save: () => {}, jsonl: undefined };
  mkdirSync(outDir, { recursive: true });
  const rawPath = join(outDir, "golden30_raw.json");
  const reportPath = join(outDir, "EVAL_golden30.md");
  const jsonlPath = join(outDir, "golden30_progress.jsonl");
  // 낡은 진행 로그는 지운다 — 지난 실행의 행이 이번 실행 결과에 섞이면 안 된다.
  // 이어받은 행은 그 자리에 **다시 써서** 이 배치의 산출물도 누적본이 되게 한다.
  rmSync(jsonlPath, { force: true });
  for (const row of carried) appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`);

  const save = (rows: readonly Row[], status: RunStatus): void => {
    writeFileSync(
      rawPath,
      JSON.stringify(
        {
          status,
          startedAt,
          generatedAt: new Date().toISOString(),
          completed: rows.length,
          planned: GOLDEN.length,
          // 페이싱 실측 — 감속이 있었다면 완주 시간이 길어진 이유가 여기 있다(조용한 감속 금지).
          pacing: pacingReport(),
          inputChars: SECTION_PROMPT_CHARS,
          variableFailures: variableFailures(),
          rows,
        },
        null,
        2
      )
    );
    writeFileSync(reportPath, renderReport(rows, status));
  };

  // 첫 종목 전에 죽어도 "이번 실행은 이어받은 N행"이 남는다. 커밋본이 결과로 둔갑하지 않는다.
  save(carried, carried.length >= GOLDEN.length ? "complete" : "running");
  return {
    save,
    jsonl: (row: Row) => appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`),
  };
}

async function main(): Promise<void> {
  const outDir = flag("--out");
  const startedAt = new Date().toISOString();
  const slice = parseSlice(flag("--slice"), GOLDEN.length);
  // 이어받은 행 중 이번 배치가 다시 도는 종목은 새 결과로 덮는다(중복 행 금지).
  const targets = GOLDEN.slice(slice.start, slice.end);
  const targetIds = new Set(targets.map(([id]) => id));
  const carried = readCarry(flag("--carry")).filter((row) => !targetIds.has(row.id));
  console.log(`[golden30] 배치 ${slice.label} — ${targets.length}종목(${slice.start + 1}~${slice.end}) · 이어받음 ${carried.length}행`);

  let failures: readonly string[] = [];
  const writer = makeWriter(outDir, startedAt, () => failures, carried);

  console.log("[golden30] 의존 변수 관측값 수집…");
  const values = await fetchVariableObservations();
  failures = values.failed;
  console.log(`  변수 ${Object.keys(values.observations).length}개 확보, 실패 ${values.failed.length}개 ${values.failed.join(",")}`);

  const rows: Row[] = [...carried];
  for (const [index, [id, name]] of targets.entries()) {
    const context = await buildBusinessContext(entryOf(id, name), { observations: values.observations });
    const row: Row = { id, name, market: /^\d{6}$/.test(id) ? "KR" : "US", context };
    rows.push(row);
    // 종목마다 즉시 디스크로 — 다음 종목에서 죽어도 여기까지는 남는다.
    writer.jsonl?.(row);
    writer.save(rows, rows.length === GOLDEN.length ? "complete" : "partial");
    console.log(
      `  [${index + 1}/${targets.length} · 누적 ${rows.length}/${GOLDEN.length}] ${name.padEnd(22)} ${context.badge.padEnd(4)} s1=${context.slot1_revenue_source ? "O" : "-"} s2=${context.slot2_dependency ? "O" : "-"} s3=${context.slot3_dependency_state ? "O" : "-"} ${context.errors.length ? `err=${context.errors.length}` : ""}`
    );
    if (context.slot1_revenue_source) console.log(`        슬롯1: ${context.slot1_revenue_source.text}`);
    if (context.slot2_dependency) console.log(`        슬롯2: ${context.slot2_dependency.text}`);
    // 일일 한도가 소진되면 남은 종목은 전부 빈 결과가 된다 — 러너 시간을 태우지 않고 접는다.
    if (quotaExhausted()) {
      const { totalTokensUsed, billedCalls } = pacingReport();
      const perStock = rows.length > 0 ? Math.round(totalTokensUsed / rows.length) : 0;
      console.log(`\n[golden30] 일일 LLM 쿼터 소진 — ${index + 1}/${targets.length} 에서 중단한다.`);
      console.log("           남은 종목은 오늘 안에 못 돈다. 날짜를 나눠 재개하라(배치를 더 쪼개도 소용없다).");
      // 다음 계획을 추정으로 세우지 않도록 실측치를 남긴다.
      console.log(`           이 배치 실측: ${totalTokensUsed.toLocaleString("en-US")}토큰 / ${billedCalls}콜 / ${rows.length}종목 = 종목당 ~${perStock.toLocaleString("en-US")}토큰`);
      break;
    }
  }

  const counts = badgeCounts(rows);
  console.log("\n=== 배지 분포 ===", JSON.stringify(counts));
  console.log(
    ` 슬롯1 ${rows.filter((r) => r.context.slot1_revenue_source).length}/${rows.length} · 슬롯2 ${rows.filter((r) => r.context.slot2_dependency).length}/${rows.length} · 슬롯3 ${rows.filter((r) => r.context.slot3_dependency_state).length}/${rows.length}`
  );

  // 배치 실행에서는 마지막 배치만 30행을 채운다 — 중간 배치를 complete 로 쓰면 안 된다.
  // 쿼터로 멈춘 것은 `partial`(시간 부족)과 구분해서 남긴다 — 대응이 다르다.
  writer.save(rows, rows.length >= GOLDEN.length ? "complete" : quotaExhausted() ? "quota_exhausted" : "partial");
  if (outDir) console.log(`\n[golden30] 저장 — ${join(outDir, "EVAL_golden30.md")}`);
}

main().catch((error) => {
  console.error("[golden30] 실패", error);
  process.exit(1);
});

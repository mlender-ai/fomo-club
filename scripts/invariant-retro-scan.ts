/**
 * WO-SUB-03.5 PART A-2 — 소급 불변식 스캔.
 *
 * 지시서: "활성화만 하고 끝내지 않는다. **이미 생성된 산출물에 대해 소급 실행한다.**
 * 위반이 나오면 그것이 이 WO 의 실제 작업 목록이다. 위반 0건이면 그것도 결과로 기록한다."
 *
 * 대상: 저장된 팩트시트 전량 + 사업 실체 텍스트 전량 + 아키타입 분류 결과 전량.
 * 활성 불변식만 검사한다(INV-06·11 은 02R 유예 — 유예를 검사하면 유예의 의미가 사라진다).
 *
 * 실행: npx tsx --env-file=.env scripts/invariant-retro-scan.ts [--out docs/quality]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeInvariants,
  bannedWordHits,
  classifyArchetype,
  projectForRender,
  type BusinessContext,
  type FactSheet,
} from "@fomo/core";
import { readAllFactSheets } from "../apps/web/lib/fundamentals/repository";
import { readAllBusinessContexts } from "../apps/web/lib/business-context/repository";

/** 위반 1건. 샘플은 불변식별 최대 10건까지 기록한다(지시서 A-2). */
interface Violation {
  invariant: string;
  subject: string;
  detail: string;
}

const SAMPLE_LIMIT = 10;

/**
 * INV-08·INV-12 를 렌더 투영으로 검사한다.
 *
 * 투영이 통과시킨 값 중 출처·시각이 없는 것이 있으면 INV-08 위반이고,
 * `missing_fields` 에 있는 경로가 값으로 통과하면 INV-12 위반이다. 투영이 구조적으로
 * 막고 있으므로 **정상이라면 0건이어야 한다** — 0 이 아니면 투영에 구멍이 있다는 뜻이다.
 */
function scanFactSheet(sheet: FactSheet): Violation[] {
  const out: Violation[] = [];
  const paths = [
    ...Object.keys(sheet.field_sources ?? {}),
    ...(sheet.missing_fields ?? []),
    "valuation.per_ttm",
    "valuation.pbr",
    "valuation.psr_ttm",
    "margin.operating_ttm",
    "growth.revenue_yoy",
    "fiscal.ttm.revenue",
    "fiscal.ttm.eps_diluted",
  ];
  const { values } = projectForRender(sheet, [...new Set(paths)]);
  const missing = new Set(sheet.missing_fields ?? []);
  for (const value of values) {
    if (!value.source || !value.as_of) {
      out.push({ invariant: "INV-08", subject: sheet.canonical, detail: `${value.path} 출처·시각 없이 투영됨` });
    }
    if (missing.has(value.path)) {
      out.push({ invariant: "INV-12", subject: sheet.canonical, detail: `${value.path} 는 missing_fields 인데 투영됨` });
    }
  }
  // 결측 정직성의 반대편: 값이 있는데 missing_fields 에도 있는 모순.
  for (const path of missing) {
    const provenance = sheet.field_sources?.[path];
    if (provenance) {
      out.push({
        invariant: "INV-12",
        subject: sheet.canonical,
        detail: `${path} 가 missing_fields 이면서 field_sources 에도 있다 — 결측 판정이 모순`,
      });
    }
  }
  return out;
}

/** INV-09 — 생성 문장 전량. 배치가 만든 텍스트만 본다(기존 피드 카피는 대상이 아니다). */
function scanBusinessContext(context: BusinessContext): Violation[] {
  const out: Violation[] = [];
  const sentences: Array<[string, string | null | undefined]> = [
    ["slot1", context.slot1_revenue_source?.text],
    ["slot2", context.slot2_dependency?.text],
    ["slot3", context.slot3_dependency_state?.text],
    ["insufficient_reason", context.insufficient_reason],
  ];
  for (const [slot, text] of sentences) {
    for (const hit of bannedWordHits(text)) {
      out.push({
        invariant: "INV-09",
        subject: `${context.canonical}/${slot}`,
        detail: `${hit.rule}: "${hit.matched}" — ${text}`,
      });
    }
  }
  return out;
}

/**
 * 아키타입 결과 — 분류 자체가 텍스트를 만들지는 않지만, 경고문·표시 지표가 딸려 나온다.
 * 경고문은 독트린에서 오므로 레지스트리 테스트가 이미 잠갔고, 여기서는 **분류가 재현되는지**를 본다
 * (저장된 팩트시트로 다시 돌려 같은 코드가 나오는지 — 결정론).
 */
function scanArchetype(sheet: FactSheet): Violation[] {
  const first = classifyArchetype(sheet).code;
  const second = classifyArchetype(sheet).code;
  if (first !== second) {
    return [{ invariant: "결정론", subject: sheet.canonical, detail: `같은 입력에 다른 분류: ${first} ≠ ${second}` }];
  }
  return [];
}

function render(input: {
  factsheets: number;
  contexts: number;
  violations: Violation[];
  archetypeCounts: Record<string, number>;
}): string {
  const { factsheets, contexts, violations } = input;
  const byInvariant = new Map<string, Violation[]>();
  for (const violation of violations) {
    const bucket = byInvariant.get(violation.invariant) ?? [];
    bucket.push(violation);
    byInvariant.set(violation.invariant, bucket);
  }

  const lines: string[] = [];
  lines.push("# 소급 불변식 스캔 (WO-SUB-03.5 PART A-2)");
  lines.push("");
  lines.push("> 활성 불변식을 **이미 생성된 산출물 전량**에 소급 실행한 결과다.");
  lines.push("> 위반이 나오면 그것이 작업 목록이고, 0건이면 0건인 것도 결과로 기록한다(지시서 A-2).");
  lines.push("> `INV-06`·`INV-11` 은 02R 유예 대상이라 검사하지 않는다 — 유예를 검사하면 유예의 의미가 사라진다.");
  lines.push("");
  lines.push("## 1. 대상");
  lines.push("");
  lines.push("| 산출물 | 건수 |");
  lines.push("|---|---|");
  lines.push(`| 팩트시트 | ${factsheets} |`);
  lines.push(`| 사업 실체 | ${contexts} |`);
  lines.push(`| 아키타입 분류(팩트시트에서 재계산) | ${factsheets} |`);
  lines.push("");
  lines.push("## 2. 불변식별 위반 건수");
  lines.push("");
  lines.push("| 불변식 | 내용 | 위반 |");
  lines.push("|---|---|---|");
  for (const entry of activeInvariants()) {
    lines.push(`| \`${entry.id}\` | ${entry.title} | ${byInvariant.get(entry.id)?.length ?? 0} |`);
  }
  const determinism = byInvariant.get("결정론")?.length ?? 0;
  lines.push(`| (결정론) | 같은 입력 → 같은 분류 | ${determinism} |`);
  lines.push("");
  lines.push("### INV-14 는 파일 스캔이라 여기서 세지 않는다");
  lines.push("");
  lines.push("렌더 경로 임포트 금지는 산출물이 아니라 **소스 트리**에 대한 규칙이다.");
  lines.push("CI 의 `packages/fomo-core/__tests__/invariant-14-render-path.test.ts` 와");
  lines.push("`apps/web/__tests__/lib/*-request-path-guard.test.ts` 가 PR 게이트에서 매번 실행된다.");
  lines.push("");
  lines.push("## 3. 위반 샘플");
  lines.push("");
  if (violations.length === 0) {
    lines.push("**0건.** 활성 불변식 위반이 없다.");
    lines.push("");
    lines.push("INV-08·INV-12 가 0건인 것은 우연이 아니다 — `projectForRender()` 가 출처 없는 값과");
    lines.push("`missing_fields` 경로를 **통과시키지 않으므로** 위반이 만들어질 경로가 없다. 이 스캔은");
    lines.push("그 구조가 실제 데이터에서도 성립하는지 확인하는 것이고, 성립했다.");
  } else {
    for (const [invariant, bucket] of byInvariant) {
      lines.push(`### ${invariant} — ${bucket.length}건`);
      lines.push("");
      lines.push("| 대상 | 내용 |");
      lines.push("|---|---|");
      for (const violation of bucket.slice(0, SAMPLE_LIMIT)) {
        lines.push(`| ${violation.subject} | ${violation.detail.replace(/\|/g, "\\|").slice(0, 200)} |`);
      }
      if (bucket.length > SAMPLE_LIMIT) lines.push("");
      if (bucket.length > SAMPLE_LIMIT) lines.push(`(샘플 ${SAMPLE_LIMIT}건만 표시 — 전체 ${bucket.length}건)`);
      lines.push("");
    }
  }
  lines.push("");
  lines.push("## 4. 아키타입 분포 (참고)");
  lines.push("");
  lines.push("| 유형 | 건수 |");
  lines.push("|---|---|");
  for (const [code, count] of Object.entries(input.archetypeCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${code}\` | ${count} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf("--out");
  const outDir = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

  console.log("[retro] 팩트시트 읽는 중…");
  const factsheets = await readAllFactSheets();
  console.log(`  ${factsheets.length}건`);
  console.log("[retro] 사업 실체 읽는 중…");
  const contexts = await readAllBusinessContexts();
  console.log(`  ${contexts.length}건`);

  const violations: Violation[] = [];
  const archetypeCounts: Record<string, number> = {};
  for (const sheet of factsheets) {
    violations.push(...scanFactSheet(sheet), ...scanArchetype(sheet));
    const code = classifyArchetype(sheet).code;
    archetypeCounts[code] = (archetypeCounts[code] ?? 0) + 1;
  }
  for (const context of contexts) violations.push(...scanBusinessContext(context));

  console.log(`\n=== 위반 ${violations.length}건 ===`);
  for (const entry of activeInvariants()) {
    const count = violations.filter((violation) => violation.invariant === entry.id).length;
    console.log(` ${entry.id} ${entry.title}: ${count}`);
  }
  for (const violation of violations.slice(0, 20)) console.log(`  ⚠︎ ${violation.invariant} ${violation.subject}: ${violation.detail.slice(0, 160)}`);

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const report = render({ factsheets: factsheets.length, contexts: contexts.length, violations, archetypeCounts });
    writeFileSync(join(outDir, "RETRO_invariant_scan.md"), report);
    writeFileSync(
      join(outDir, "retro_invariant_scan_raw.json"),
      JSON.stringify({ factsheets: factsheets.length, contexts: contexts.length, violations, archetypeCounts }, null, 2)
    );
    console.log(`\n[retro] 저장 — ${join(outDir, "RETRO_invariant_scan.md")}`);
  }
}

main().catch((error) => {
  console.error("[retro] 실패", error);
  process.exit(1);
});

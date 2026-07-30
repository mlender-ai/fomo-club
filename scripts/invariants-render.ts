/**
 * `docs/quality/INVARIANTS.md` 렌더 — 정본은 `packages/fomo-core/src/invariants/registry.json`.
 *
 * 독트린 렌더와 같은 방식이다. 문서를 손으로 쓰면 코드와 갈라지고, 갈라지면
 * "게이트가 있다" 는 착각이 남는다. 동기화 테스트가 어긋남을 잡는다.
 *
 * 실행: npx tsx scripts/invariants-render.ts [--check]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INVARIANT_REGISTRY, type InvariantEntry } from "@fomo/core";

export const OUT_PATH = join("docs", "quality", "INVARIANTS.md");

function row(entry: InvariantEntry): string {
  const mark = entry.status === "active" ? "✅ 활성" : "⏸ 유예";
  return `| \`${entry.id}\` | ${entry.title} | ${entry.precondition} | ${mark} |`;
}

export function renderInvariants(): string {
  const lines: string[] = [];
  const registry = INVARIANT_REGISTRY;
  lines.push("# 품질 불변식 (WO-SUB-09)");
  lines.push("");
  lines.push("> **생성 문서다. 직접 고치지 말 것.**");
  lines.push("> 정본: `packages/fomo-core/src/invariants/registry.json`");
  lines.push("> 생성: `npx tsx scripts/invariants-render.ts`");
  lines.push("");
  lines.push(`레지스트리 버전: \`${registry.registry_version}\``);
  lines.push("");
  lines.push(registry.note);
  lines.push("");
  lines.push("## 1. 현황");
  lines.push("");
  lines.push("| ID | 내용 | 선행 조건 | 상태 |");
  lines.push("|---|---|---|---|");
  for (const entry of registry.invariants) lines.push(row(entry));
  lines.push("");
  const active = registry.invariants.filter((entry) => entry.status === "active");
  const deferred = registry.invariants.filter((entry) => entry.status === "deferred");
  lines.push(`활성 ${active.length}종 · 유예 ${deferred.length}종.`);
  lines.push("");
  lines.push("## 2. 불변식별 상세");
  lines.push("");
  for (const entry of registry.invariants) {
    lines.push(`### ${entry.id} — ${entry.title}`);
    lines.push("");
    lines.push(entry.statement);
    lines.push("");
    lines.push(`- 상태: **${entry.status === "active" ? "활성" : "유예"}** · 선행 조건: ${entry.precondition}`);
    lines.push(`- 정본: \`${entry.source_of_truth}\``);
    if (entry.defer_reason) lines.push(`- 유예 사유: ${entry.defer_reason}`);
    if (entry.scope_note) lines.push(`- 범위: ${entry.scope_note}`);
    lines.push("");
  }
  lines.push("## 3. 유예의 의미");
  lines.push("");
  lines.push("`유예` 는 **방치가 아니다.** 사유가 적혀 있고, 그 사유가 해소되는 WO 가 지정돼 있다.");
  lines.push("사유 없는 유예는 이 표에 들어올 수 없다(레지스트리 스키마가 막는다).");
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const rendered = renderInvariants();
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT_PATH, "utf8") === rendered) {
      console.log("[invariants] 최신 상태");
      return;
    }
    console.error("[invariants] 문서가 정본과 어긋난다 — npx tsx scripts/invariants-render.ts 실행할 것");
    process.exit(1);
  }
  mkdirSync(join("docs", "quality"), { recursive: true });
  writeFileSync(OUT_PATH, rendered);
  console.log(`[invariants] 생성 — ${OUT_PATH}`);
}

if (process.argv[1]?.includes("invariants-render")) main();

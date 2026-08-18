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
  lines.push("# 품질 불변식 (WO-SUB-09 + CTX-07)");
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
    if (entry.misbelief) lines.push(`- **어기면 잘못 믿게 되는 것**: ${entry.misbelief}`);
    if (entry.falsification) lines.push(`- 역검증: ${entry.falsification}`);
    if (entry.defer_reason) lines.push(`- 유예 사유: ${entry.defer_reason}`);
    if (entry.scope_note) lines.push(`- 범위: ${entry.scope_note}`);
    lines.push("");
  }
  lines.push("## 3. 역검증 — 왜 필수인가 (CTX-07 §3)");
  lines.push("");
  lines.push("> **테스트가 통과하는데 실제로는 아무것도 검사하지 않는 경우가 있다.**");
  lines.push("");
  lines.push("이 저장소에서 실제로 두 번 일어났다. 가격 무효선이 발행 시점 값끼리 비교하면서 타입·테스트를");
  lines.push("전부 통과했고, 소급 스캔은 위반을 찾고도 `exit 0` 이었다. 통과 케이스만 쌓으면 규칙을 지워도");
  lines.push("초록이 유지된다 — **검사가 약한 건지 구조가 튼튼한 건지 구분되지 않는다.**");
  lines.push("");
  lines.push("그래서 활성 불변식은 전부 `falsification`(의도적 위반 케이스)을 갖고,");
  lines.push("`scripts/__tests__/ctx07-falsification.test.ts` 가 그것을 **실행**한다. 케이스는 짝으로 돈다:");
  lines.push("");
  lines.push("| 축 | 기대 | 왜 |");
  lines.push("|---|---|---|");
  lines.push("| `violating` 위반 주입 | 반드시 **적발** | 게이트가 실제로 막는지 |");
  lines.push("| `clean` 정상 입력 | 반드시 **통과** | **항상 실패하는 검사기**를 걸러낸다 — 그건 게이트가 아니라 고장이다 |");
  lines.push("");
  lines.push("활성으로 바꾸면서 `falsification` 을 안 쓰면 스키마 테스트가 CI 를 떨어뜨린다.");
  lines.push("**역검증을 통과한 뒤에만 \"위반 0건\" 이 성과다.**");
  lines.push("");
  lines.push("## 4. 유예의 의미");
  lines.push("");
  lines.push("`유예` 는 **방치가 아니다.** 사유가 적혀 있고, 그 사유가 해소되는 WO 가 지정돼 있다.");
  lines.push("사유 없는 유예는 이 표에 들어올 수 없다(레지스트리 스키마가 막는다).");
  lines.push("");
  lines.push("유예 판정의 기준은 하나다 — **검사할 산출물이 실재하는가.** 산출물이 0건인 게이트는");
  lines.push("초록이어도 아무것도 지키지 않고, 상시 초록인 게이트는 아무도 보지 않게 된다.");
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

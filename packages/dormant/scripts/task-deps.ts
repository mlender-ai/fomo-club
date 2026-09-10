/**
 * Task 의존성 게이트 (충돌 방지 — 순차 구현).
 *
 * 병렬 구현의 충돌 교훈: 의존성 있는 task 를 동시에 구현하면 각자 main 에서 분기해
 * 서로 모르는 설계를 만든다(중복 모델 등). → 선행 task 가 *머지(close)* 되기 전엔 구현을 막는다.
 *
 * 이슈 제목 `[P2 3/6 · 직군] ...` 에서 seq, 본문 `- **선행 단계**: 1단계, 2단계` 에서 deps 를 파싱하고,
 * 형제 project:<id> task 이슈들의 상태로 *미충족 선행*을 계산한다. 순수 함수 + vitest.
 */

import { readFileSync } from "node:fs";

export interface SiblingTask {
  number: number;
  title: string;
  /** "OPEN" | "CLOSED" */
  state: string;
}

/** 제목 `[P2 3/6 · 백엔드] ...` → seq(3). 못 찾으면 null. */
export function parseSeq(title: string): number | null {
  const m = (title || "").match(/\[[^\]]*?\s(\d+)\/\d+\s*·/);
  return m ? Number(m[1]) : null;
}

/** 본문의 `선행 단계: 1단계, 2단계` → [1,2]. "없음" 이면 []. */
export function parseDeps(body: string): number[] {
  if (!body) return [];
  const line = body.split("\n").find((l) => l.includes("선행 단계"));
  if (!line || /없음/.test(line)) return [];
  const out = new Set<number>();
  for (const m of line.matchAll(/(\d+)\s*단계/g)) out.add(Number(m[1]));
  return Array.from(out);
}

/**
 * 미충족 선행 task = deps(seq) 에 해당하는 형제 이슈 중 아직 OPEN(머지/완료 안 됨) 인 것.
 * 자기 자신은 제외. seq 를 못 읽는 형제는 무시.
 */
export function unmetPrereqs(
  selfNumber: number,
  deps: number[],
  siblings: SiblingTask[],
): SiblingTask[] {
  if (!deps.length) return [];
  const depSet = new Set(deps);
  return siblings.filter((s) => {
    if (s.number === selfNumber) return false;
    const seq = parseSeq(s.title);
    return seq !== null && depSet.has(seq) && s.state.toUpperCase() === "OPEN";
  });
}

/** 게이트 판정: 구현해도 되는가 + 사람이 읽을 사유. */
export interface GateResult {
  ok: boolean;
  reason: string;
}

export function gate(
  selfNumber: number,
  selfTitle: string,
  selfBody: string,
  siblings: SiblingTask[],
): GateResult {
  const deps = parseDeps(selfBody);
  const unmet = unmetPrereqs(selfNumber, deps, siblings);
  if (unmet.length === 0) {
    return { ok: true, reason: deps.length ? `선행 ${deps.join(",")}단계 모두 완료(머지)됨 — 구현 가능.` : "선행 없음 — 구현 가능." };
  }
  const list = unmet.map((u) => `#${u.number}(${parseSeq(u.title)}단계)`).join(", ");
  return {
    ok: false,
    reason: `선행 task 미완료: ${list}. 선행 PR을 먼저 머지한 뒤 구현하세요(충돌 방지 — 순차 구현).`,
  };
}

// ─────────────────────────────────────────────────────────────
function main(): void {
  const argv = process.argv;
  if (argv[2] !== "gate") {
    console.error("usage: tsx scripts/task-deps.ts gate <self_number> <self.json> <siblings.json>");
    process.exit(1);
  }
  const selfNumber = Number(argv[3]);
  const self = JSON.parse(readFileSync(argv[4]!, "utf8")) as { title: string; body: string };
  const siblings = JSON.parse(readFileSync(argv[5]!, "utf8")) as SiblingTask[];
  const r = gate(selfNumber, self.title, self.body, siblings);
  process.stdout.write(JSON.stringify(r));
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("task-deps")) {
  main();
}

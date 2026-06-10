/**
 * 출처 있는 지식 검색 재주입 (에이전트 두뇌 K2).
 *
 * K1 이 적층한 knowledge/distilled.md 에서 쿼리(프로젝트 제목·범위·제안 텍스트)와 관련된
 * 교훈을 키워드 겹침으로 골라, 출처와 함께 프롬프트 주입 블록으로 렌더한다.
 * "이미 #470에서 결정 — 재제안·중복 금지 [출처]" 를 에이전트에게 보여 환각·중복을 막는다.
 *
 * 외부 의존/임베딩 없이 결정론적(키워드 겹침). 순수 export 함수 + main() CLI.
 */

import { readFileSync } from "node:fs";
import { parseDistilled, type Lesson } from "./knowledge-base";

const STOP = new Set([
  "the", "and", "for", "with", "feat", "fix", "chore", "council", "fomo", "p1", "p2", "p3", "p4",
  "및", "또는", "그리고", "에서", "으로", "추가", "구현", "개선", "제안", "기능", "시스템",
]);

/** 한글/영문/숫자 토큰화 — 2자 이상, 스톱워드 제외, 소문자. */
export function tokenize(s: string): string[] {
  const raw = (s || "").toLowerCase().match(/[a-z0-9]+|[가-힣]{2,}/g) ?? [];
  return raw.filter((t) => t.length >= 2 && !STOP.has(t));
}

export interface Scored {
  lesson: Lesson;
  score: number;
}

/** 쿼리와 교훈의 키워드 겹침 점수로 상위 N 선택(score>0). */
export function retrieve(query: string, lessons: Lesson[], topN = 6): Scored[] {
  const q = new Set(tokenize(query));
  if (q.size === 0) return [];
  const scored: Scored[] = [];
  for (const l of lessons) {
    const lt = new Set(tokenize(l.text));
    let s = 0;
    for (const t of lt) if (q.has(t)) s += 1;
    if (s > 0) scored.push({ lesson: l, score: s });
  }
  scored.sort((a, b) => b.score - a.score || (a.lesson.date < b.lesson.date ? 1 : -1));
  return scored.slice(0, topN);
}

/** 프롬프트 주입 블록. 관련 지식 없으면 안내. */
export function renderInjection(scored: Scored[]): string {
  if (!scored.length) {
    return "## 🧠 관련 과거 지식\n(관련된 과거 출고·결정 없음 — 신규 영역)";
  }
  const lines = scored.map((s) => `- ${s.lesson.text}${s.lesson.ref ? ` [출처: ${s.lesson.ref}]` : ""}`);
  return [
    "## 🧠 관련 과거 지식 (출처) — 이미 출고/결정된 것: 재제안·중복 설계 금지",
    "> 아래와 겹치는 기능은 *이미 있다*. 그 위에 무엇을 새로 더하는지 명확히 하라.",
    ...lines,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
function main(): void {
  const argv = process.argv;
  if (argv[2] !== "retrieve") {
    console.error("usage: tsx scripts/knowledge-retrieve.ts retrieve <distilled.md> <query...>");
    process.exit(1);
  }
  let md = "";
  try {
    md = readFileSync(argv[3] ?? "", "utf8");
  } catch {
    md = "";
  }
  const query = argv.slice(4).join(" ");
  process.stdout.write(renderInjection(retrieve(query, parseDistilled(md))));
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("knowledge-retrieve")) {
  main();
}

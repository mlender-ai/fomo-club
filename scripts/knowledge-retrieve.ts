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

/**
 * 도메인 동의어 — 키워드 완전일치만으로는 "알림"과 "푸시 notification" 을 못 잇는다.
 * 각 그룹의 토큰은 검색 시 서로로 확장된다(결정론적, 임베딩 무의존, 소규모 코퍼스에 충분).
 */
const SYNONYMS: string[][] = [
  ["알림", "푸시", "notification", "push"],
  ["캘린더", "calendar", "달력"],
  ["포인트", "리워드", "reward", "보상", "적립"],
  ["시뮬레이터", "시뮬레이션", "simulator", "모의"],
  ["커뮤니티", "피드", "feed", "레딧", "reddit", "네이버", "토론"],
  ["감정", "이모션", "emotion", "기분"],
  ["챌린지", "미션", "challenge", "퀘스트"],
  ["마스코트", "포모", "표정", "mascot"],
  ["인덱스", "지수", "index", "히트", "heat"],
  ["통계", "집계", "stats", "aggregate"],
  ["고래", "whale"],
];
const SYN_MAP: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const group of SYNONYMS) {
    const set = new Set(group);
    for (const t of group) m.set(t, set);
  }
  return m;
})();

/** 한글/영문/숫자 토큰화 — 2자 이상, 스톱워드 제외, 소문자. */
export function tokenize(s: string): string[] {
  const raw = (s || "").toLowerCase().match(/[a-z0-9]+|[가-힣]{2,}/g) ?? [];
  return raw.filter((t) => t.length >= 2 && !STOP.has(t));
}

/** 토큰 집합을 동의어로 확장. */
export function expand(tokens: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    const syn = SYN_MAP.get(t);
    if (syn) for (const s of syn) out.add(s);
  }
  return out;
}

export interface Scored {
  lesson: Lesson;
  score: number;
}

/** 일수 차이로 최신성 가중(0~오래될수록 감소). */
function recencyBoost(date: string, now: string): number {
  const d = Date.parse(date + "T00:00:00Z");
  const n = Date.parse((now || date) + "T00:00:00Z");
  if (!Number.isFinite(d) || !Number.isFinite(n)) return 0;
  const days = Math.max(0, (n - d) / 86400000);
  return days <= 7 ? 0.5 : days <= 30 ? 0.25 : 0; // 최근 1주 +0.5, 1달 +0.25
}

/**
 * 쿼리-교훈 키워드 겹침 + 동의어 확장 + 최신성/출처 가중으로 상위 N 선택.
 * now 미지정 시 가장 최신 교훈 날짜를 기준으로 한다(결정론 유지).
 */
export function retrieve(query: string, lessons: Lesson[], topN = 6, now?: string): Scored[] {
  const q = expand(tokenize(query));
  if (q.size === 0) return [];
  const ref = now ?? lessons.reduce((mx, l) => (l.date > mx ? l.date : mx), "");
  const scored: Scored[] = [];
  for (const l of lessons) {
    const lt = expand(tokenize(l.text));
    let overlap = 0;
    for (const t of lt) if (q.has(t)) overlap += 1;
    if (overlap > 0) {
      const score = overlap + recencyBoost(l.date, ref) + (l.ref ? 0.1 : 0); // 출처 있으면 미세 가중
      scored.push({ lesson: l, score });
    }
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

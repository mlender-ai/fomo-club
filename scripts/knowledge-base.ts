/**
 * 복리 지식 레이어 — "제2의 뇌" Brain Trinity (에이전트 두뇌 K1).
 *
 * 흩어진 기억(머지 PR·CEO 결정·제약 hit·outcome)을 raw → distilled(정제된 교훈) 로 적층한다.
 * distilled 는 K2(검색 재주입)가 읽어 "이미 구현됨/결정됨 — 재제안·중복 금지"를 출처와 함께 주입한다.
 * 매일 자동 누적(스크린샷의 daily 자동 생성·갱신). 순수 export 함수 + main() CLI.
 *
 * 핵심: distilled 는 *PR/이슈 번호(ref)* 로 멱등 누적 → 같은 사실이 중복 적재되지 않는다.
 */

import { readFileSync, writeFileSync } from "node:fs";

export type LessonKind = "shipped" | "decision" | "rule";

export interface Lesson {
  date: string;
  kind: LessonKind;
  text: string;
  /** 출처 — "PR#457" | "issue#470" | "" */
  ref: string;
}

export interface MergedPR {
  number: number;
  title: string;
}

function clean(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** 머지 PR → "구현됨" 교훈 (재구현 방지의 핵심 신호). [Auto] 접두사 제거. */
export function lessonsFromMergedPRs(prs: MergedPR[], date: string): Lesson[] {
  return prs
    .filter((p) => p && p.number > 0 && clean(p.title))
    .map((p) => ({
      date,
      kind: "shipped" as const,
      text: clean(p.title).replace(/^\[Auto\]\s*#?\d*\s*—?\s*/i, ""),
      ref: `PR#${p.number}`,
    }));
}

/** CEO 결정/규칙 텍스트 → decision 교훈. */
export function lessonsFromDecisions(decisions: string[], date: string, refs: string[] = []): Lesson[] {
  return decisions
    .map((d, i) => clean(d))
    .filter(Boolean)
    .map((text, i) => ({ date, kind: "decision" as const, text, ref: refs[i] ?? "" }));
}

export interface ConstraintRule {
  id: string;
  rule: string;
  createdAt?: string;
}

/**
 * Standing Constraints(active.json) → rule 교훈. CEO 확정 규칙은 가장 오래가는 결정이므로
 * 지식의 rule 층을 자동으로 채운다(지금까지 비어 있던 층). ref = constraint id, 멱등 누적.
 */
export function lessonsFromConstraints(constraints: ConstraintRule[], fallbackDate: string): Lesson[] {
  return (constraints || [])
    .filter((c) => c && c.id && clean(c.rule))
    .map((c) => ({
      date: c.createdAt || fallbackDate,
      kind: "rule" as const,
      text: clean(c.rule).slice(0, 180),
      ref: c.id,
    }));
}

/**
 * 기획문서(plan-doc) 본문의 "✅ CEO 결정" 섹션에서 결정 불릿을 추출.
 * 사람이 승인/수정하며 적은 결정("포인트 유료화 보류" 등)이 지식 decision 층으로 적층된다.
 * 섹션 헤더(## ✅ CEO 결정 …)부터 다음 헤더(##) 전까지의 "- " 불릿만, 마크업 정리.
 */
export function extractPlanDecisions(body: string): string[] {
  const lines = (body || "").split("\n");
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^#{2,3}\s*.*CEO\s*결정/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s/.test(line)) break; // 다음 섹션
    if (inSection) {
      const m = line.match(/^\s*-\s+(.*)$/);
      if (m) {
        const text = clean(m[1]!.replace(/\*\*/g, "").replace(/^[🚫✅⛔→>]+\s*/u, ""));
        if (text.length >= 6) out.push(text.slice(0, 180));
      }
    }
  }
  return out;
}

/**
 * 컴팩션 — 무한 누적 방지. rule/decision 은 전부 보존(가장 오래가는 지식),
 * shipped 만 최신순으로 maxShipped 개 유지. (오래된 출고는 코드/inventory 가 이미 진실)
 */
export function compactLessons(lessons: Lesson[], maxShipped = 300): Lesson[] {
  const keep = lessons.filter((l) => l.kind !== "shipped");
  const shipped = lessons
    .filter((l) => l.kind === "shipped")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, maxShipped);
  return [...keep, ...shipped];
}

const LINE_RE = /^- \[(\d{4}-\d{2}-\d{2})\]\s*\((shipped|decision|rule)\)\s*(.*?)(?:\s*\[출처:\s*([^\]]+)\])?\s*$/;

/** knowledge/distilled.md 파싱 → Lesson[]. */
export function parseDistilled(md: string): Lesson[] {
  const out: Lesson[] = [];
  for (const line of (md || "").split("\n")) {
    const m = line.match(LINE_RE);
    if (m) out.push({ date: m[1]!, kind: m[2] as LessonKind, text: clean(m[3]!), ref: (m[4] ?? "").trim() });
  }
  return out;
}

/**
 * 멱등 누적 — kind 별 중복 키. 신규만 추가.
 *  - shipped/rule: ref 1개 = 교훈 1개 (PR 번호·constraint id 가 유일키)
 *  - decision: 한 이슈(ref)에 결정이 여러 개 가능 → ref+text 로 판정 (같은 ref 붕괴 방지)
 */
export function mergeLessons(existing: Lesson[], incoming: Lesson[]): Lesson[] {
  const keyOf = (l: Lesson) => {
    const txt = l.text.toLowerCase();
    if (!l.ref) return `txt:${txt}`;
    if (l.kind === "decision") return `ref:${l.ref.toLowerCase()}|${txt}`;
    return `ref:${l.ref.toLowerCase()}`;
  };
  const seen = new Set(existing.map(keyOf));
  const merged = [...existing];
  for (const l of incoming) {
    const k = keyOf(l);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(l);
    }
  }
  return merged;
}

/** distilled.md 렌더 (날짜 내림차순). */
export function renderDistilled(lessons: Lesson[]): string {
  const sorted = [...lessons].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const lines = sorted.map(
    (l) => `- [${l.date}] (${l.kind}) ${l.text}${l.ref ? ` [출처: ${l.ref}]` : ""}`,
  );
  return [
    "# 🧠 정제된 지식 (distilled) — 에이전트 재주입용 단일 진실",
    "",
    "> 자동 누적. 이미 구현/결정된 사실 — 재제안·중복 설계 금지. K2 검색이 이 파일을 읽어 프롬프트에 출처와 함께 주입한다.",
    "",
    ...lines,
    "",
  ].join("\n");
}

/** 그날의 raw 적층 노트(daily). */
export function renderDailyNote(date: string, lessons: Lesson[], hits: { id: string; count: number }[]): string {
  const shipped = lessons.filter((l) => l.kind === "shipped");
  const decisions = lessons.filter((l) => l.kind !== "shipped");
  return [
    `# 🗓️ ${date} — 에이전트 두뇌 daily`,
    "",
    "## ✅ 오늘 출고(머지)",
    shipped.length ? shipped.map((l) => `- ${l.text} [${l.ref}]`).join("\n") : "- (없음)",
    "",
    "## 🧭 결정/규칙",
    decisions.length ? decisions.map((l) => `- ${l.text}${l.ref ? ` [${l.ref}]` : ""}`).join("\n") : "- (없음)",
    "",
    "## ⛔ 제약 위반 hit (오늘)",
    hits.length ? hits.map((h) => `- ${h.id}: ${h.count}회`).join("\n") : "- (없음)",
    "",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
function readJson<T>(path: string | undefined, fb: T): T {
  if (!path) return fb;
  try {
    const raw = readFileSync(path, "utf8").trim();
    return raw ? (JSON.parse(raw) as T) : fb;
  } catch {
    return fb;
  }
}
function readText(path: string | undefined): string {
  if (!path) return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * CLI:
 *   build <date> <merged.json> <hits.json> <decisions.json> <distilled.md> <out_daily.md>
 *     → distilled.md 를 갱신(머지 누적) 쓰고, out_daily.md 에 daily 노트 작성. stdout 에 신규 교훈 수.
 */
function main(): void {
  const argv = process.argv;
  if (argv[2] === "decisions") {
    // decisions <plan_doc_body.md> → CEO 결정 불릿 JSON 배열 stdout
    const body = readText(argv[3]);
    process.stdout.write(JSON.stringify(extractPlanDecisions(body)));
    return;
  }
  if (argv[2] !== "build") {
    console.error("usage: tsx scripts/knowledge-base.ts <build|decisions> ...");
    process.exit(1);
  }
  const date = argv[3] ?? "";
  const merged = readJson<MergedPR[]>(argv[4], []);
  const hits = readJson<{ id: string; count: number }[]>(argv[5], []);
  // decisions: string[] 또는 {text, ref}[] 둘 다 허용 — ref(issue#) 가 있으면 출처 보존
  const decisionsRaw = readJson<Array<string | { text: string; ref?: string }>>(argv[6], []);
  const decisionTexts = decisionsRaw.map((d) => (typeof d === "string" ? d : d.text ?? ""));
  const decisionRefs = decisionsRaw.map((d) => (typeof d === "string" ? "" : d.ref ?? ""));
  const distilledPath = argv[7];
  const outDaily = argv[8];
  const constraints = readJson<ConstraintRule[]>(argv[9], []); // 선택 — active constraints 배열

  const dailyLessons = [
    ...lessonsFromMergedPRs(merged, date),
    ...lessonsFromDecisions(decisionTexts, date, decisionRefs),
  ];
  // 규칙(constraints)은 distilled 에만 — daily 노트가 매일 전체 규칙으로 도배되는 것 방지
  const incoming = [...dailyLessons, ...lessonsFromConstraints(constraints, date)];
  const existing = parseDistilled(readText(distilledPath));
  const mergedLessons = compactLessons(mergeLessons(existing, incoming));
  if (distilledPath) writeFileSync(distilledPath, renderDistilled(mergedLessons));
  if (outDaily) writeFileSync(outDaily, renderDailyNote(date, dailyLessons, hits));
  process.stdout.write(String(mergedLessons.length - existing.length));
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("knowledge-base")) {
  main();
}

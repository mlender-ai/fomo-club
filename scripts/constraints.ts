/**
 * Standing Constraints 코어 (Phase 2).
 *
 * CEO가 내리는 판정·지시(브리핑 채택/킬, Slack 스레드 지시)를 사람이 YAML을 손으로
 * 고치지 않아도 영구 규칙으로 적재하고 매 사이클 9개 에이전트 + ceo_brief 에 주입한다.
 *
 * 단일 진실: constraints/active.json (git-tracked, 사람이 PR로 리뷰·수정 가능).
 *   { "constraints": Constraint[] }
 *
 * 순수 export 함수 + main() CLI (process.argv[1] 가드). 외부 호출 없음 — 결정론적.
 * Phase 0/1 scripts/{ceo-brief-fallback,build-lane-state}.ts 구조를 템플릿으로 따름.
 */

import { readFileSync } from "node:fs";

export const CONSTRAINT_KINDS = ["prohibition", "preference", "priority", "mental-model"] as const;
export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number];

export interface Constraint {
  /** 안정적 id (예: c-2026-0530-data-mismatch) */
  id: string;
  rule: string;
  /** 적용 lane (pm/frontend/... 또는 "all"=전체) */
  scope: string[];
  kind: ConstraintKind;
  /** 출처 추적 (브리핑 #번호 / slack/<channel>/<ts> / manual) */
  source: string;
  /** true=만료 안 함, false=expiresAt 까지 */
  permanent: boolean;
  /** YYYY-MM-DD */
  createdAt: string;
  /** YYYY-MM-DD 또는 null */
  expiresAt: string | null;
  /** 이 제약이 실제로 제안을 막은 횟수(가치 측정) */
  hits: number;
  /** 위반 탐지용 키워드(선택). 없으면 rule 에서 추출. */
  keywords?: string[];
}

const KIND_LABEL: Record<ConstraintKind, string> = {
  prohibition: "🚫 금지",
  preference: "👍 선호",
  priority: "⭐ 우선순위",
  "mental-model": "🧭 멘탈모델",
};

// ─────────────────────────────────────────────────────────────
// 검증
// ─────────────────────────────────────────────────────────────

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** 단일 constraint 검증 — 불량이면 throw (조용히 무시 금지). */
export function validateConstraint(obj: unknown, idx = 0): Constraint {
  if (typeof obj !== "object" || obj === null) {
    throw new Error(`constraint[${idx}]: 객체가 아님`);
  }
  const o = obj as Record<string, unknown>;
  const where = `constraint[${idx}]${typeof o.id === "string" ? ` (${o.id})` : ""}`;

  if (typeof o.id !== "string" || o.id.length === 0) throw new Error(`${where}: id 필수`);
  if (typeof o.rule !== "string" || o.rule.trim().length === 0) throw new Error(`${where}: rule 필수`);
  if (!Array.isArray(o.scope) || o.scope.length === 0 || !o.scope.every((s) => typeof s === "string")) {
    throw new Error(`${where}: scope 는 비어있지 않은 string 배열`);
  }
  if (typeof o.kind !== "string" || !CONSTRAINT_KINDS.includes(o.kind as ConstraintKind)) {
    throw new Error(`${where}: kind 는 ${CONSTRAINT_KINDS.join("|")} 중 하나`);
  }
  if (typeof o.source !== "string") throw new Error(`${where}: source 필수`);
  if (typeof o.permanent !== "boolean") throw new Error(`${where}: permanent boolean 필수`);
  if (!isYmd(o.createdAt)) throw new Error(`${where}: createdAt YYYY-MM-DD 필수`);
  if (o.expiresAt !== null && !isYmd(o.expiresAt)) throw new Error(`${where}: expiresAt 는 null 또는 YYYY-MM-DD`);
  if (o.permanent === false && o.expiresAt === null) {
    throw new Error(`${where}: 비영구 constraint 는 expiresAt 필수`);
  }
  if (typeof o.hits !== "number" || !Number.isFinite(o.hits)) throw new Error(`${where}: hits number 필수`);
  if (
    o.keywords !== undefined &&
    (!Array.isArray(o.keywords) || !o.keywords.every((k) => typeof k === "string"))
  ) {
    throw new Error(`${where}: keywords 는 string 배열`);
  }

  const out: Constraint = {
    id: o.id,
    rule: o.rule.trim(),
    scope: o.scope as string[],
    kind: o.kind as ConstraintKind,
    source: o.source,
    permanent: o.permanent,
    createdAt: o.createdAt,
    expiresAt: (o.expiresAt as string | null) ?? null,
    hits: o.hits,
  };
  if (Array.isArray(o.keywords) && o.keywords.length > 0) out.keywords = o.keywords as string[];
  return out;
}

function validateAll(arr: unknown): Constraint[] {
  if (!Array.isArray(arr)) throw new Error("constraints 는 배열이어야 함");
  return arr.map((c, i) => validateConstraint(c, i));
}

/** active.json ({constraints:[]}) 로드 — 파일 없으면 []. 불량 항목은 throw. */
export function loadConstraints(path: string): Constraint[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8").trim();
  } catch {
    return [];
  }
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  const arr = Array.isArray(parsed) ? parsed : (parsed as { constraints?: unknown }).constraints;
  if (arr === undefined) return [];
  return validateAll(arr);
}

// ─────────────────────────────────────────────────────────────
// 필터 / 렌더
// ─────────────────────────────────────────────────────────────

/** permanent 이거나 아직 만료되지 않은(expiresAt >= today) 것만. */
export function activeConstraints(all: Constraint[], today: string): Constraint[] {
  return all.filter((c) => c.permanent || (c.expiresAt !== null && c.expiresAt >= today));
}

function appliesToLane(c: Constraint, lane: string): boolean {
  return c.scope.includes("all") || c.scope.includes(lane);
}

/** 특정 lane(+all) 제약을 마크다운으로. 없으면 빈 문자열. */
export function renderForLane(constraints: Constraint[], lane: string): string {
  const matched = constraints.filter((c) => appliesToLane(c, lane));
  if (matched.length === 0) return "";
  return matched
    .map((c) => `- [${KIND_LABEL[c.kind]}] ${c.rule} _(출처: ${c.source})_`)
    .join("\n");
}

/** ceo_brief 용 전체 요약. */
export function renderForBrief(constraints: Constraint[]): string {
  if (constraints.length === 0) return "(등록된 standing constraint 없음)";
  return constraints
    .map((c) => `- [${KIND_LABEL[c.kind]}] (${c.scope.join(",")}) ${c.rule} _(${c.source})_`)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
// dedupe / compact / merge
// ─────────────────────────────────────────────────────────────

/** rule 정규화 — 중복 탐지용 (공백·구두점·대소문자 제거). */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

/** 만료 제거 + 동일 rule 중복 제거(먼저 생성된 것 유지). */
export function dedupeAndCompact(
  constraints: Constraint[],
  today: string,
): { kept: Constraint[]; removed: Constraint[] } {
  const kept: Constraint[] = [];
  const removed: Constraint[] = [];
  const seen = new Map<string, Constraint>();

  for (const c of constraints) {
    // 만료
    if (!c.permanent && c.expiresAt !== null && c.expiresAt < today) {
      removed.push(c);
      continue;
    }
    // 중복 (정규화 rule)
    const key = normalizeRule(c.rule);
    const existing = seen.get(key);
    if (existing) {
      // 더 많은 hits 를 가진 쪽으로 병합(누적), 둘 중 하나는 removed
      existing.hits += c.hits;
      // 더 넓은 scope 병합 (all 흡수)
      const merged = new Set([...existing.scope, ...c.scope]);
      existing.scope = merged.has("all") ? ["all"] : Array.from(merged);
      removed.push(c);
      continue;
    }
    seen.set(key, c);
    kept.push(c);
  }
  return { kept, removed };
}

/** 안정적 id 생성 — c-YYYYMMDD-<slug>. */
export function makeId(rule: string, today: string): string {
  const date = today.replace(/-/g, "").slice(0, 8);
  const slug = normalizeRule(rule).slice(0, 16) || "rule";
  return `c-${date}-${slug}`;
}

export interface IncomingConstraint {
  rule: string;
  scope?: string[];
  kind?: string;
  source?: string;
  permanent?: boolean;
  expiresAt?: string | null;
  id?: string;
  keywords?: string[];
}

/** 외부(distill/Slack) 입력을 검증된 Constraint 로 정규화. */
export function normalizeIncoming(input: IncomingConstraint, today: string): Constraint {
  const rule = (input.rule ?? "").trim();
  if (!rule) throw new Error("incoming constraint: rule 필수");
  const kind = (input.kind ?? "prohibition") as ConstraintKind;
  if (!CONSTRAINT_KINDS.includes(kind)) throw new Error(`incoming constraint: 잘못된 kind ${input.kind}`);
  const scope = Array.isArray(input.scope) && input.scope.length > 0 ? input.scope : ["all"];
  const permanent = input.permanent ?? true;
  const expiresAt = permanent ? null : (input.expiresAt ?? null);
  if (!permanent && expiresAt === null) {
    throw new Error("incoming constraint: 비영구는 expiresAt 필수");
  }
  return validateConstraint({
    id: input.id ?? makeId(rule, today),
    rule,
    scope,
    kind,
    source: input.source ?? "manual",
    permanent,
    createdAt: today,
    expiresAt,
    hits: 0,
    ...(Array.isArray(input.keywords) && input.keywords.length > 0 ? { keywords: input.keywords } : {}),
  });
}

export interface MergeResult {
  constraints: Constraint[];
  added: Constraint[];
  skipped: IncomingConstraint[];
  /** 기존과 모순 가능성 (rule 정규화가 "금지↔허용" 토큰만 다른 경우) */
  conflicts: { incoming: IncomingConstraint; existingId: string }[];
}

/** 기존 + 신규 후보 병합 (중복 skip, 충돌 플래그). */
export function mergeConstraints(
  existing: Constraint[],
  incoming: IncomingConstraint[],
  today: string,
): MergeResult {
  const result: MergeResult = { constraints: [...existing], added: [], skipped: [], conflicts: [] };
  const seen = new Map(existing.map((c) => [normalizeRule(c.rule), c]));

  for (const inc of incoming) {
    let candidate: Constraint;
    try {
      candidate = normalizeIncoming(inc, today);
    } catch {
      result.skipped.push(inc);
      continue;
    }
    const key = normalizeRule(candidate.rule);
    if (seen.has(key)) {
      result.skipped.push(inc);
      continue;
    }
    result.constraints.push(candidate);
    result.added.push(candidate);
    seen.set(key, candidate);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// 위반 탐지 (고리 3) + hits 집계 (고리 2) — Phase 2.5
// ─────────────────────────────────────────────────────────────

const STOPWORD_RE = /^(제안|금지|사용|등의|관련|있는|없는|해야|하지|대한|위한|으로|에서|이다|한다|및|또는|the|and|for|with)$/;

/** constraint 의 위반 탐지 키워드 — 명시 keywords 우선, 없으면 rule 에서 보수적으로 추출. */
export function constraintKeywords(c: Constraint): string[] {
  if (c.keywords && c.keywords.length > 0) return c.keywords;
  const out = new Set<string>();
  // 1) 따옴표로 강조된 토큰 ("DataMismatchBanner" 등)
  for (const m of c.rule.matchAll(/["'“”‘’]([^"'“”‘’]{2,40})["'“”‘’]/g)) {
    if (m[1]) out.add(m[1].trim());
  }
  // 2) CamelCase/식별자형 영문 (DataMismatchBanner)
  for (const m of c.rule.matchAll(/[A-Z][A-Za-z]{3,}/g)) {
    if (m[0]) out.add(m[0]);
  }
  // 3) 가운뎃점(·)으로 나열된 금지 카테고리 토큰 (이펙트·사운드·햅틱·글로우…)
  for (const seg of c.rule.split(/[()]/)) {
    if (seg.includes("·")) {
      for (const tok of seg.split(/[·,/]/)) {
        const t = tok.trim();
        if (t.length >= 2 && t.length <= 12 && !STOPWORD_RE.test(t)) out.add(t);
      }
    }
  }
  return Array.from(out);
}

export interface Violation {
  constraint: Constraint;
  matched: string;
}

/**
 * 제안 텍스트가 해당 lane(+all) 의 *금지(prohibition)* constraint 키워드를 포함하면 위반.
 * 보수적: prohibition kind 만, 키워드 정확 부분일치. 거짓양성 최소화(Phase 1 철학).
 */
export function checkViolations(
  proposalText: string,
  constraints: Constraint[],
  lane: string,
): Violation[] {
  const text = (proposalText || "").toLowerCase();
  if (!text) return [];
  const result: Violation[] = [];
  for (const c of constraints) {
    if (c.kind !== "prohibition") continue;
    if (!appliesToLane(c, lane)) continue;
    for (const kw of constraintKeywords(c)) {
      const k = kw.trim().toLowerCase();
      if (k.length >= 2 && text.includes(k)) {
        result.push({ constraint: c, matched: kw });
        break;
      }
    }
  }
  return result;
}

/** 여러 사이클 hit 맵({id:count})을 합산. */
export function sumHitMaps(maps: Record<string, number>[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const m of maps) {
    for (const [id, n] of Object.entries(m)) {
      if (typeof n === "number" && Number.isFinite(n)) total[id] = (total[id] ?? 0) + n;
    }
  }
  return total;
}

/** hit 맵을 constraints 에 누적 반영(불변 — 새 배열 반환). */
export function applyHits(constraints: Constraint[], hitMap: Record<string, number>): Constraint[] {
  return constraints.map((c) =>
    hitMap[c.id] ? { ...c, hits: c.hits + hitMap[c.id]! } : c,
  );
}

// ─────────────────────────────────────────────────────────────
// CLI
//   active <active.json> <today>        → active 필터된 bare 배열 JSON
//   render-lane <lane> <array.json>     → lane 슬라이스 마크다운
//   render-brief <array.json>           → ceo_brief 요약 마크다운
//   compact <active.json> <today>       → 압축된 {constraints:[]} JSON
//   add <active.json> <payload.json> <today> → 머지된 {constraints:[]} JSON
// ─────────────────────────────────────────────────────────────

function readBareArray(path: string): Constraint[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8").trim();
  } catch {
    return [];
  }
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  const arr = Array.isArray(parsed) ? parsed : (parsed as { constraints?: unknown }).constraints;
  if (arr === undefined) return [];
  return validateAll(arr);
}

function main(): void {
  const argv = process.argv;
  const cmd = argv[2];
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  if (cmd === "active") {
    const all = loadConstraints(argv[3] ?? "");
    process.stdout.write(JSON.stringify(activeConstraints(all, argv[4] ?? today)));
  } else if (cmd === "render-lane") {
    const arr = readBareArray(argv[4] ?? "");
    process.stdout.write(renderForLane(arr, argv[3] ?? ""));
  } else if (cmd === "render-brief") {
    const arr = readBareArray(argv[3] ?? "");
    process.stdout.write(renderForBrief(arr));
  } else if (cmd === "compact") {
    const all = loadConstraints(argv[3] ?? "");
    const { kept } = dedupeAndCompact(all, argv[4] ?? today);
    process.stdout.write(JSON.stringify({ constraints: kept }, null, 2));
  } else if (cmd === "add") {
    const existing = loadConstraints(argv[3] ?? "");
    const payloadRaw = readFileSync(argv[4] ?? "", "utf8").trim();
    const parsed: unknown = payloadRaw ? JSON.parse(payloadRaw) : [];
    const incoming: IncomingConstraint[] = Array.isArray(parsed)
      ? (parsed as IncomingConstraint[])
      : [parsed as IncomingConstraint];
    const merged = mergeConstraints(existing, incoming, argv[5] ?? today);
    process.stdout.write(JSON.stringify({ constraints: merged.constraints }, null, 2));
    process.stderr.write(`added=${merged.added.length} skipped=${merged.skipped.length}\n`);
  } else if (cmd === "check") {
    // check <active.json> <lane> <proposal.txt> [today]
    const all = loadConstraints(argv[3] ?? "");
    const active = activeConstraints(all, argv[6] ?? today);
    const lane = argv[4] ?? "";
    let text = "";
    try {
      text = readFileSync(argv[5] ?? "", "utf8");
    } catch {
      text = "";
    }
    const violations = checkViolations(text, active, lane);
    process.stdout.write(
      JSON.stringify(violations.map((v) => ({ id: v.constraint.id, rule: v.constraint.rule, matched: v.matched }))),
    );
  } else if (cmd === "apply-hits") {
    // apply-hits <active.json> <hitfile1> [hitfile2 ...] → {constraints:[]} (hits 누적)
    const all = loadConstraints(argv[3] ?? "");
    const maps: Record<string, number>[] = [];
    for (const p of argv.slice(4)) {
      try {
        const raw = readFileSync(p, "utf8").trim();
        if (raw) maps.push(JSON.parse(raw) as Record<string, number>);
      } catch {
        /* 파일 없거나 불량이면 무시 */
      }
    }
    const updated = applyHits(all, sumHitMaps(maps));
    process.stdout.write(JSON.stringify({ constraints: updated }, null, 2));
  } else {
    console.error(
      "usage:\n  active <active.json> <today>\n  render-lane <lane> <array.json>\n  render-brief <array.json>\n  compact <active.json> <today>\n  add <active.json> <payload.json> <today>\n  check <active.json> <lane> <proposal.txt> [today]\n  apply-hits <active.json> <hitfile...>",
    );
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("constraints")) {
  main();
}

/**
 * Lane-State 원장 빌더 (Phase 1).
 *
 * 매 사이클 1회 prepare job 에서 호출되어, lane(직군)별로
 *   DONE(완료) / KILLED(거부) / IN-PROGRESS(진행중) / CLOSED(사유불명)
 * 를 정리한 작은 파생 원장을 만든다. 각 에이전트는 자기 lane 슬라이스를 받아
 * "이미 끝났거나 거부된 영역"을 재제안하지 않는다 (이슈 #282 반복 제안 박멸).
 *
 * 완료 vs 거부의 결정론적 신호: "닫힌 이슈가 머지된 PR과 연결(#NNN)됐는가".
 *  - 머지 PR 연결 → DONE
 *  - 연결 없음 + 거부 라벨(score-missing) 또는 CEO 킬리스트 → KILLED (reason)
 *  - 연결도 라벨도 애매 → CLOSED(사유불명) (KILLED 아님 — 멀쩡한 재제안 막지 않음)
 *
 * 순수 export 함수 + main() CLI (process.argv[1] 가드). 외부 호출 없음 — 결정론적.
 * Phase 0 scripts/ceo-brief-fallback.ts 구조를 템플릿으로 따름.
 */

import { readFileSync } from "node:fs";

/** 알려진 lane 라벨 (Create Issue 라벨 == self-history 필터 라벨과 일치) */
export const KNOWN_LANES = [
  "pm",
  "frontend",
  "backend",
  "design",
  "qa",
  "cto",
  "marketing",
  "security",
  "prompt",
] as const;

export interface Entry {
  number: number;
  title: string;
  reason?: string;
}

export interface LaneBucket {
  done: Entry[];
  killed: Entry[];
  inProgress: Entry[];
  closedUnknown: Entry[];
}

export type LaneState = Record<string, LaneBucket>;

export interface MergedPR {
  number: number;
  title: string;
  body?: string;
}

export interface ClosedIssue {
  number: number;
  title: string;
  lane: string;
  scoreLabel?: string;
}

export interface OpenIssue {
  number: number;
  title: string;
  lane: string;
  scoreLabel?: string;
}

export interface BuildInput {
  mergedPRs: MergedPR[];
  closedIssues: ClosedIssue[];
  openIssues: OpenIssue[];
  /** CEO Brief 킬리스트로 명시 거부된 이슈 번호 (선택) */
  ceoKilledNumbers?: number[];
}

/** 거부로 간주하는 점수 라벨 */
const REJECTION_LABELS = new Set(["score-missing"]);

/** 텍스트에서 #NNN / closes #NNN 형태의 이슈 번호를 추출. */
export function extractIssueRefs(text: string): number[] {
  if (!text) return [];
  const out = new Set<number>();
  const re = /#(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return Array.from(out);
}

function emptyBucket(): LaneBucket {
  return { done: [], killed: [], inProgress: [], closedUnknown: [] };
}

function ensureLane(state: LaneState, lane: string): LaneBucket {
  const key = lane && lane.length > 0 ? lane : "unknown";
  if (!state[key]) state[key] = emptyBucket();
  return state[key];
}

/** 머지된 PR들이 참조하는 모든 이슈 번호 집합. */
export function mergedPrIssueRefs(mergedPRs: MergedPR[]): Set<number> {
  const refs = new Set<number>();
  for (const pr of mergedPRs) {
    for (const n of extractIssueRefs(`${pr.title ?? ""} ${pr.body ?? ""}`)) {
      refs.add(n);
    }
  }
  return refs;
}

/** lane-state 원장 빌드 (순수 함수). */
export function buildLaneState(input: BuildInput): LaneState {
  const state: LaneState = {};
  // 알려진 lane 을 미리 생성 — 슬라이스 렌더 시 누락 방지
  for (const lane of KNOWN_LANES) ensureLane(state, lane);

  const linkedRefs = mergedPrIssueRefs(input.mergedPRs);
  const ceoKilled = new Set(input.ceoKilledNumbers ?? []);

  // IN-PROGRESS: open + score-strong/conditional
  for (const issue of input.openIssues) {
    if (issue.scoreLabel === "score-strong" || issue.scoreLabel === "score-conditional") {
      ensureLane(state, issue.lane).inProgress.push({
        number: issue.number,
        title: issue.title,
        reason: issue.scoreLabel,
      });
    }
  }

  // 닫힌 이슈 분류
  for (const issue of input.closedIssues) {
    const bucket = ensureLane(state, issue.lane);
    if (linkedRefs.has(issue.number)) {
      bucket.done.push({ number: issue.number, title: issue.title, reason: "머지 PR 연결" });
    } else if (ceoKilled.has(issue.number)) {
      bucket.killed.push({ number: issue.number, title: issue.title, reason: "ceo-killlist" });
    } else if (issue.scoreLabel && REJECTION_LABELS.has(issue.scoreLabel)) {
      bucket.killed.push({ number: issue.number, title: issue.title, reason: issue.scoreLabel });
    } else {
      bucket.closedUnknown.push({
        number: issue.number,
        title: issue.title,
        reason: "사유불명",
      });
    }
  }

  return state;
}

function renderEntries(entries: Entry[], withReason: boolean): string[] {
  return entries.map((e) => {
    const reason = withReason && e.reason ? ` — 사유: ${e.reason}` : "";
    return `- #${e.number} ${e.title}${reason}`;
  });
}

/** 특정 lane 슬라이스를 에이전트 프롬프트용 마크다운으로 렌더. */
export function renderLaneSliceMarkdown(state: LaneState, lane: string): string {
  // 조회 실패 degrade 가드 (9.3) — 빈 화면 금지, 보수적 안내
  if ((state as Record<string, unknown>).__degraded__ === true) {
    return [
      "## 🧾 우리 직군 상태 원장 — ⚠️ 조회 실패",
      "원장 조회에 실패했다(gh rate limit 등). 보수적으로: 최근 머지 PR 제목과",
      "겹치는 제안은 자제하고, 재제안 시 반드시 '기존 위에 무엇을 추가하는가'를 명시하라.",
    ].join("\n");
  }

  const bucket = state[lane] ?? emptyBucket();
  const total =
    bucket.done.length +
    bucket.killed.length +
    bucket.inProgress.length +
    bucket.closedUnknown.length;

  if (total === 0) {
    return "이력 없음 — 새 영역 제안 가능.";
  }

  const lines: string[] = [];
  lines.push(`## 🧾 [${lane}] 우리 직군 상태 원장 — 같은 항목 재제안 시 자동 킬`);

  lines.push("### ✅ DONE (이미 구현 완료 — 절대 재제안 금지)");
  lines.push(bucket.done.length ? renderEntries(bucket.done, true).join("\n") : "- (없음)");

  lines.push("### ❌ KILLED (거부됨 — 같은 주제 재제안 금지)");
  lines.push(bucket.killed.length ? renderEntries(bucket.killed, true).join("\n") : "- (없음)");

  lines.push("### 🔄 IN-PROGRESS (진행 중 — 중복 제안 금지)");
  lines.push(
    bucket.inProgress.length ? renderEntries(bucket.inProgress, true).join("\n") : "- (없음)",
  );

  if (bucket.closedUnknown.length) {
    lines.push("### ℹ️ CLOSED (사유 불명 — 재제안 전 확인 권장)");
    lines.push(renderEntries(bucket.closedUnknown, false).join("\n"));
  }

  return lines.join("\n");
}

/** 폴백/디버그용 전체 JSON 문자열. */
export function renderLaneStateJson(state: LaneState): string {
  return JSON.stringify(state);
}

// ─────────────────────────────────────────────────────────────
// CLI 엔트리
//   build <merged.json> <closed.json> <open.json> [ceoKilled.json]
//       → lane-state JSON 을 stdout 으로 출력
//   slice <lane> <lane-state.json>
//       → 해당 lane 슬라이스 마크다운을 stdout 으로 출력
// ─────────────────────────────────────────────────────────────

function readJson<T>(path: string | undefined, fallback: T): T {
  if (!path) return fallback;
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function cmdBuild(argv: string[]): void {
  const input: BuildInput = {
    mergedPRs: readJson<MergedPR[]>(argv[3], []),
    closedIssues: readJson<ClosedIssue[]>(argv[4], []),
    openIssues: readJson<OpenIssue[]>(argv[5], []),
    ceoKilledNumbers: readJson<number[]>(argv[6], []),
  };
  const state = buildLaneState(input);
  process.stdout.write(renderLaneStateJson(state));
}

function cmdSlice(argv: string[]): void {
  const lane = argv[3] ?? "";
  const state = readJson<LaneState>(argv[4], {});
  process.stdout.write(renderLaneSliceMarkdown(state, lane));
}

function main(): void {
  const argv = process.argv;
  const cmd = argv[2];
  if (cmd === "build") {
    cmdBuild(argv);
  } else if (cmd === "slice") {
    cmdSlice(argv);
  } else {
    console.error(
      "usage:\n  tsx scripts/build-lane-state.ts build <merged.json> <closed.json> <open.json> [ceoKilled.json]\n  tsx scripts/build-lane-state.ts slice <lane> <lane-state.json>",
    );
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("build-lane-state")) {
  main();
}

/**
 * Progress-Ledger 빌더 (브리프 신뢰 grounding — Phase A).
 *
 * CEO Brief 의 "어제 채택 진척" 표는 그동안 LLM 이 yesterday_brief 텍스트만 보고
 * "🔄 진행 중" 같은 상태를 **상상으로 채워** 왔다(실제 PR/머지와 무관 → 날조).
 * 이 스크립트는 어제 채택(score-strong/conditional)된 이슈가 **실제로** 머지 PR/오픈 PR
 * 로 갔는지를 결정론적으로 판정해, LLM 이 발명할 여지 없이 그대로 렌더할 표를 만든다.
 *
 * 완료 신호: "머지/오픈 PR 본문이 그 이슈 #NNN 을 참조하는가" (auto-merge 가 PR body 에 기록).
 *   - 머지 PR 참조        → MERGED   ✅
 *   - 오픈 PR 참조        → OPEN_PR  🔄
 *   - 참조 없음 + 이슈 closed → CLOSED_NO_PR ⚠️ (채택됐는데 구현 안 되고 닫힘)
 *   - 참조 없음 + 이슈 open   → PENDING  ⏳
 *
 * 순수 export 함수 + main() CLI (process.argv[1] 가드). build-lane-state.ts 패턴 답습.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { extractIssueRefs } from "./build-lane-state";

export type ProgressStatus = "MERGED" | "OPEN_PR" | "CLOSED_NO_PR" | "PENDING";

/** 어제 채택된(게이트 통과) agent-council 이슈. */
export interface AdoptedIssue {
  number: number;
  title: string;
  /** lane(직군) 라벨 — pm/frontend/... */
  agent: string;
  /** "OPEN" | "CLOSED" (gh issue state) */
  state?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  /** "merged" 면 머지된 PR, 그 외(open 등) */
  merged?: boolean;
}

export interface ProgressEntry {
  issue: number;
  title: string;
  agent: string;
  pr: number | null;
  status: ProgressStatus;
}

export interface BuildInput {
  adopted: AdoptedIssue[];
  mergedPRs: PullRequest[];
  openPRs: PullRequest[];
}

/** PR 목록을 "참조 이슈번호 → PR번호" 맵으로 (가장 최근/큰 PR 우선). */
function refToPr(prs: PullRequest[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const pr of prs) {
    for (const n of extractIssueRefs(`${pr.title ?? ""} ${pr.body ?? ""}`)) {
      const existing = map.get(n);
      if (existing === undefined || pr.number > existing) map.set(n, pr.number);
    }
  }
  return map;
}

/** 진척 원장 빌드 (순수 함수). */
export function buildProgressLedger(input: BuildInput): ProgressEntry[] {
  const mergedMap = refToPr(input.mergedPRs);
  const openMap = refToPr(input.openPRs);

  return input.adopted.map((iss) => {
    const mergedPr = mergedMap.get(iss.number);
    if (mergedPr !== undefined) {
      return { issue: iss.number, title: iss.title, agent: iss.agent, pr: mergedPr, status: "MERGED" };
    }
    const openPr = openMap.get(iss.number);
    if (openPr !== undefined) {
      return { issue: iss.number, title: iss.title, agent: iss.agent, pr: openPr, status: "OPEN_PR" };
    }
    const closed = (iss.state ?? "").toUpperCase() === "CLOSED";
    return {
      issue: iss.number,
      title: iss.title,
      agent: iss.agent,
      pr: null,
      status: closed ? "CLOSED_NO_PR" : "PENDING",
    };
  });
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  MERGED: "✅ 머지됨",
  OPEN_PR: "🔄 PR 리뷰 중",
  CLOSED_NO_PR: "⚠️ 종료(미구현)",
  PENDING: "⏳ 미착수",
};

function clip(s: string, n: number): string {
  const t = (s || "").replace(/\n/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/**
 * "어제 채택 진척" 표를 마크다운으로 렌더 (LLM 은 이 표를 그대로 복사, 상태 발명 금지).
 * 어제 채택이 없으면 안내 문구.
 */
export function renderProgressTable(entries: ProgressEntry[]): string {
  if (!entries.length) {
    return "| (어제 채택 항목 없음 — 진척 추적 없음) | - | - | - |";
  }
  const rows = entries.map((e) => {
    const prCell = e.pr ? `PR #${e.pr}` : "-";
    return `| #${e.issue} ${clip(e.title, 40)} | ${e.agent} | ${STATUS_LABEL[e.status]} | ${prCell} |`;
  });
  return rows.join("\n");
}

/** 상단 실적 한 줄: 어제 실제로 머지된 항목만. 자율성 체감 복구용. */
export function renderShippedLine(entries: ProgressEntry[]): string {
  const shipped = entries.filter((e) => e.status === "MERGED");
  if (!shipped.length) return "🚢 어제 실제 머지: 없음";
  const parts = shipped.map((e) => `PR #${e.pr}(${e.agent}: ${clip(e.title, 24)})`);
  return `🚢 어제 실제 머지 ${shipped.length}건: ${parts.join(", ")}`;
}

/** 발행 전 검증용 — 브리프가 인용해도 되는 이슈/ PR 번호 화이트리스트. */
export function allowedNumbers(entries: ProgressEntry[], todayNumbers: number[]): Set<number> {
  const set = new Set<number>(todayNumbers);
  for (const e of entries) {
    set.add(e.issue);
    if (e.pr) set.add(e.pr);
  }
  return set;
}

export function renderLedgerJson(entries: ProgressEntry[]): string {
  return JSON.stringify(entries);
}

// ─────────────────────────────────────────────────────────────
// CLI 엔트리
//   build <adopted.json> <merged.json> <open.json> <out_table.md> <out_shipped.txt>
//       → 진척 표(.md) + 실적 한 줄(.txt) 파일 생성, ledger JSON 을 stdout
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

function main(): void {
  const argv = process.argv;
  if (argv[2] !== "build") {
    console.error(
      "usage:\n  tsx scripts/build-progress-ledger.ts build <adopted.json> <merged.json> <open.json> <out_table.md> <out_shipped.txt>",
    );
    process.exit(1);
  }
  const input: BuildInput = {
    adopted: readJson<AdoptedIssue[]>(argv[3], []),
    mergedPRs: readJson<PullRequest[]>(argv[4], []),
    openPRs: readJson<PullRequest[]>(argv[5], []),
  };
  const entries = buildProgressLedger(input);
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  if (argv[6]) writeFileSync(argv[6], renderProgressTable(entries));
  if (argv[7]) writeFileSync(argv[7], renderShippedLine(entries));
  process.stdout.write(renderLedgerJson(entries));
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("build-progress-ledger")) {
  main();
}

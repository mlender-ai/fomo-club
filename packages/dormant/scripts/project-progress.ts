/**
 * 프로젝트 진척 롤업/리포트 (톱다운 워크플로 P4).
 *
 * 활성 프로젝트의 `project:<id>` task 이슈들이 실제로 머지/PR/미착수 중 무엇인지를
 * build-progress-ledger 의 결정론 판정(MERGED/OPEN_PR/PENDING/CLOSED_NO_PR)으로 굴려
 * "N/M 완료" 진척 + 다음 할 일을 만든다. 매일 cron 이 이걸 Slack 으로 보고한다(아이디어 생성 아님).
 *
 * 순수 export 함수 + main() CLI.
 *   report <project_id> <project_title> <issues.json> <merged.json> <open.json>
 *     → Slack 리포트 텍스트를 stdout
 */

import { readFileSync } from "node:fs";
import { buildProgressLedger, type ProgressEntry, type AdoptedIssue, type PullRequest } from "./build-progress-ledger";

export interface ProjectRollup {
  total: number;
  merged: number;
  openPr: number;
  pending: number;
  closedNoPr: number;
  donePct: number;
}

export function rollup(entries: ProgressEntry[]): ProjectRollup {
  const total = entries.length;
  const merged = entries.filter((e) => e.status === "MERGED").length;
  const openPr = entries.filter((e) => e.status === "OPEN_PR").length;
  const pending = entries.filter((e) => e.status === "PENDING").length;
  const closedNoPr = entries.filter((e) => e.status === "CLOSED_NO_PR").length;
  const donePct = total > 0 ? Math.round((merged / total) * 100) : 0;
  return { total, merged, openPr, pending, closedNoPr, donePct };
}

const STATUS_ICON: Record<ProgressEntry["status"], string> = {
  MERGED: "✅",
  OPEN_PR: "🔄",
  PENDING: "⏳",
  CLOSED_NO_PR: "⚠️",
};

/** 활성 프로젝트 진척 Slack 리포트. */
export function renderProgressReport(
  projectId: string,
  projectTitle: string,
  entries: ProgressEntry[],
): string {
  const r = rollup(entries);
  if (r.total === 0) {
    return `🗺️ *${projectId} · ${projectTitle}* — 아직 분해된 task 이슈가 없습니다. \`project-kickoff\` 로 분해하세요.`;
  }
  const lines: string[] = [];
  lines.push(`🚧 *프로젝트 진척 — ${projectId} · ${projectTitle}*`);
  lines.push(`*${r.merged}/${r.total} 완료 (${r.donePct}%)*  ·  🔄 PR중 ${r.openPr} · ⏳ 미착수 ${r.pending}${r.closedNoPr ? ` · ⚠️ 종료(미구현) ${r.closedNoPr}` : ""}`);
  lines.push("");
  // 남은 일(미착수·PR중) 우선 노출 — "오늘 할 일"
  const remaining = entries.filter((e) => e.status === "PENDING" || e.status === "OPEN_PR");
  if (remaining.length) {
    lines.push("*다음 할 일:*");
    for (const e of remaining.slice(0, 8)) {
      lines.push(`${STATUS_ICON[e.status]} #${e.issue} ${e.title}${e.pr ? ` (PR #${e.pr})` : ""}`);
    }
  }
  if (r.merged === r.total) {
    lines.push("");
    lines.push("🎉 *모든 task 머지 완료* — 프로젝트 done 처리 + 다음 프로젝트 선택을 검토하세요.");
  }
  lines.push("");
  lines.push("_구현은 CEO 승인(슬랙 \"개발해\") 시에만. 산발적 일일 제안은 없습니다._");
  return lines.join("\n");
}

/** 이슈 라벨에서 축(PL/TD/BA/UX) 라벨을 사람이 읽는 축으로(없으면 task). */
function issueToAdopted(i: { number: number; title: string; state?: string; axis?: string }): AdoptedIssue {
  return { number: i.number, title: i.title, agent: i.axis ?? "task", state: i.state };
}

// ─────────────────────────────────────────────────────────────
function readJson<T>(path: string | undefined, fallback: T): T {
  if (!path) return fallback;
  try {
    const raw = readFileSync(path, "utf8").trim();
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function main(): void {
  const argv = process.argv;
  if (argv[2] !== "report") {
    console.error("usage: tsx scripts/project-progress.ts report <id> <title> <issues.json> <merged.json> <open.json>");
    process.exit(1);
  }
  const id = argv[3] ?? "P?";
  const title = argv[4] ?? "";
  const issues = readJson<Array<{ number: number; title: string; state?: string; axis?: string }>>(argv[5], []);
  const merged = readJson<PullRequest[]>(argv[6], []);
  const open = readJson<PullRequest[]>(argv[7], []);
  const entries = buildProgressLedger({
    adopted: issues.map(issueToAdopted),
    mergedPRs: merged,
    openPRs: open,
  });
  process.stdout.write(renderProgressReport(id, title, entries));
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("project-progress")) {
  main();
}

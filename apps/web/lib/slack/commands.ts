import { postMessage } from "./client";
import {
  triggerWorkflow,
  getOpenPRs,
  getCEOBriefIssues,
  addLabel,
  mergePR,
  getWorkflowRuns,
} from "./github";

interface CommandResult {
  text: string;
}

type CommandHandler = (args: string, userId: string) => Promise<CommandResult>;

// GitHub API 다중 호출 등 3초 초과 가능성 있는 커맨드
export const SLOW_COMMANDS = new Set(["status", "implement", "council", "merge"]);

const commands: Record<string, CommandHandler> = {
  implement: handleImplement,
  council: handleCouncil,
  status: handleStatus,
  approve: handleApprove,
  merge: handleMerge,
  help: handleHelp,
};

export async function dispatchCommand(
  command: string,
  args: string,
  userId: string,
  channel: string
): Promise<string> {
  const handler = commands[command];
  if (!handler) {
    return `알 수 없는 커맨드: \`${command}\`. \`/taro help\`로 사용법을 확인하세요.`;
  }

  try {
    const result = await handler(args.trim(), userId);
    return result.text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `오류 발생: ${msg}`;
  }
}

async function handleImplement(args: string): Promise<CommandResult> {
  if (!args) {
    return { text: "사용법: `/taro implement {이슈번호 또는 날짜}`" };
  }

  const inputs: Record<string, string> = {};
  if (/^\d+$/.test(args)) {
    inputs.brief_date = args;
  } else {
    inputs.brief_date = args;
  }

  await triggerWorkflow("auto-implement.yml", inputs);
  return { text: `Auto-implement 워크플로우 트리거됨 (입력: ${args})` };
}

async function handleCouncil(): Promise<CommandResult> {
  await triggerWorkflow("idea-proposal.yml", { agent: "all" });
  return { text: "Daily Agent Council 워크플로우 트리거됨" };
}

async function handleStatus(): Promise<CommandResult> {
  const [prs, briefs, implRuns] = await Promise.all([
    getOpenPRs(5),
    getCEOBriefIssues(3),
    getWorkflowRuns("auto-implement.yml", 3),
  ]);

  const prList = (prs as { number: number; title: string }[])
    .map((pr) => `  #${pr.number}: ${pr.title}`)
    .join("\n") || "  (없음)";

  const briefList = (briefs as { number: number; title: string }[])
    .map((b) => `  #${b.number}: ${b.title}`)
    .join("\n") || "  (없음)";

  const runList = (
    (implRuns as { workflow_runs: { conclusion: string; created_at: string }[] })
      .workflow_runs || []
  )
    .map((r) => `  ${r.conclusion || "running"} — ${r.created_at}`)
    .join("\n") || "  (없음)";

  return {
    text: `*현재 상태*\n\n*오픈 PR:*\n${prList}\n\n*CEO Brief:*\n${briefList}\n\n*Auto-implement 최근 실행:*\n${runList}`,
  };
}

async function handleApprove(args: string): Promise<CommandResult> {
  const issueNum = parseInt(args);
  if (isNaN(issueNum)) {
    return { text: "사용법: `/taro approve {이슈번호}`" };
  }

  await addLabel(issueNum, ["implement-approved"]);
  return { text: `이슈 #${issueNum}에 \`implement-approved\` 라벨 추가됨` };
}

async function handleMerge(args: string): Promise<CommandResult> {
  const prNum = parseInt(args);
  if (isNaN(prNum)) {
    return { text: "사용법: `/taro merge {PR번호}`" };
  }

  await mergePR(prNum);
  return { text: `PR #${prNum} 머지 완료 (squash)` };
}

async function handleHelp(): Promise<CommandResult> {
  return {
    text: [
      "*Taro Agent Bot 커맨드:*",
      "`/taro implement {날짜}` — CEO Brief 자동 구현 트리거",
      "`/taro council` — Agent Council 수동 실행",
      "`/taro status` — 오픈 PR + CEO Brief + 실행 상태 요약",
      "`/taro approve {이슈#}` — 이슈에 implement-approved 라벨 추가",
      "`/taro merge {PR#}` — PR squash 머지",
      "`/taro help` — 이 도움말",
    ].join("\n"),
  };
}

import {
  triggerWorkflow,
  getOpenPRs,
  addLabel,
  mergePR,
  getWorkflowRuns,
  getFileContent,
  getLatestActionableIssue,
} from "./github";

interface CommandResult {
  text: string;
}

type CommandHandler = (args: string, userId: string) => Promise<CommandResult>;

// GitHub API 다중 호출 등 3초 초과 가능성 있는 커맨드
export const SLOW_COMMANDS = new Set([
  "status",
  "implement",
  "council",
  "merge",
  "constraints",
  "pipeline",
  "monitor",
  "source",
  "integrity",
  "파이프라인",
  "소스",
  "정합성",
]);

// 알려진 커맨드 목록 — events/route.ts에서 chat vs command 분기에 사용
export const KNOWN_COMMANDS = new Set([
  "implement",
  "council",
  "status",
  "approve",
  "merge",
  "help",
  "constraints",
  "pipeline",
  "monitor",
  "source",
  "integrity",
  "파이프라인",
  "소스",
  "정합성",
]);

const commands: Record<string, CommandHandler> = {
  implement: handleImplement,
  council: handleCouncil,
  status: handleStatus,
  approve: handleApprove,
  merge: handleMerge,
  constraints: handleConstraints,
  pipeline: handlePipeline,
  monitor: handleMonitor,
  source: handleSourceDiscovery,
  integrity: handleIntegrityCheck,
  파이프라인: handlePipeline,
  소스: handleSourceDiscovery,
  정합성: handleIntegrityCheck,
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
    return `알 수 없는 커맨드: \`${command}\`. \`/fomo help\`로 사용법을 확인하세요.`;
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
    const issue = await getLatestActionableIssue();
    if (!issue) {
      return { text: "구현할 작업 이슈가 없습니다. 먼저 Daily Product Monitor가 critical 이슈를 만들거나, `/fomo implement #607`처럼 이슈 번호를 지정해 주세요." };
    }
    await triggerWorkflow("implement-task.yml", { issue: String(issue.number) });
    return { text: `최신 작업 이슈 #${issue.number} 구현 워크플로우 트리거됨: ${issue.title}` };
  }

  const issueMatch = args.match(/^#?(\d+)$/);
  if (issueMatch?.[1]) {
    await triggerWorkflow("implement-task.yml", { issue: issueMatch[1] });
    return { text: `이슈 #${issueMatch[1]} 구현 워크플로우 트리거됨` };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(args)) {
    return { text: "CEO Brief 날짜 기반 auto-implement는 더 이상 기본 경로가 아닙니다. `/fomo monitor`로 제품 모니터링을 실행하거나 `/fomo implement #이슈번호`를 사용해 주세요." };
  }

  return { text: "입력 형식이 올바르지 않습니다. `/fomo implement #이슈번호` 형식으로 입력하세요.\n예: `/fomo implement #607`" };
}

async function handleCouncil(): Promise<CommandResult> {
  return {
    text: "🔒 Daily Agent Council은 잠겨 있습니다. 자율 기획 루프는 사용하지 않습니다. 대신 `/fomo pipeline`, `/fomo source`, `/fomo integrity` 또는 특정 이슈 개발 지시를 사용하세요.",
  };
}

async function handleStatus(): Promise<CommandResult> {
  const [prs, monitorRuns, taskRuns] = await Promise.all([
    getOpenPRs(5),
    getWorkflowRuns("daily-product-monitor.yml", 3),
    getWorkflowRuns("implement-task.yml", 3),
  ]);

  const prList = (prs as { number: number; title: string }[])
    .map((pr) => `  #${pr.number}: ${pr.title}`)
    .join("\n") || "  (없음)";

  const monitorList = (
    (monitorRuns as { workflow_runs: { conclusion: string; created_at: string }[] })
      .workflow_runs || []
  )
    .map((r) => `  ${r.conclusion || "running"} — ${r.created_at}`)
    .join("\n") || "  (없음)";

  const taskList = (
    (taskRuns as { workflow_runs: { conclusion: string; created_at: string }[] })
      .workflow_runs || []
  )
    .map((r) => `  ${r.conclusion || "running"} — ${r.created_at}`)
    .join("\n") || "  (없음)";

  return {
    text: `*현재 상태*\n\n*오픈 PR:*\n${prList}\n\n*Daily Product Monitor 최근 실행:*\n${monitorList}\n\n*Implement Task 최근 실행:*\n${taskList}`,
  };
}

async function handleApprove(args: string): Promise<CommandResult> {
  const issueNum = parseInt(args);
  if (isNaN(issueNum)) {
    return { text: "사용법: `/fomo approve {이슈번호}`" };
  }

  await addLabel(issueNum, ["implement-approved"]);
  return { text: `이슈 #${issueNum}에 \`implement-approved\` 라벨 추가됨` };
}

async function handleMerge(args: string): Promise<CommandResult> {
  const prNum = parseInt(args);
  if (isNaN(prNum)) {
    return { text: "사용법: `/fomo merge {PR번호}`" };
  }

  await mergePR(prNum);
  return { text: `PR #${prNum} 머지 완료 (squash)` };
}

async function handlePipeline(args: string): Promise<CommandResult> {
  await triggerWorkflow("agent-ops.yml", { mode: "pipeline-monitor", query: args });
  return { text: "🛠️ pipeline-monitor 작업 이슈 생성을 요청했습니다. 수집량·fallback·confidence·빈 카드 기준으로 점검합니다." };
}

async function handleMonitor(args: string): Promise<CommandResult> {
  await triggerWorkflow("daily-product-monitor.yml", {
    auto_fix: args.includes("no-fix") ? "false" : "true",
  });
  return { text: "🩺 Daily Product Monitor를 수동 실행했습니다. critical 없으면 보고만 하고 스킵, 있으면 이슈 생성 후 자동 수정 시도합니다." };
}

async function handleSourceDiscovery(args: string): Promise<CommandResult> {
  await triggerWorkflow("agent-ops.yml", { mode: "source-discovery", query: args });
  return { text: "🔎 source-discovery 작업 이슈 생성을 요청했습니다. 실제 연동은 하지 않고 후보·리스크·tier만 보고합니다." };
}

async function handleIntegrityCheck(args: string): Promise<CommandResult> {
  await triggerWorkflow("agent-ops.yml", { mode: "integrity-checker", query: args });
  return { text: "🧪 integrity-checker 작업 이슈 생성을 요청했습니다. 원문 grounding·tier·금칙어·강세/약세 균형을 검수합니다." };
}

interface ActiveConstraint {
  rule: string;
  scope: string[];
  kind: string;
  source: string;
}

async function handleConstraints(): Promise<CommandResult> {
  try {
    const raw = await getFileContent("constraints/active.json");
    if (!raw) return { text: "등록된 standing constraint가 없습니다." };
    const parsed = JSON.parse(raw) as { constraints?: ActiveConstraint[] };
    const list = parsed.constraints ?? [];
    if (list.length === 0) return { text: "등록된 standing constraint가 없습니다." };
    const lines = list.map(
      (c) => `• [${c.kind}] (${c.scope.join(",")}) ${c.rule}  _(${c.source})_`
    );
    return { text: `*🔒 Standing Constraints (${list.length}건)*\n\n${lines.join("\n")}` };
  } catch (e) {
    return { text: `constraints 조회 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function handleHelp(): Promise<CommandResult> {
  return {
    text: [
      "*FOMO Club Agent 커맨드:*",
      "`/fomo monitor` — Daily Product Monitor 수동 실행",
      "`/fomo implement #{이슈번호}` — 지정 작업 이슈 구현",
      "`/fomo council` — 잠김: 자율기획 루프는 실행하지 않음",
      "`/fomo status` — 오픈 PR + 모니터/구현 실행 상태 요약",
      "`/fomo approve {이슈#}` — 이슈에 implement-approved 라벨 추가",
      "`/fomo merge {PR#}` — PR squash 머지",
      "`/fomo constraints` — 현재 등록된 standing constraints 목록",
      "`/fomo pipeline {요청}` — pipeline-monitor 점검 이슈 생성",
      "`/fomo source {요청}` — source-discovery 소스 후보 리포트 이슈 생성",
      "`/fomo integrity {요청}` — integrity-checker 정합성 검수 이슈 생성",
      "`/fomo help` — 이 도움말",
      "",
      "*직군 에이전트와 대화:*",
      "봇을 멘션하고 직군을 부르면 그 에이전트가 답합니다.",
      "• `@FOMO Club Agent PM 이거 어때?` — PM 관점",
      "• `@FOMO Club Agent CTO한테 물어봐` — CTO(개발) 관점",
      "• `@FOMO Club Agent 보안 의견 줘` — Security 관점",
      "직군 없이 물으면 운영봇(Hermes)이 상태·조회를 답합니다.",
    ].join("\n"),
  };
}

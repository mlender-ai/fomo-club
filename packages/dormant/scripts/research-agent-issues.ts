import { promises as fs } from "fs";

import {
  RESEARCH_CONTRACT_METADATA,
  RESEARCH_CONTRACT_VERSION,
  createEmptyResearchBehaviorSummary,
  renderResearchPipelineMarkdown,
  type AgentRole,
  type ProductActionItem,
  type ResearchWorkspaceData
} from "../packages/shared/src/research";
import { readCompletedActionArchive, writeCompletedActionArchive, type CompletedActionRecord } from "../packages/shared/src/agentCouncilMemory";
import { type GeneratedResearchSnapshot } from "../packages/shared/src/researchPipeline";

const SNAPSHOT_PATH = "generated/research/latest.json";
const MARKDOWN_PATH = "generated/research/latest.md";
const PLAN_DIR = ".github/agent-council";
const LABELS = [
  { name: "agent-council", color: "1d76db", description: "Action items proposed by the agent council" },
  { name: "research-automation", color: "0e8a16", description: "Automatically managed research workflow issue" },
  { name: "owner:pm", color: "c5def5", description: "Owned by product management" },
  { name: "owner:trader", color: "5319e7", description: "Owned by trader workflow" },
  { name: "owner:da", color: "0e8a16", description: "Owned by data analysis" },
  { name: "owner:qa", color: "d73a4a", description: "Owned by quality assurance" },
  { name: "owner:cto", color: "fbca04", description: "Owned by engineering leadership" }
];

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  closed_at?: string | null;
  labels?: Array<{ name: string }>;
  pull_request?: unknown;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  closed_at?: string | null;
  merged_at: string | null;
  head: { ref: string };
}

interface GitHubRepository {
  default_branch: string;
}

interface GitHubRef {
  object: {
    sha: string;
  };
}

interface GitHubContentFile {
  sha: string;
  content?: string;
  encoding?: string;
}

interface GitHubPullRequestFile {
  filename: string;
}

function buildIssueMarker(itemId: string): string {
  return `<!-- research-action-item:${itemId} -->`;
}

function buildPullRequestMarker(itemId: string): string {
  return `<!-- research-action-pr:${itemId} -->`;
}

function buildBranchName(item: ProductActionItem): string {
  return `codex/agent-council/${item.id}`;
}

function ownerLabel(owner: AgentRole): string {
  return `owner:${owner.toLowerCase()}`;
}

function actionLabels(item: ProductActionItem): string[] {
  return ["agent-council", "research-automation", ownerLabel(item.owner)];
}

function parseManagedMarker(body: string | null, type: "issue" | "pr"): string | null {
  const pattern = type === "issue" ? /research-action-item:([a-z0-9-]+)/i : /research-action-pr:([a-z0-9-]+)/i;
  return body?.match(pattern)?.[1] ?? null;
}

function parseOwner(labels: Array<{ name: string }> | undefined): AgentRole | null {
  const value = labels?.find((label) => label.name.startsWith("owner:"))?.name.replace("owner:", "").toUpperCase();
  return value === "PM" || value === "TRADER" || value === "DA" || value === "QA" || value === "CTO" ? value : null;
}

function encodeContentPath(value: string): string {
  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function buildIssueTitle(item: ProductActionItem): string {
  return `[Agent Council] ${item.title}`;
}

function buildPlanPath(item: ProductActionItem): string {
  return `${PLAN_DIR}/${item.id}.md`;
}

function implementationArtifactPath(item: ProductActionItem): string {
  return buildPlanPath(item);
}

function buildIssueBody(
  item: ProductActionItem,
  workspace: ResearchWorkspaceData,
  metadata: { branchName: string; pullRequestUrl: string | null; issueUrl?: string | null }
): string {
  const headline = workspace.news.headline?.title ?? "헤드라인 없음";
  const strategy = workspace.agentPipeline.actionPlan.strategy;

  return [
    buildIssueMarker(item.id),
    "",
    "## Context",
    `- Generated At: ${workspace.generatedAt}`,
    `- Headline: ${headline}`,
    `- Strategy: ${strategy}`,
    `- Owner: ${item.owner}`,
    `- References: ${item.references.join(", ") || "n/a"}`,
    `- Branch: ${metadata.branchName}`,
    `- Draft PR: ${metadata.pullRequestUrl ?? "not created yet"}`,
    "",
    "## Action Item",
    item.detail,
    "",
    "## Acceptance",
    "- [ ] 작업 범위를 제품 변경으로 구체화한다.",
    "- [ ] 구현 또는 측정 지표를 연결한다.",
    "- [ ] 완료 후 에이전트 회의 탭과 snapshot에 반영한다."
  ].join("\n");
}

function buildPlanFileContent(item: ProductActionItem, issue: GitHubIssue, workspace: ResearchWorkspaceData, branchName: string): string {
  return [
    "# Agent Council Work Plan",
    "",
    `- Item: ${item.title}`,
    `- Owner: ${item.owner}`,
    `- Issue: ${issue.html_url}`,
    `- Branch: ${branchName}`,
    `- Generated At: ${workspace.generatedAt}`,
    `- Status: ${item.implementationStatus}`,
    "",
    "## Detail",
    item.detail,
    "",
    "## Implementation Focus",
    item.implementationFocus,
    "",
    "## Target Files",
    ...item.targetPaths.map((path) => `- ${path}`),
    "",
    "## Verification",
    ...item.verificationCommands.map((command) => `- ${command}`),
    "",
    "## References",
    ...item.references.map((reference) => `- ${reference}`),
    "",
    "## Acceptance",
    "- [ ] 작업 범위를 제품 변경으로 구체화한다.",
    "- [ ] 구현 또는 측정 지표를 연결한다.",
    "- [ ] 완료 후 에이전트 회의 탭과 snapshot에 반영한다."
  ].join("\n");
}

function buildPullRequestTitle(item: ProductActionItem): string {
  return `[Agent Council] ${item.title}`;
}

function buildPullRequestBody(item: ProductActionItem, issue: GitHubIssue, branchName: string): string {
  return [
    buildPullRequestMarker(item.id),
    "",
    `Related to #${issue.number}`,
    "",
    "## Action Item",
    item.detail,
    "",
    "## Ownership",
    `- Owner: ${item.owner}`,
    `- Branch: ${branchName}`,
    `- Plan: ${buildPlanPath(item)}`,
    "",
    "## Implementation Focus",
    item.implementationFocus,
    "",
    "## Target Files",
    ...item.targetPaths.map((path) => `- ${path}`),
    "",
    "## Verification",
    ...item.verificationCommands.map((command) => `- ${command}`),
    "",
    "## Notes",
    "- This draft PR is automatically created so implementation can start from a live branch immediately.",
    "- Update the branch with real code changes and move the checklist to implementation detail as work progresses."
  ].join("\n");
}

function pullRequestState(pr: GitHubPullRequest | null): ProductActionItem["pullRequestState"] {
  if (!pr) {
    return "proposed";
  }

  if (pr.merged_at) {
    return "merged";
  }

  if (pr.state === "closed") {
    return "closed";
  }

  return pr.draft ? "draft" : "open";
}

function nonArtifactChangedFiles(item: ProductActionItem, files: GitHubPullRequestFile[]): string[] {
  const artifactPath = implementationArtifactPath(item);
  return files.map((file) => file.filename).filter((filename) => filename !== artifactPath);
}

function implementationStatus(pr: GitHubPullRequest | null, changedFiles: string[]): ProductActionItem["implementationStatus"] {
  if (pr?.merged_at) {
    return "merged";
  }

  if (pr && pr.state === "open" && !pr.draft) {
    return "reviewing";
  }

  if (changedFiles.length > 0) {
    return "in-progress";
  }

  if (pr) {
    return "ready";
  }

  return "queued";
}

function isCompletedActionItem(item: ProductActionItem): boolean {
  return item.implementationStatus === "merged" || item.issueState === "closed" || item.pullRequestState === "merged";
}

function withSyncedMetadata(
  item: ProductActionItem,
  issue: GitHubIssue | null,
  branchName: string,
  pr: GitHubPullRequest | null,
  files: GitHubPullRequestFile[]
): ProductActionItem {
  const changedFiles = nonArtifactChangedFiles(item, files);

  return {
    ...item,
    issueNumber: issue?.number ?? null,
    issueUrl: issue?.html_url ?? null,
    issueState: issue?.state ?? "proposed",
    branchName,
    pullRequestNumber: pr?.number ?? null,
    pullRequestUrl: pr?.html_url ?? null,
    pullRequestState: pullRequestState(pr),
    planPath: buildPlanPath(item),
    changedFiles,
    implementationStatus: implementationStatus(pr, changedFiles)
  };
}

async function readSnapshot(): Promise<GeneratedResearchSnapshot> {
  return JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")) as GeneratedResearchSnapshot;
}

function getRepoContext() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();

  if (!token || !repository) {
    return null;
  }

  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    return null;
  }

  return {
    token,
    owner,
    repo
  };
}

function shouldCloseStaleItems(): boolean {
  const value = process.env.RESEARCH_ISSUES_CLOSE_STALE?.trim().toLowerCase();

  if (!value) {
    return true;
  }

  return !["0", "false", "no", "off"].includes(value);
}

async function githubRequest<T>(context: NonNullable<ReturnType<typeof getRepoContext>>, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${context.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function githubRequestOptional<T>(context: NonNullable<ReturnType<typeof getRepoContext>>, path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${context.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {})
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function ensureLabels(context: NonNullable<ReturnType<typeof getRepoContext>>) {
  for (const label of LABELS) {
    try {
      await githubRequest(context, `/repos/${context.owner}/${context.repo}/labels`, {
        method: "POST",
        body: JSON.stringify(label)
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("already_exists")) {
        throw error;
      }
    }
  }
}

async function repositoryInfo(context: NonNullable<ReturnType<typeof getRepoContext>>): Promise<GitHubRepository> {
  return githubRequest<GitHubRepository>(context, `/repos/${context.owner}/${context.repo}`);
}

async function listManagedIssues(context: NonNullable<ReturnType<typeof getRepoContext>>): Promise<GitHubIssue[]> {
  const issues = await githubRequest<GitHubIssue[]>(
    context,
    `/repos/${context.owner}/${context.repo}/issues?state=all&labels=agent-council&per_page=100`
  );

  return issues.filter((issue) => !issue.pull_request && issue.body?.includes("research-action-item:"));
}

async function listManagedPullRequests(context: NonNullable<ReturnType<typeof getRepoContext>>): Promise<GitHubPullRequest[]> {
  const pulls = await githubRequest<GitHubPullRequest[]>(
    context,
    `/repos/${context.owner}/${context.repo}/pulls?state=all&per_page=100`
  );

  return pulls.filter((pull) => pull.body?.includes("research-action-pr:"));
}

async function listPullRequestFiles(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  pullRequestNumber: number
): Promise<GitHubPullRequestFile[]> {
  return githubRequest<GitHubPullRequestFile[]>(
    context,
    `/repos/${context.owner}/${context.repo}/pulls/${pullRequestNumber}/files?per_page=100`
  );
}

function findManagedIssue(issues: GitHubIssue[], itemId: string): GitHubIssue | null {
  const marker = buildIssueMarker(itemId);
  return issues.find((issue) => issue.body?.includes(marker)) ?? null;
}

function findManagedPullRequest(pulls: GitHubPullRequest[], itemId: string, branchName: string): GitHubPullRequest | null {
  const marker = buildPullRequestMarker(itemId);
  return pulls.find((pull) => pull.body?.includes(marker) || pull.head.ref === branchName) ?? null;
}

async function syncLabelsOnIssueLike(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  issueNumber: number,
  labels: string[]
) {
  await githubRequest(context, `/repos/${context.owner}/${context.repo}/issues/${issueNumber}/labels`, {
    method: "PUT",
    body: JSON.stringify(labels)
  });
}

async function updateIssueLikeState(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  issueNumber: number,
  state: "open" | "closed"
) {
  await githubRequest(context, `/repos/${context.owner}/${context.repo}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({
      state
    })
  });
}

async function updatePullRequestState(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  pullRequestNumber: number,
  state: "open" | "closed"
) {
  await githubRequest(context, `/repos/${context.owner}/${context.repo}/pulls/${pullRequestNumber}`, {
    method: "PATCH",
    body: JSON.stringify({
      state
    })
  });
}

async function upsertIssue(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  existing: GitHubIssue | null,
  item: ProductActionItem,
  workspace: ResearchWorkspaceData,
  metadata: { branchName: string; pullRequestUrl: string | null }
): Promise<GitHubIssue> {
  const body = buildIssueBody(item, workspace, metadata);
  const title = buildIssueTitle(item);

  if (!existing) {
    const created = await githubRequest<GitHubIssue>(context, `/repos/${context.owner}/${context.repo}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        labels: actionLabels(item)
      })
    });

    return created;
  }

  const updated =
    existing.title === title && existing.body === body && existing.state === "open"
      ? existing
      : await githubRequest<GitHubIssue>(context, `/repos/${context.owner}/${context.repo}/issues/${existing.number}`, {
          method: "PATCH",
          body: JSON.stringify({
            title,
            body,
            state: "open"
          })
        });

  await syncLabelsOnIssueLike(context, updated.number, actionLabels(item));
  return updated;
}

async function closeStaleIssues(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  issues: GitHubIssue[],
  activeIds: Set<string>
) {
  for (const issue of issues) {
    const marker = issue.body?.match(/research-action-item:([a-z0-9-]+)/i)?.[1];

    if (!marker || activeIds.has(marker) || issue.state === "closed") {
      continue;
    }

    await updateIssueLikeState(context, issue.number, "closed");
  }
}

async function ensureBranch(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  branchName: string,
  defaultBranch: string
): Promise<void> {
  const existing = await githubRequestOptional<GitHubRef>(context, `/repos/${context.owner}/${context.repo}/git/ref/heads/${branchName}`);

  if (existing) {
    return;
  }

  const defaultRef = await githubRequest<GitHubRef>(context, `/repos/${context.owner}/${context.repo}/git/ref/heads/${defaultBranch}`);

  await githubRequest(context, `/repos/${context.owner}/${context.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: defaultRef.object.sha
    })
  });
}

async function readContentFile(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  path: string,
  branchName: string
): Promise<GitHubContentFile | null> {
  return githubRequestOptional<GitHubContentFile>(
    context,
    `/repos/${context.owner}/${context.repo}/contents/${encodeContentPath(path)}?ref=${encodeURIComponent(branchName)}`
  );
}

async function syncPlanFile(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  item: ProductActionItem,
  issue: GitHubIssue,
  workspace: ResearchWorkspaceData,
  branchName: string
) {
  const path = buildPlanPath(item);
  const content = buildPlanFileContent(item, issue, workspace, branchName);
  const existing = await readContentFile(context, path, branchName);
  const current =
    existing?.content && existing.encoding === "base64" ? Buffer.from(existing.content.replace(/\n/g, ""), "base64").toString("utf8") : null;

  if (current === content) {
    return;
  }

  await githubRequest(context, `/repos/${context.owner}/${context.repo}/contents/${encodeContentPath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `chore: seed agent council plan for ${item.id}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: branchName,
      ...(existing?.sha ? { sha: existing.sha } : {})
    })
  });
}

async function upsertPullRequest(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  existing: GitHubPullRequest | null,
  item: ProductActionItem,
  issue: GitHubIssue,
  branchName: string,
  defaultBranch: string
): Promise<GitHubPullRequest> {
  const title = buildPullRequestTitle(item);
  const body = buildPullRequestBody(item, issue, branchName);

  if (!existing) {
    const created = await githubRequest<GitHubPullRequest>(context, `/repos/${context.owner}/${context.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        head: branchName,
        base: defaultBranch,
        draft: true
      })
    });

    await syncLabelsOnIssueLike(context, created.number, actionLabels(item));
    return created;
  }

  if (existing.state === "closed" && !existing.merged_at) {
    await updatePullRequestState(context, existing.number, "open");
  }

  const updated =
    existing.title === title && existing.body === body && existing.state === "open"
      ? existing
      : await githubRequest<GitHubPullRequest>(context, `/repos/${context.owner}/${context.repo}/pulls/${existing.number}`, {
          method: "PATCH",
          body: JSON.stringify({
            title,
            body,
            base: defaultBranch
          })
        });

  await syncLabelsOnIssueLike(context, updated.number, actionLabels(item));
  return updated;
}

async function closeStalePullRequests(
  context: NonNullable<ReturnType<typeof getRepoContext>>,
  pulls: GitHubPullRequest[],
  activeIds: Set<string>
) {
  for (const pull of pulls) {
    const marker = pull.body?.match(/research-action-pr:([a-z0-9-]+)/i)?.[1];

    if (!marker || activeIds.has(marker) || pull.state === "closed") {
      continue;
    }

    if (!pull.merged_at) {
      await updatePullRequestState(context, pull.number, "closed");
    }
  }
}

function collectCompletedActionRecords(issues: GitHubIssue[], pulls: GitHubPullRequest[]): CompletedActionRecord[] {
  const pullById = new Map<string, GitHubPullRequest>();

  for (const pull of pulls) {
    const id = parseManagedMarker(pull.body, "pr");

    if (id) {
      pullById.set(id, pull);
    }
  }

  return issues
    .map((issue) => {
      const id = parseManagedMarker(issue.body, "issue");

      if (!id || issue.state !== "closed") {
        return null;
      }

      const pull = pullById.get(id) ?? null;
      const owner = parseOwner(issue.labels);

      if (!owner || !pull?.merged_at) {
        return null;
      }

      return {
        id,
        title: issue.title.replace(/^\[Agent Council\]\s*/, ""),
        owner,
        completedAt: pull.merged_at,
        issueUrl: issue.html_url,
        pullRequestUrl: pull?.html_url ?? null
      } satisfies CompletedActionRecord;
    })
    .filter((record): record is CompletedActionRecord => Boolean(record));
}

async function persistSnapshot(snapshot: GeneratedResearchSnapshot) {
  const contractVersion = snapshot.workspace.contractVersion ?? snapshot.contractVersion ?? RESEARCH_CONTRACT_VERSION;
  const behaviorSummary = snapshot.workspace.behaviorSummary ?? createEmptyResearchBehaviorSummary();

  snapshot.workspace.contractVersion = contractVersion;
  snapshot.workspace.behaviorSummary = behaviorSummary;
  snapshot.contractVersion = contractVersion;
  snapshot.contract = snapshot.contract ?? RESEARCH_CONTRACT_METADATA;
  snapshot.markdown = renderResearchPipelineMarkdown({
    generatedAt: snapshot.workspace.generatedAt,
    preferences: snapshot.workspace.preferences,
    news: snapshot.workspace.news,
    tickerAnalyses: snapshot.workspace.tickerAnalyses,
    agentPipeline: snapshot.workspace.agentPipeline,
    productReview: snapshot.workspace.productReview,
    contractVersion,
    behaviorSummary
  });
  snapshot.workspace.agentPipeline.runtime.summaryMarkdown = snapshot.markdown;

  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.writeFile(MARKDOWN_PATH, snapshot.markdown, "utf8");
}

async function main() {
  const snapshot = await readSnapshot();
  const context = getRepoContext();
  const closeStaleItems = shouldCloseStaleItems();

  if (!context) {
    process.stdout.write("issues=skipped\nreason=GITHUB_TOKEN 또는 GITHUB_REPOSITORY가 없어 GitHub 동기화를 건너뜁니다.\n");
    return;
  }

  await ensureLabels(context);
  const repo = await repositoryInfo(context);
  const existingIssues = await listManagedIssues(context);
  const existingPulls = await listManagedPullRequests(context);
  const completedItems = snapshot.workspace.productReview.actionItems.filter(isCompletedActionItem);
  const activeItems = snapshot.workspace.productReview.actionItems.filter((item) => !isCompletedActionItem(item));
  const syncedItems: ProductActionItem[] = [...completedItems];

  for (const item of activeItems) {
    const branchName = buildBranchName(item);
    const initialIssue = await upsertIssue(context, findManagedIssue(existingIssues, item.id), item, snapshot.workspace, {
      branchName,
      pullRequestUrl: null
    });

    await ensureBranch(context, branchName, repo.default_branch);
    await syncPlanFile(context, item, initialIssue, snapshot.workspace, branchName);

    const pull = await upsertPullRequest(
      context,
      findManagedPullRequest(existingPulls, item.id, branchName),
      item,
      initialIssue,
      branchName,
      repo.default_branch
    );

    const finalIssue = await upsertIssue(context, initialIssue, item, snapshot.workspace, {
      branchName,
      pullRequestUrl: pull.html_url
    });

    const pullFiles = await listPullRequestFiles(context, pull.number);
    const syncedItem = withSyncedMetadata(item, finalIssue, branchName, pull, pullFiles);
    await syncPlanFile(context, syncedItem, finalIssue, snapshot.workspace, branchName);
    syncedItems.push(syncedItem);
  }

  if (closeStaleItems) {
    await closeStaleIssues(context, existingIssues, new Set(activeItems.map((item) => item.id)));
    await closeStalePullRequests(context, existingPulls, new Set(activeItems.map((item) => item.id)));
  }

  const [finalIssues, finalPulls, archived] = await Promise.all([
    listManagedIssues(context),
    listManagedPullRequests(context),
    readCompletedActionArchive()
  ]);
  await writeCompletedActionArchive([...archived, ...collectCompletedActionRecords(finalIssues, finalPulls)]);

  snapshot.workspace.productReview.actionItems = syncedItems;
  await persistSnapshot(snapshot);

  process.stdout.write(
    [
      `issues=synced`,
      `count=${syncedItems.length}`,
      ...syncedItems.map((item) => `${item.id}=issue:${item.issueUrl ?? "pending"}|pr:${item.pullRequestUrl ?? "pending"}`)
    ].join("\n")
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

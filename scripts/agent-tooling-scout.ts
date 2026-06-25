import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type CandidateRisk = "low" | "medium" | "high";

interface GitHubCommitSummary {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { date?: string };
  };
}

interface GitHubCommitDetail extends GitHubCommitSummary {
  files?: Array<{
    filename: string;
    status?: string;
    additions?: number;
    deletions?: number;
  }>;
}

interface ToolingCandidate {
  repo: string;
  title: string;
  url: string;
  sha: string;
  date: string;
  score: number;
  risk: CandidateRisk;
  matchedKeywords: string[];
  paths: string[];
  whyItMatters: string[];
  suggestedIssue: string;
}

const DEFAULT_REPOS = [
  "mlender-ai/simulo",
  "openai/codex",
  "anthropics/claude-code",
  "modelcontextprotocol/servers",
  "github/github-mcp-server",
  "microsoft/playwright-mcp",
];
const DEFAULT_DAYS = 21;
const MAX_COMMITS_PER_REPO = 30;
const MAX_CANDIDATES = 8;
const REPORT_DIR = "agent-tooling-reports";

const KEYWORD_WEIGHTS: Array<{ keyword: string; weight: number; reason: string }> = [
  { keyword: "agent", weight: 4, reason: "에이전트 운영 패턴 후보" },
  { keyword: "codex", weight: 5, reason: "Codex 작업 방식 업데이트 후보" },
  { keyword: "claude", weight: 3, reason: "멀티 LLM 핸드오프 비교 후보" },
  { keyword: "mcp", weight: 6, reason: "MCP 도구 확장 후보" },
  { keyword: "codebase_memory", weight: 6, reason: "코드베이스 탐색 비용 절감 후보" },
  { keyword: "headroom", weight: 6, reason: "컨텍스트/토큰 예산 관리 후보" },
  { keyword: "handoff", weight: 5, reason: "에이전트 핸드오프 규약 후보" },
  { keyword: "workflow", weight: 3, reason: "GitHub Actions 자동화 후보" },
  { keyword: "github", weight: 2, reason: "GitHub 이슈/PR 운영 후보" },
  { keyword: "issue", weight: 2, reason: "이슈 생성/정리 자동화 후보" },
  { keyword: "qa", weight: 3, reason: "품질 검수 자동화 후보" },
  { keyword: "security", weight: 5, reason: "보안/grounding 가드 후보" },
  { keyword: "grounding", weight: 5, reason: "근거 기반 출력 가드 후보" },
  { keyword: "ci", weight: 3, reason: "CI 안정화 후보" },
  { keyword: "tooling", weight: 4, reason: "개발 도구 개선 후보" }
];

const PATH_WEIGHTS: Array<{ pattern: RegExp; weight: number; reason: string }> = [
  { pattern: /^\.github\/workflows\//, weight: 5, reason: "워크플로 자동화 변경" },
  { pattern: /^scripts\/agents?\//, weight: 5, reason: "에이전트 스크립트 변경" },
  { pattern: /^scripts\//, weight: 3, reason: "운영 스크립트 변경" },
  { pattern: /AGENTS\.md$/, weight: 5, reason: "에이전트 규칙 변경" },
  { pattern: /CLAUDE\.md$/, weight: 3, reason: "LLM 핸드오프 규칙 변경" },
  { pattern: /SECURITY/i, weight: 5, reason: "보안 체크리스트 변경" },
  { pattern: /package\.json$/, weight: 2, reason: "도구 의존성 또는 명령 변경" }
];

const EXCLUDED_CHANGE_PATTERNS = [
  /자동\s*이슈\s*생성\s*중단/i,
  /schedule\s*트리거\s*제거/i,
  /\bdisable[ds]?\b.*\b(workflow|cron|schedule|issue|agent)s?\b/i,
  /\bremove[sd]?\b.*\b(workflow|cron|schedule|issue|agent)s?\b/i,
  /\bdelete[sd]?\b.*\b(workflow|cron|schedule|issue|agent)s?\b/i,
  /\bstop(?:ped|ping)?\b.*\b(workflow|cron|schedule|issue|agent)s?\b/i,
];

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseRepos(value: string | undefined): string[] {
  const repos = (value ?? DEFAULT_REPOS.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return repos.filter((repo) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo));
}

function parseDays(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 90) {
    return DEFAULT_DAYS;
  }
  return Math.floor(parsed);
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function githubRequest<T>(apiPath: string): Promise<T> {
  const token = env("GITHUB_TOKEN") ?? env("GH_TOKEN");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "fomo-club-agent-tooling-scout"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com${apiPath}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}) for ${apiPath}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function cleanSubject(message: string): string {
  return message.split("\n")[0]?.replace(/\s+/g, " ").trim() || "제목 없는 변경";
}

function scoreCommit(detail: GitHubCommitDetail): ToolingCandidate | null {
  const files = detail.files ?? [];
  const paths = files.map((file) => file.filename);
  const searchable = `${detail.commit.message}\n${paths.join("\n")}`.toLowerCase();
  if (EXCLUDED_CHANGE_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return null;
  }

  const matchedKeywords: string[] = [];
  const whyItMatters: string[] = [];
  let score = 0;

  for (const item of KEYWORD_WEIGHTS) {
    if (searchable.includes(item.keyword.toLowerCase())) {
      matchedKeywords.push(item.keyword);
      whyItMatters.push(item.reason);
      score += item.weight;
    }
  }

  for (const item of PATH_WEIGHTS) {
    if (paths.some((candidatePath) => item.pattern.test(candidatePath))) {
      score += item.weight;
      whyItMatters.push(item.reason);
    }
  }

  if (score < 7) {
    return null;
  }

  const risk = assessRisk(detail);
  const subject = cleanSubject(detail.commit.message);
  const repo = env("CURRENT_SCOUT_REPO") ?? "unknown";

  return {
    repo,
    title: subject,
    url: detail.html_url,
    sha: detail.sha.slice(0, 12),
    date: detail.commit.author?.date ?? "unknown",
    score,
    risk,
    matchedKeywords: unique(matchedKeywords),
    paths: paths.slice(0, 8),
    whyItMatters: unique(whyItMatters).slice(0, 5),
    suggestedIssue: buildSuggestedIssue(subject, risk)
  };
}

function assessRisk(detail: GitHubCommitDetail): CandidateRisk {
  const text = `${detail.commit.message}\n${(detail.files ?? []).map((file) => file.filename).join("\n")}`.toLowerCase();
  if (/(secret|token|auth|permission|deploy|production|billing|payment)/.test(text)) {
    return "high";
  }
  if (/(package\.json|lock|dependency|workflow|mcp|api)/.test(text)) {
    return "medium";
  }
  return "low";
}

function buildSuggestedIssue(subject: string, risk: CandidateRisk): string {
  const approval = risk === "high" ? "보안/권한 리스크를 먼저 확인한 뒤" : "작은 PR로";
  return `${approval} '${subject}' 변경에서 FOMO Club 에이전트 운영에 재사용할 수 있는 부분만 검토한다. 제품 아이디어 자동 생성이나 투자 판단 로직은 범위에서 제외한다.`;
}

async function collectRepoCandidates(repo: string, days: number): Promise<ToolingCandidate[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const commits = await githubRequest<GitHubCommitSummary[]>(
    `/repos/${repo}/commits?per_page=${MAX_COMMITS_PER_REPO}&since=${encodeURIComponent(since)}`
  );
  const candidates: ToolingCandidate[] = [];

  for (const commit of commits) {
    process.env.CURRENT_SCOUT_REPO = repo;
    const detail = await githubRequest<GitHubCommitDetail>(`/repos/${repo}/commits/${commit.sha}`);
    const candidate = scoreCommit(detail);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  delete process.env.CURRENT_SCOUT_REPO;
  return candidates;
}

function sortCandidates(candidates: ToolingCandidate[]): ToolingCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.risk !== b.risk) return riskRank(a.risk) - riskRank(b.risk);
    return `${a.repo}:${a.sha}`.localeCompare(`${b.repo}:${b.sha}`);
  });
}

function riskRank(risk: CandidateRisk): number {
  return risk === "low" ? 0 : risk === "medium" ? 1 : 2;
}

function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function renderReport(params: {
  repos: string[];
  days: number;
  candidates: ToolingCandidate[];
  errors: string[];
  generatedAt: string;
}): string {
  const localHead = git(["rev-parse", "--short", "HEAD"]);
  const localBranch = git(["branch", "--show-current"]);
  const recentLocal = git(["log", "--oneline", "-5"]);
  const topCandidates = sortCandidates(params.candidates).slice(0, MAX_CANDIDATES);
  const generatedDateKst = kstDate(new Date(params.generatedAt));

  return [
    "# Agent Tooling Scout Report",
    "",
    `- Generated At: ${params.generatedAt}`,
    `- Generated Date (KST): ${generatedDateKst}`,
    `- Local Branch: ${localBranch}`,
    `- Local Head: ${localHead}`,
    `- Lookback: ${params.days} days`,
    `- Source Repos: ${params.repos.join(", ")}`,
    "",
    "## Guardrails",
    "- 이 리포트는 에이전트/툴링 업데이트 후보만 다룬다.",
    "- 제품 아이디어 자동 생성, 종목 추천, 매수/매도/목표가/예측 로직은 범위 밖이다.",
    "- 자동 구현은 하지 않는다. 후보는 이슈로 남기고, 광혁 리뷰 후 별도 PR로 진행한다.",
    "- 외부 코드 도입 전 AGENTS.md, SECURITY_CHECKLIST, DATA_ENGINE_STRATEGY §8을 다시 확인한다.",
    "",
    "## Local Context",
    "```text",
    recentLocal || "(recent git log unavailable)",
    "```",
    "",
    "## Candidates",
    topCandidates.length === 0 ? "최근 기간 안에 기준을 넘긴 툴링 후보가 없어요." : "",
    ...topCandidates.flatMap((candidate, index) => renderCandidate(candidate, index + 1)),
    "",
    "## Collection Errors",
    params.errors.length === 0 ? "- 없음" : params.errors.map((error) => `- ${error}`).join("\n"),
    "",
    "## Next Step",
    "- `needs-ceo-review` 라벨이 붙은 이슈에서 채택 여부를 결정한다.",
    "- 채택된 항목만 별도 구현 이슈/PR로 넘긴다.",
    "- MCP/권한/외부 네트워크가 필요한 변경은 먼저 보안 체크리스트를 통과한다."
  ].join("\n");
}

function renderCandidate(candidate: ToolingCandidate, index: number): string[] {
  return [
    `### ${index}. ${candidate.title}`,
    `- Source: [${candidate.repo}@${candidate.sha}](${candidate.url})`,
    `- Date: ${candidate.date}`,
    `- Score: ${candidate.score}`,
    `- Risk: ${candidate.risk}`,
    `- Matched: ${candidate.matchedKeywords.join(", ") || "n/a"}`,
    `- Why: ${candidate.whyItMatters.join(" / ") || "n/a"}`,
    `- Suggested Issue: ${candidate.suggestedIssue}`,
    "- Paths:",
    ...(candidate.paths.length > 0 ? candidate.paths.map((item) => `  - ${item}`) : ["  - n/a"]),
    ""
  ];
}

async function main(): Promise<void> {
  const repos = parseRepos(env("TOOLING_SCOUT_REPOS"));
  const days = parseDays(env("TOOLING_SCOUT_DAYS"));
  const generatedAt = new Date().toISOString();
  const candidates: ToolingCandidate[] = [];
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      candidates.push(...(await collectRepoCandidates(repo, days)));
    } catch (error) {
      errors.push(`${repo}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const report = renderReport({ repos, days, candidates, errors, generatedAt });
  const date = kstDate(new Date(generatedAt));
  const outputDir = path.resolve(process.cwd(), REPORT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `tooling-scout-${date}.md`), report);
  await fs.writeFile(path.join(outputDir, "latest.md"), report);

  console.log(`Agent tooling scout wrote ${sortCandidates(candidates).slice(0, MAX_CANDIDATES).length} candidate(s).`);
  console.log(path.join(REPORT_DIR, "latest.md"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

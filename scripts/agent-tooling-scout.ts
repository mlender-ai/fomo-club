import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type ApplicationIdea = "검토만" | "PoC 후보" | "바로 도입 후보";
type CandidateSource = "seed" | "search";

interface GitHubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at?: string;
  archived: boolean;
  topics?: string[];
}

interface GitHubSearchResponse {
  items: GitHubRepo[];
}

interface ScoreBreakdown {
  trust: number;
  fit: number;
  directness: number;
  recency: number;
}

interface ToolingCandidate {
  fullName: string;
  url: string;
  description: string;
  stars: number;
  updatedAt: string;
  topics: string[];
  source: CandidateSource;
  sourceLabel: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  matchedSignals: string[];
  whyItMatters: string;
  applicationIdea: ApplicationIdea;
  risk: string;
}

interface ScoutSummary {
  generatedAt: string;
  generatedDateKst: string;
  candidateCount: number;
  primary?: Pick<ToolingCandidate, "fullName" | "url" | "stars" | "score">;
  runnerUp?: Pick<ToolingCandidate, "fullName" | "url" | "stars" | "score">;
  errors: string[];
}

const DEFAULT_SEED_REPOS = [
  "NVIDIA/SkillSpector",
  "openai/codex",
  "anthropics/claude-code",
  "github/github-mcp-server",
  "modelcontextprotocol/servers",
  "microsoft/playwright-mcp"
];

const DEFAULT_SEARCH_QUERIES = [
  "agent skills security scanner",
  "claude code skills",
  "codex agent tooling",
  "mcp agent workflow",
  "ai agent security"
];

const DEFAULT_UPDATED_DAYS = 60;
const DEFAULT_MIN_STARS = 1000;
const MAX_SEARCH_ITEMS_PER_QUERY = 10;
const STRONG_SEED_MIN_SCORE = 65;
const RUNNER_UP_MAX_SCORE_GAP = 8;
const REPORT_DIR = "agent-tooling-reports";

/**
 * 카테고리 풀 — ISO 주차로 로테이션해 매주 다른 축을 탐색한다(반복 후보 방지).
 * env(TOOLING_SCOUT_SEED_REPOS/SEARCH_QUERIES) 가 오면 그게 우선(수동 dispatch).
 */
const CATEGORY_POOL: Array<{ key: string; label: string; seeds: string[]; queries: string[] }> = [
  { key: "agent-skills", label: "에이전트·스킬", seeds: ["anthropics/claude-code", "openai/codex", "github/github-mcp-server"], queries: ["claude code skills", "codex agent tooling", "ai coding agent skills"] },
  { key: "mcp-tooling", label: "MCP·워크플로우", seeds: ["modelcontextprotocol/servers", "microsoft/playwright-mcp"], queries: ["mcp server tooling", "model context protocol", "mcp agent workflow"] },
  { key: "spec-driven", label: "스펙주도·평가", seeds: ["github/spec-kit"], queries: ["spec driven development ai", "llm eval framework", "ai coding spec workflow"] },
  { key: "tech-debt-scalability", label: "기술부채·확장성", seeds: [], queries: ["typescript monorepo tooling", "codebase refactor automation", "dependency upgrade bot", "code migration tool"] },
  { key: "testing-observability", label: "테스트·관측", seeds: [], queries: ["llm observability tracing", "ai evaluation framework", "prompt regression testing", "playwright ai testing"] },
];

/** ISO 주차(월요일 시작). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

export function pickCategory(date: Date, override?: string): (typeof CATEGORY_POOL)[number] {
  const found = override ? CATEGORY_POOL.find((c) => c.key === override) : undefined;
  return found ?? CATEGORY_POOL[isoWeek(date) % CATEGORY_POOL.length]!;
}

/** dedup 메모리 — 과거 스카우트 이슈(open+closed) 본문에서 제안된 repo 를 뽑아 재제안 제외. */
export function proposedReposFromIssues(bodies: Array<string | undefined | null>): Set<string> {
  const out = new Set<string>();
  for (const body of bodies) {
    for (const m of (body ?? "").matchAll(/github\.com\/([\w.-]+\/[\w.-]+)/gi)) {
      out.add(m[1]!.toLowerCase().replace(/[).,]+$/, ""));
    }
  }
  return out;
}

async function fetchProposedRepos(errors: string[]): Promise<Set<string>> {
  const repo = env("GITHUB_REPOSITORY");
  if (!repo) return new Set(); // 로컬/토큰 없음 → dedup 생략
  try {
    const issues = await githubRequest<Array<{ body?: string }>>(
      `/repos/${repo}/issues?labels=tooling-scout&state=all&per_page=100`
    );
    return proposedReposFromIssues(issues.map((i) => i.body));
  } catch (error) {
    errors.push(`dedup skip: ${(error as Error).message}`);
    return new Set();
  }
}

const FIT_SIGNALS: Array<{ pattern: RegExp; points: number; label: string }> = [
  { pattern: /\bagents?\b/i, points: 18, label: "agent" },
  { pattern: /\bskills?\b/i, points: 18, label: "skill" },
  { pattern: /\bmcp\b|modelcontextprotocol/i, points: 18, label: "mcp" },
  { pattern: /\bcodex\b/i, points: 15, label: "codex" },
  { pattern: /\bclaude\b/i, points: 12, label: "claude" },
  { pattern: /\btool(?:ing)?s?\b/i, points: 10, label: "tooling" },
  { pattern: /\bworkflow\b|\bautomation\b/i, points: 10, label: "workflow" },
  { pattern: /\bcontext\b|\bmemory\b/i, points: 8, label: "context" },
  { pattern: /\beval(?:uation)?s?\b|\bbench(?:mark)?s?\b/i, points: 8, label: "evaluation" }
];

const DIRECT_SIGNALS: Array<{ pattern: RegExp; points: number; label: string }> = [
  { pattern: /\bsecurity\b|\bvulnerabilit(?:y|ies)\b|\bmalicious\b/i, points: 26, label: "security" },
  { pattern: /\bscanner\b|\bscan\b|\baudit\b/i, points: 22, label: "scanner" },
  { pattern: /\bmonitor(?:ing)?\b|\bobservability\b/i, points: 16, label: "monitoring" },
  { pattern: /\bissue\b|\bgithub\b|\bpull request\b|\bpr\b/i, points: 14, label: "github-ops" },
  { pattern: /\bworkflow\b|\bautomation\b|\bci\b/i, points: 12, label: "workflow-automation" },
  { pattern: /\bskills?\b|\bmcp\b/i, points: 18, label: "skill-management" }
];

const EXCLUDED_REPO_PATTERNS = [
  /\b(product|startup|business)\s+ideas?\b/i,
  /\bidea\s+generator\b/i,
  /\btrading\b|\bstocks?\b|\bcrypto\b|\bforex\b|\bprediction\b|\bprice\s+target\b/i,
  /\bbuy\b.*\bsell\b|\bsell\b.*\bbuy\b/i,
  /\bschedule\b.*\b(disable|remove|stop)\b/i,
  /\b(disable|remove|stop)\b.*\b(schedule|automation|workflow)\b/i
];

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  return unique(
    (value ?? fallback.join(","))
      .split(/[,|\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) {
    return fallback;
  }
  return Math.floor(parsed);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
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

async function fetchSeedRepos(seedRepos: string[], errors: string[]): Promise<Array<{ repo: GitHubRepo; sourceLabel: string }>> {
  const repos: Array<{ repo: GitHubRepo; sourceLabel: string }> = [];

  for (const fullName of seedRepos) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
      errors.push(`${fullName}: 잘못된 seed repo 형식`);
      continue;
    }

    try {
      const repo = await githubRequest<GitHubRepo>(`/repos/${fullName}`);
      repos.push({ repo, sourceLabel: "curated seed" });
    } catch (error) {
      errors.push(`${fullName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return repos;
}

async function searchRepos(queries: string[], minStars: number, errors: string[]): Promise<Array<{ repo: GitHubRepo; sourceLabel: string }>> {
  const repos: Array<{ repo: GitHubRepo; sourceLabel: string }> = [];

  for (const query of queries) {
    const q = `${query} stars:>=${minStars} archived:false`;
    try {
      const response = await githubRequest<GitHubSearchResponse>(
        `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${MAX_SEARCH_ITEMS_PER_QUERY}`
      );
      repos.push(...response.items.map((repo) => ({ repo, sourceLabel: `search: ${query}` })));
    } catch (error) {
      errors.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return repos;
}

function isFresh(updatedAt: string, updatedDays: number): boolean {
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated <= updatedDays * 24 * 60 * 60 * 1000;
}

function normalizedText(repo: GitHubRepo): string {
  return [repo.full_name, repo.description ?? "", ...(repo.topics ?? [])].join(" ");
}

function shouldExclude(repo: GitHubRepo): boolean {
  const text = normalizedText(repo);
  return EXCLUDED_REPO_PATTERNS.some((pattern) => pattern.test(text));
}

function scoreRepo(repo: GitHubRepo, source: CandidateSource, sourceLabel: string): ToolingCandidate | null {
  const text = normalizedText(repo);
  const matchedSignals: string[] = [];

  const trust = Math.min(100, Math.round((Math.log10(repo.stargazers_count + 1) / 5) * 100));
  const fit = Math.min(100, FIT_SIGNALS.reduce((sum, signal) => {
    if (!signal.pattern.test(text)) return sum;
    matchedSignals.push(signal.label);
    return sum + signal.points;
  }, source === "seed" ? 10 : 0));
  const directness = Math.min(100, DIRECT_SIGNALS.reduce((sum, signal) => {
    if (!signal.pattern.test(text)) return sum;
    matchedSignals.push(signal.label);
    return sum + signal.points;
  }, 0));
  const recency = recencyScore(repo.updated_at);
  const score = Math.round(trust * 0.35 + fit * 0.35 + directness * 0.2 + recency * 0.1);

  if (fit < 25 || directness < 12 || score < 45) {
    return null;
  }

  return {
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description?.replace(/\s+/g, " ").trim() || "설명 없음",
    stars: repo.stargazers_count,
    updatedAt: repo.updated_at,
    topics: repo.topics ?? [],
    source,
    sourceLabel,
    score,
    scoreBreakdown: { trust, fit, directness, recency },
    matchedSignals: unique(matchedSignals).slice(0, 8),
    whyItMatters: buildWhyItMatters(repo),
    applicationIdea: applicationIdea(score, directness),
    risk: assessRisk(repo)
  };
}

function recencyScore(updatedAt: string): number {
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return 0;
  const ageDays = (Date.now() - updated) / (24 * 60 * 60 * 1000);
  if (ageDays <= 7) return 100;
  if (ageDays <= 30) return 80;
  if (ageDays <= 60) return 60;
  return 0;
}

function buildWhyItMatters(repo: GitHubRepo): string {
  const text = normalizedText(repo).toLowerCase();

  if (/\bsecurity\b|\bscanner\b|\bvulnerabilit/.test(text)) {
    return "에이전트 스킬과 외부 도구를 도입하기 전에 악성 패턴과 권한 리스크를 먼저 걸러낼 수 있다.";
  }
  if (/\bmcp\b|modelcontextprotocol/.test(text)) {
    return "에이전트가 실제로 호출하는 도구 표준과 서버 운영 방식을 정리하는 데 바로 참고할 수 있다.";
  }
  if (/\bcodex\b|\bclaude\b|\bskills?\b/.test(text)) {
    return "Codex/Claude 기반 작업 규칙, 스킬 관리, 핸드오프 품질을 개선할 후보로 검토할 가치가 있다.";
  }
  return "FOMO Club 에이전트 운영 자동화와 툴링 검토 기준을 높이는 데 참고할 수 있다.";
}

function applicationIdea(score: number, directness: number): ApplicationIdea {
  if (score >= 78 && directness >= 55) return "바로 도입 후보";
  if (score >= 62) return "PoC 후보";
  return "검토만";
}

function assessRisk(repo: GitHubRepo): string {
  const text = normalizedText(repo).toLowerCase();
  if (/\bsecurity\b|\bscanner\b|\baudit\b|\bmcp\b/.test(text)) {
    return "외부 코드 실행, 권한 범위, 스캔 대상 파일 노출 여부를 먼저 확인해야 한다.";
  }
  if (/\bgithub\b|\bworkflow\b|\bautomation\b/.test(text)) {
    return "GitHub 토큰 권한과 이슈/PR 자동 변경 범위를 제한해야 한다.";
  }
  return "도입 가치 대비 유지보수 비용과 의존성 지속성을 확인해야 한다.";
}

function collectSelectedCandidates(candidates: ToolingCandidate[]): ToolingCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.stars !== a.stars) return b.stars - a.stars;
    return a.fullName.localeCompare(b.fullName);
  });
  const strongSeed = sorted.find((candidate) => candidate.source === "seed" && candidate.score >= STRONG_SEED_MIN_SCORE);
  const primary = strongSeed ?? sorted[0];
  if (!primary) return [];

  const runnerUp = sorted.find((candidate) => candidate.fullName !== primary.fullName);
  if (!runnerUp) return [primary];

  const scoreGap = Math.abs(primary.score - runnerUp.score);
  const isStrongSeed = runnerUp.source === "seed" && runnerUp.score >= 70;
  return scoreGap <= RUNNER_UP_MAX_SCORE_GAP || isStrongSeed ? [primary, runnerUp] : [primary];
}

function renderReport(params: {
  category: string;
  seedRepos: string[];
  searchQueries: string[];
  updatedDays: number;
  minStars: number;
  selectedCandidates: ToolingCandidate[];
  errors: string[];
  generatedAt: string;
}): string {
  const generatedDateKst = kstDate(new Date(params.generatedAt));
  const [primary, runnerUp] = params.selectedCandidates;

  return [
    "# 이번 주 에이전트·생태계 툴링 후보",
    "",
    `- 생성일(KST): ${generatedDateKst}`,
    `- 이번 주 카테고리(로테이션): ${params.category}`,
    `- 기준: stars ${params.minStars.toLocaleString("en-US")}개 이상, 최근 ${params.updatedDays}일 내 업데이트, archived 제외, 과거 제안 repo 제외(dedup)`,
    `- 로컬 기준: ${git(["branch", "--show-current"])}@${git(["rev-parse", "--short", "HEAD"])}`,
    "",
    "## 오늘의 1순위",
    primary ? renderCandidate(primary) : "오늘 기준을 넘긴 후보가 없습니다.",
    "",
    ...(runnerUp ? ["## 보조 후보", renderCandidate(runnerUp), ""] : []),
    "## 다음 액션",
    "- 채택: 별도 구현 이슈/PR로 넘긴다.",
    "- 보류: 다음 스카우트에서 더 강한 후보가 나올 때까지 기다린다.",
    "- 제외: 권한/보안/유지보수 리스크가 크면 같은 후보를 다시 뽑지 않도록 제외 기준에 반영한다.",
    "",
    "## 운영 가드레일",
    "- 자동 구현은 하지 않고 후보 발굴과 검토 이슈 생성까지만 한다.",
    "- 제품 아이디어 생성, 투자 판단, 매매, 예측 도구는 제외한다.",
    "- 후보가 없으면 이슈를 만들지 않고 Actions 로그에만 남긴다.",
    "",
    "## 수집 정보",
    `- Seed: ${params.seedRepos.join(", ")}`,
    `- Search: ${params.searchQueries.join(" / ")}`,
    `- 오류: ${params.errors.length === 0 ? "없음" : params.errors.join(" | ")}`
  ].join("\n");
}

function renderCandidate(candidate: ToolingCandidate): string {
  return [
    `- 레포: [${candidate.fullName}](${candidate.url})`,
    `- stars: ${candidate.stars.toLocaleString("en-US")}`,
    `- 설명: ${candidate.description}`,
    `- 왜 필요한가: ${candidate.whyItMatters}`,
    `- 적용 아이디어: ${candidate.applicationIdea}`,
    `- 리스크: ${candidate.risk}`,
    `- 점수: ${candidate.score} (신뢰 ${candidate.scoreBreakdown.trust}, 적합도 ${candidate.scoreBreakdown.fit}, 직접성 ${candidate.scoreBreakdown.directness}, 최근성 ${candidate.scoreBreakdown.recency})`,
    `- 근거: ${candidate.sourceLabel}; ${candidate.matchedSignals.join(", ") || "n/a"}; updated ${candidate.updatedAt.slice(0, 10)}`
  ].join("\n");
}

function buildSummary(generatedAt: string, selectedCandidates: ToolingCandidate[], errors: string[]): ScoutSummary {
  const [primary, runnerUp] = selectedCandidates;
  return {
    generatedAt,
    generatedDateKst: kstDate(new Date(generatedAt)),
    candidateCount: selectedCandidates.length,
    primary: primary ? pickSummary(primary) : undefined,
    runnerUp: runnerUp ? pickSummary(runnerUp) : undefined,
    errors
  };
}

function pickSummary(candidate: ToolingCandidate): Pick<ToolingCandidate, "fullName" | "url" | "stars" | "score"> {
  return {
    fullName: candidate.fullName,
    url: candidate.url,
    stars: candidate.stars,
    score: candidate.score
  };
}

async function main(): Promise<void> {
  const category = pickCategory(new Date(), env("TOOLING_SCOUT_CATEGORY"));
  const seedRepos = parseList(env("TOOLING_SCOUT_SEED_REPOS") ?? env("TOOLING_SCOUT_REPOS"), category.seeds.length ? category.seeds : DEFAULT_SEED_REPOS);
  const searchQueries = parseList(env("TOOLING_SCOUT_SEARCH_QUERIES"), category.queries.length ? category.queries : DEFAULT_SEARCH_QUERIES);
  const updatedDays = parsePositiveInt(env("TOOLING_SCOUT_UPDATED_DAYS") ?? env("TOOLING_SCOUT_DAYS"), DEFAULT_UPDATED_DAYS, 120);
  const minStars = parsePositiveInt(env("TOOLING_SCOUT_MIN_STARS"), DEFAULT_MIN_STARS, 1_000_000);
  const generatedAt = new Date().toISOString();
  const errors: string[] = [];

  const seedResults = await fetchSeedRepos(seedRepos, errors);
  const searchResults = await searchRepos(searchQueries, minStars, errors);
  const byRepo = new Map<string, { repo: GitHubRepo; source: CandidateSource; sourceLabel: string }>();

  for (const item of seedResults) {
    byRepo.set(item.repo.full_name.toLowerCase(), { repo: item.repo, source: "seed", sourceLabel: item.sourceLabel });
  }

  for (const item of searchResults) {
    const key = item.repo.full_name.toLowerCase();
    if (!byRepo.has(key)) {
      byRepo.set(key, { repo: item.repo, source: "search", sourceLabel: item.sourceLabel });
    }
  }

  const candidates = [...byRepo.values()]
    .filter(({ repo }) => !repo.archived)
    .filter(({ repo }) => repo.stargazers_count >= minStars)
    .filter(({ repo }) => isFresh(repo.updated_at, updatedDays))
    .filter(({ repo }) => !shouldExclude(repo))
    .map(({ repo, source, sourceLabel }) => scoreRepo(repo, source, sourceLabel))
    .filter((candidate): candidate is ToolingCandidate => Boolean(candidate));

  const proposed = await fetchProposedRepos(errors);
  const freshCandidates = candidates.filter((candidate) => !proposed.has(candidate.fullName.toLowerCase()));
  const selectedCandidates = collectSelectedCandidates(freshCandidates);
  const report = renderReport({ category: category.label, seedRepos, searchQueries, updatedDays, minStars, selectedCandidates, errors, generatedAt });
  const summary = buildSummary(generatedAt, selectedCandidates, errors);
  const date = kstDate(new Date(generatedAt));
  const outputDir = path.resolve(process.cwd(), REPORT_DIR);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `tooling-scout-${date}.md`), report);
  await fs.writeFile(path.join(outputDir, "latest.md"), report);
  await fs.writeFile(path.join(outputDir, `tooling-scout-${date}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "latest.json"), `${JSON.stringify(summary, null, 2)}\n`);

  if (selectedCandidates.length === 0) {
    console.log("오늘 후보 없음");
  } else {
    console.log(`Agent tooling scout wrote ${selectedCandidates.length} candidate(s): ${selectedCandidates.map((item) => item.fullName).join(", ")}`);
  }
  console.log(path.join(REPORT_DIR, "latest.md"));
}

if (process.env["TOOLING_SCOUT_TEST"] !== "1") {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

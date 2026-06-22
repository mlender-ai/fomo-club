const GITHUB_PAT = process.env.GITHUB_PAT;
const REPO = process.env.GITHUB_REPO || "mlender-ai/fomo-club";

/**
 * GitHub 응답을 안전하게 파싱.
 * workflow dispatch 등 일부 엔드포인트는 성공 시 204 No Content(빈 본문)를 반환한다.
 * 그때 res.json() 을 부르면 "Unexpected end of JSON input" 으로 터지므로
 * 204/205/빈 본문은 null 을 반환한다. (순수 함수 — vitest 로 검증)
 */
export async function parseGitHubResponse(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return null;
  const text = await res.text();
  if (!text || !text.trim()) return null;
  return JSON.parse(text);
}

async function githubApi(path: string, options?: RequestInit) {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not configured");

  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  return parseGitHubResponse(res);
}

export async function triggerWorkflow(
  workflow: string,
  inputs: Record<string, string> = {}
) {
  return githubApi(`/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs }),
  });
}

export async function getOpenPRs(limit = 10) {
  return githubApi(
    `/repos/${REPO}/pulls?state=open&per_page=${limit}&sort=created&direction=desc`
  );
}

export async function getCEOBriefIssues(limit = 3) {
  return githubApi(
    `/repos/${REPO}/issues?labels=ceo-brief&state=open&per_page=${limit}&sort=created&direction=desc`
  );
}

export async function addLabel(issueNumber: number, labels: string[]) {
  return githubApi(`/repos/${REPO}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels }),
  });
}

export async function addIssueComment(issueNumber: number, body: string) {
  return githubApi(`/repos/${REPO}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function mergePR(prNumber: number) {
  return githubApi(`/repos/${REPO}/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
}

export async function getWorkflowRuns(workflow: string, limit = 3) {
  return githubApi(
    `/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=${limit}`
  );
}

export async function getPRByBranch(branch: string) {
  const owner = REPO.split("/")[0] ?? "";
  return githubApi(
    `/repos/${REPO}/pulls?head=${encodeURIComponent(owner)}:${encodeURIComponent(branch)}&state=open`
  );
}

export async function getPRFiles(prNumber: number) {
  return githubApi(`/repos/${REPO}/pulls/${prNumber}/files`);
}

export async function getMergedPRs(since: string, limit = 20) {
  return githubApi(
    `/repos/${REPO}/pulls?state=closed&per_page=${limit}&sort=updated&direction=desc`
  ).then((v) =>
    (v as Array<{ merged_at: string | null; [key: string]: unknown }>).filter(
      (pr) => pr.merged_at && pr.merged_at > since
    )
  );
}

// ── Step 1 (읽기 천장): 본문 조회 함수 ──────────────────────────────

/** 가장 최근 ceo-brief 이슈 1건의 본문 전문 (state=all — 닫힌 과거 브리핑도 포함). */
export async function getLatestCEOBrief(): Promise<{
  number: number;
  title: string;
  body: string;
} | null> {
  const issues = (await githubApi(
    `/repos/${REPO}/issues?labels=ceo-brief&state=all&per_page=1&sort=created&direction=desc`
  )) as { number: number; title: string; body: string | null }[];
  const top = issues[0];
  if (!top) return null;
  return { number: top.number, title: top.title, body: top.body ?? "" };
}

/** 특정 이슈의 본문 + 최근 코멘트. */
export async function getIssue(n: number): Promise<{
  number: number;
  title: string;
  body: string;
  comments: string[];
}> {
  const issue = (await githubApi(`/repos/${REPO}/issues/${n}`)) as {
    number: number;
    title: string;
    body: string | null;
  };
  let comments: string[] = [];
  try {
    const c = (await githubApi(
      `/repos/${REPO}/issues/${n}/comments?per_page=10`
    )) as { body: string | null }[];
    comments = c.map((x) => x.body ?? "").filter((b) => b.length > 0);
  } catch {
    comments = [];
  }
  return { number: issue.number, title: issue.title, body: issue.body ?? "", comments };
}

/** 특정 PR 의 본문 + 상태 + 변경 파일 목록. */
export async function getPR(n: number): Promise<{
  number: number;
  title: string;
  body: string;
  state: string;
  merged: boolean;
  files: string[];
}> {
  const pr = (await githubApi(`/repos/${REPO}/pulls/${n}`)) as {
    number: number;
    title: string;
    body: string | null;
    state: string;
    merged?: boolean;
  };
  let files: string[] = [];
  try {
    const f = (await getPRFiles(n)) as { filename: string }[];
    files = f.map((x) => x.filename);
  } catch {
    files = [];
  }
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body ?? "",
    state: pr.state,
    merged: pr.merged ?? false,
    files,
  };
}

// ── 벌크 액션 지원: PR 머지 가능 여부 / 이슈 닫기 / 해결된 이슈 탐지 ──

/** PR 머지 가능 상태 — mergeable_state("clean"=CI통과+충돌없음)·draft 여부. */
export async function getPRMergeability(n: number): Promise<{
  number: number;
  title: string;
  draft: boolean;
  mergeableState: string;
  htmlUrl: string;
}> {
  const pr = (await githubApi(`/repos/${REPO}/pulls/${n}`)) as {
    number: number;
    title: string;
    draft?: boolean;
    mergeable_state?: string;
    html_url?: string;
  };
  return {
    number: pr.number,
    title: pr.title,
    draft: pr.draft ?? false,
    mergeableState: pr.mergeable_state ?? "unknown",
    htmlUrl: pr.html_url ?? "",
  };
}

/** 이슈 닫기 (선택적 코멘트 먼저). */
export async function closeIssue(n: number, comment?: string): Promise<void> {
  if (comment) {
    try {
      await addIssueComment(n, comment);
    } catch (e) {
      console.warn(`closeIssue comment failed #${n}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await githubApi(`/repos/${REPO}/issues/${n}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

/** close_all 시에도 보존하는 보호 라벨 — 봇 운영 메모리(롤링 피드백 로그 등). */
const PROTECTED_LABELS = new Set(["feedback-log"]);

/**
 * 열린 이슈를 전부 닫는다 (머지 해결 여부 무관 — "이슈탭 전부 닫아").
 * - PR 은 제외 (issues API 가 PR 도 함께 반환하므로 pull_request 필드로 거름).
 * - 보호 라벨(feedback-log) 이슈는 봇 메모리라 보존.
 * - 페이지네이션으로 100개 초과도 모두 처리.
 */
export async function closeAllOpenIssues(): Promise<{
  closed: number[];
  protectedSkipped: number[];
}> {
  const closed: number[] = [];
  const protectedSkipped: number[] = [];
  for (let page = 1; page <= 10; page++) {
    const issues = (await githubApi(
      `/repos/${REPO}/issues?state=open&per_page=100&page=${page}&sort=created&direction=desc`
    )) as Array<{
      number: number;
      pull_request?: unknown;
      labels?: ({ name: string } | string)[];
    }>;
    if (!issues.length) break;
    for (const it of issues) {
      if (it.pull_request) continue; // PR 제외
      const labels = (it.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
      if (labels.some((l) => PROTECTED_LABELS.has(l))) {
        protectedSkipped.push(it.number);
        continue;
      }
      try {
        await closeIssue(it.number, "🗂️ CEO 지시로 일괄 close.");
        closed.push(it.number);
      } catch (e) {
        console.warn(`closeAllOpenIssues #${it.number} 실패: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (issues.length < 100) break;
  }
  return { closed, protectedSkipped };
}

/** 최근 머지된 PR들이 참조(#N)한 이슈 중 아직 열려있는 것 — "완료(머지로 해결)됐는데 안 닫힌" 이슈. */
export async function getResolvedOpenIssues(sinceDays = 45): Promise<number[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const merged = (await getMergedPRs(since, 50)) as Array<{ title?: string; body?: string }>;
  const refs = new Set<number>();
  for (const pr of merged) {
    const text = `${pr.title ?? ""} ${pr.body ?? ""}`;
    for (const m of text.matchAll(/#(\d+)/g)) {
      const x = Number(m[1]);
      if (x > 0) refs.add(x);
    }
  }
  const openIssues: number[] = [];
  for (const n of refs) {
    try {
      const it = (await githubApi(`/repos/${REPO}/issues/${n}`)) as {
        state: string;
        pull_request?: unknown;
      };
      // PR(이슈로도 조회됨)은 제외, 열린 이슈만
      if (it.state === "open" && !it.pull_request) openIssues.push(n);
    } catch {
      // 조회 실패는 건너뜀
    }
  }
  return openIssues;
}

// ── Step 3 (기억 천장): CEO 피드백 로그 적재/조회 ──────────────────
// prepare 가 읽는 feedback-log 라벨 이슈에 누적 → 다음 Agent Council 사이클에 자동 반영.
const FEEDBACK_LOG_TITLE = "[Slack] CEO Feedback Log";

interface IssueLite {
  number: number;
  title: string;
  body: string | null;
}

async function findFeedbackLogIssue(): Promise<IssueLite | undefined> {
  const issues = (await githubApi(
    `/repos/${REPO}/issues?labels=feedback-log&state=open&per_page=30&sort=created&direction=desc`
  )) as IssueLite[];
  return issues.find((i) => i.title === FEEDBACK_LOG_TITLE);
}

/** CEO 피드백을 rolling feedback-log 이슈 본문에 누적 (최근 40개 유지). */
export async function appendFeedbackLog(note: string): Promise<{ number: number }> {
  const date = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const entry = `- [${date}] ${note.replace(/\n/g, " ").trim()}`;
  const existing = await findFeedbackLogIssue();
  if (existing) {
    const lines = (existing.body ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- ["));
    lines.push(entry);
    const capped = lines.slice(-40).join("\n");
    await githubApi(`/repos/${REPO}/issues/${existing.number}`, {
      method: "PATCH",
      body: JSON.stringify({ body: `# Slack CEO 피드백 로그\n\n${capped}` }),
    });
    return { number: existing.number };
  }
  const created = (await githubApi(`/repos/${REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: FEEDBACK_LOG_TITLE,
      body: `# Slack CEO 피드백 로그\n\n${entry}`,
      labels: ["feedback-log"],
    }),
  })) as { number: number };
  return { number: created.number };
}

/** 최근 적재된 CEO 피드백 (스레드 넘은 컨텍스트용). */
export async function getRecentFeedbackLog(maxChars = 1500): Promise<string> {
  const existing = await findFeedbackLogIssue();
  if (!existing || !existing.body) return "";
  const body = existing.body;
  return body.length > maxChars ? body.slice(body.length - maxChars) : body;
}

/** 오늘자 [Auto] PR 목록 (open+merged 포함) — auto-implement 산출물 가시화/중복 안내용. */
export async function getTodayAutoPRs(today: string): Promise<
  { number: number; title: string; state: string; merged: boolean; html_url: string }[]
> {
  const prs = (await githubApi(
    `/repos/${REPO}/pulls?state=all&per_page=30&sort=created&direction=desc`
  )) as { number: number; title: string; state: string; merged_at: string | null; html_url: string }[];
  const re = new RegExp(`\\[Auto\\].*${today.replace(/[-]/g, "\\-")}`);
  return prs
    .filter((p) => re.test(p.title))
    .map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      merged: Boolean(p.merged_at),
      html_url: p.html_url,
    }));
}

export async function getFileContent(path: string): Promise<string> {
  const res = (await githubApi(
    `/repos/${REPO}/contents/${path}`
  )) as { content?: string; encoding?: string };
  if (!res.content) return "";
  return Buffer.from(res.content, (res.encoding as BufferEncoding) || "base64").toString("utf8");
}

export async function getRecentIssues(label: string, since: string, limit = 20) {
  return githubApi(
    `/repos/${REPO}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=${limit}&sort=created&direction=desc`
  ).then((v) =>
    (v as Array<{ created_at: string; [key: string]: unknown }>).filter(
      (i) => i.created_at > since
    )
  );
}

const ACTIONABLE_AGENT_LABELS = [
  "task",
  "pipeline-monitor",
  "integrity-check",
  "source-discovery",
  "ssot-sync",
];

export async function getLatestActionableIssue(): Promise<{
  number: number;
  title: string;
  html_url: string;
  labels: string[];
} | null> {
  const issues = (await githubApi(
    `/repos/${REPO}/issues?state=open&per_page=50&sort=created&direction=desc`
  )) as Array<{
    number: number;
    title: string;
    html_url?: string;
    pull_request?: unknown;
    labels?: ({ name: string } | string)[];
  }>;

  for (const issue of issues) {
    if (issue.pull_request) continue;
    const labels = (issue.labels ?? []).map((label) =>
      typeof label === "string" ? label : label.name
    );
    if (labels.some((label) => ACTIONABLE_AGENT_LABELS.includes(label))) {
      return {
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url ?? "",
        labels,
      };
    }
  }
  return null;
}

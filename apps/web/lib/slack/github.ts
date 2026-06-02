const GITHUB_PAT = process.env.GITHUB_PAT;
const REPO = process.env.GITHUB_REPO || "mlender-ai/taro-stock-app";

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

  return res.json();
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
  ).then((prs: Array<{ merged_at: string | null; [key: string]: unknown }>) =>
    prs.filter((pr) => pr.merged_at && pr.merged_at > since)
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
  ).then((issues: Array<{ created_at: string; [key: string]: unknown }>) =>
    issues.filter((i) => i.created_at > since)
  );
}

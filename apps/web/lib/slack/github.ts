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

export async function getRecentIssues(label: string, since: string, limit = 20) {
  return githubApi(
    `/repos/${REPO}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=${limit}&sort=created&direction=desc`
  ).then((issues: Array<{ created_at: string; [key: string]: unknown }>) =>
    issues.filter((i) => i.created_at > since)
  );
}

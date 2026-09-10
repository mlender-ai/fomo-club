/**
 * 기획문서(PRD) 래퍼 (톱다운 워크플로 — 선택 → 기획문서 → 승인 → 분해).
 *
 * project-kickoff 가 활성 프로젝트의 *상세 기획문서*를 기획 직군(LLM)으로 작성하면,
 * 이 순수 모듈이 검토 안내 헤더로 감싸 이슈 본문을 만든다. 사람이 읽고 GO/NO-GO 를 판단한다.
 * (PRD 본문 자체는 LLM 산문 — 파싱하지 않는다. 여기선 래핑/유효성만.)
 *
 * 순수 export 함수 + main() CLI.
 *   issue <project_id> <project_title> <prd.md>  → 검토용 기획문서 이슈 본문을 stdout
 */

import { readFileSync } from "node:fs";

/** PRD 본문이 쓸만한 분량인지(빈/너무 짧은 LLM 실패 가드). */
export function planDocReady(prd: string): boolean {
  return (prd || "").replace(/\s/g, "").length >= 40;
}

/** 검토용 기획문서 이슈 본문. */
export function renderPlanDocIssue(projectId: string, projectTitle: string, prd: string): string {
  const body = planDocReady(prd)
    ? prd.trim()
    : "_⚠️ 기획문서 생성이 비었거나 너무 짧습니다(LLM 실패 가능) — 다시 시도하거나 수동 작성하세요._";
  return [
    `## 🗺️ 상위 프로젝트: ${projectId} · ${projectTitle}`,
    `> 이 문서는 **개발 착수 전 검토용 기획문서(PRD)** 입니다. 읽고 시작 여부를 판단하세요.`,
    `> ✅ 진행: 슬랙에 **"${projectId} 기획 승인"** (또는 "이 기획으로 개발 진행") → 직군별(기획/백엔드/프론트·UX/품질) 하위 이슈로 분해.`,
    `> ✋ 보류/수정: 이 이슈에 코멘트로 피드백 — 분해는 시작되지 않습니다.`,
    "",
    "---",
    "",
    body,
  ].join("\n");
}

/** Slack 통지용 한 줄. */
export function renderPlanDocSlack(projectId: string, projectTitle: string, issueUrl: string): string {
  return [
    `📋 *기획문서 작성됨 — ${projectId} · ${projectTitle}*`,
    issueUrl,
    `읽어보시고 진행하려면 *"${projectId} 기획 승인"*, 고칠 점이 있으면 이슈에 코멘트 주세요.`,
    `_승인 전까지 직군 이슈 분해는 시작되지 않습니다._`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
function main(): void {
  const argv = process.argv;
  if (argv[2] !== "issue") {
    console.error("usage: tsx scripts/plan-doc.ts issue <project_id> <project_title> <prd.md>");
    process.exit(1);
  }
  const pid = argv[3] ?? "P?";
  const title = argv[4] ?? "";
  const prd = readFileSync(argv[5] ?? "/dev/stdin", "utf8");
  process.stdout.write(renderPlanDocIssue(pid, title, prd));
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("plan-doc")) {
  main();
}

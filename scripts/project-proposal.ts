/**
 * CEO 프로젝트 제안 — 후보 파서/로드맵 렌더 (톱다운 워크플로, "리스트업" 선행 단계).
 *
 * propose-project.yml 의 CEO 에이전트(LLM)가 제품(docs·OKR·현 상태)을 분석해 프로젝트 후보를
 * JSON 으로 제안하면, 이 순수 모듈이 검증 → PROJECT_ROADMAP.md 재생성 + 사람이 검토할 제안서를 렌더한다.
 * 사람은 "이 에이전트가 제품을 제대로 이해했나"를 검토하고 1개를 선택(select_project)한다.
 *
 * 순수 export 함수 + main() CLI.
 *   roadmap <candidates.json>   → PROJECT_ROADMAP.md 전문을 stdout
 *   issue <candidates.json>     → 검토용 제안서 마크다운을 stdout
 */

import { readFileSync } from "node:fs";

export interface ProjectCandidate {
  id: string;
  title: string;
  why: string;
  success: string;
  scope: string;
  milestone: string;
  okr: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * LLM 원문(JSON 배열, 코드펜스 허용)을 후보 배열로. title 없으면 제외.
 * id 누락/중복 시 P1.. 로 재채번(로드맵 단일성 보장).
 */
export function parseProposals(raw: string): ProjectCandidate[] {
  let text = (raw || "").trim();
  if (!text) return [];
  if (!text.startsWith("[")) {
    const s = text.indexOf("[");
    const e = text.lastIndexOf("]");
    if (s === -1 || e === -1 || e <= s) return [];
    text = text.slice(s, e + 1);
  }
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const out: ProjectCandidate[] = [];
  let n = 1;
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const title = str(o.title);
    if (!title) continue;
    out.push({
      id: `P${n}`,
      title,
      why: str(o.why),
      success: str(o.success),
      scope: str(o.scope),
      milestone: str(o.milestone),
      okr: str(o.okr),
    });
    n += 1;
  }
  return out;
}

const ROADMAP_HEADER = `# 🗺️ FOMO Club 프로젝트 로드맵 (Project Backlog)

| | |
|---|---|
| **위상** | 톱다운 프로젝트 백로그의 **단일 진실(source of truth)**. CEO 에이전트가 제품 분석으로 후보를 제안하고, 인간 오너가 1개를 활성화한다. |
| **선택 방법** | Slack 봇에 "P1 시작" → \`[[ACTION:select_project]] {"id":"P1"}\`. 선택 시 project-kickoff 가 직군별 하위 이슈로 분해한다. |
| **상태값** | \`active\`(지금 격파 중, 동시 1개) · \`backlog\`(대기) · \`done\`(완료) |

> 프로젝트 = 마일스톤(\`docs/IDENTITY_AND_MILESTONES.md\`) 단위. "기능 완성"이 아니라 "사랑스러움 완성" 기준.
> 파싱 규칙: \`## <id> · <title>\` 헤딩 + 그 아래 \`- **key**: value\` 라인. (scripts/project-roadmap.ts)

---
`;

const ROADMAP_FOOTER = `
---

## 진행 원칙
- **활성은 동시 1개.** 새 프로젝트 선택 시 이전 active 는 backlog 로 강등(완료는 명시적 done 처리).
- 활성 프로젝트가 있으면 직군은 그 프로젝트 이슈만 쪼개고 격파한다. 산발적 일일 제안 금지.
- 활성 프로젝트가 없으면 daily 리포트는 백로그를 surfacing 하고 오너의 선택을 기다린다.
- 프로젝트 완료 → retro → 다음 후보 surfacing.
`;

/** 후보 배열 → PROJECT_ROADMAP.md 전문 (project-roadmap.ts 가 재파싱 가능한 형식). */
export function renderRoadmap(candidates: ProjectCandidate[]): string {
  const blocks = candidates
    .map((c) =>
      [
        `## ${c.id} · ${c.title}`,
        `- **status**: backlog`,
        `- **milestone**: ${c.milestone || "-"}`,
        `- **okr**: ${c.okr || "-"}`,
        `- **why**: ${c.why || "-"}`,
        `- **success**: ${c.success || "-"}`,
        `- **scope**: ${c.scope || "-"}`,
      ].join("\n"),
    )
    .join("\n\n");
  return `${ROADMAP_HEADER}\n${blocks}\n${ROADMAP_FOOTER}`;
}

/** 사람이 검토할 제안서(이슈 본문). "제품을 제대로 이해했나"를 판단하게. */
export function renderProposalIssue(candidates: ProjectCandidate[]): string {
  if (!candidates.length) return "⚠️ CEO 프로젝트 제안 생성 실패 — 후보 0건. 수동 확인 요망.";
  const lines: string[] = [];
  lines.push("## 🧭 CEO 프로젝트 제안 (검토 요청)");
  lines.push("아래는 CEO 에이전트가 제품 정체성·OKR·현 상태를 분석해 제안한 **프로젝트 후보**입니다.");
  lines.push('제품을 제대로 이해했는지 검토하시고, 임팩트 있는 1개를 슬랙에서 선택하세요 — 예: "P1 시작".');
  lines.push("");
  for (const c of candidates) {
    lines.push(`### ${c.id} · ${c.title}`);
    if (c.milestone || c.okr) lines.push(`- 연결: ${[c.milestone, c.okr].filter(Boolean).join(" / ")}`);
    lines.push(`- **왜(임팩트)**: ${c.why || "-"}`);
    lines.push(`- **완료=성공 기준**: ${c.success || "-"}`);
    lines.push(`- **대략 범위**: ${c.scope || "-"}`);
    lines.push("");
  }
  lines.push("---");
  lines.push('_선택: 슬랙 "P{n} 시작" → project-kickoff 가 직군별(기획/백엔드/프론트·UX/품질) 하위 이슈로 분해. 구현은 CEO 승인 시에만._');
  return lines.join("\n");
}

/** Slack 한 줄 요약. */
export function renderProposalSlack(candidates: ProjectCandidate[]): string {
  if (!candidates.length) return "⚠️ CEO 프로젝트 제안: 후보 0건 (생성 실패)";
  const head = "🧭 *CEO 프로젝트 제안* — 검토 후 하나를 고르세요 (예: \"P1 시작\")";
  const body = candidates.map((c) => `• *${c.id}* ${c.title} — ${(c.why || "").slice(0, 60)}`).join("\n");
  return `${head}\n${body}`;
}

// ─────────────────────────────────────────────────────────────
function main(): void {
  const argv = process.argv;
  const cmd = argv[2];
  const path = argv[3];
  if (!cmd || !path) {
    console.error("usage: tsx scripts/project-proposal.ts <roadmap|issue|slack> <candidates.json>");
    process.exit(1);
  }
  const candidates = parseProposals(readFileSync(path, "utf8"));
  if (cmd === "roadmap") process.stdout.write(renderRoadmap(candidates));
  else if (cmd === "issue") process.stdout.write(renderProposalIssue(candidates));
  else if (cmd === "slack") process.stdout.write(renderProposalSlack(candidates));
  else {
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("project-proposal")) {
  main();
}

/**
 * PROJECT_ROADMAP.md 파서/셀렉터 (톱다운 워크플로 P1).
 *
 * 로드맵은 사람이 읽는 마크다운이자 기계가 파싱하는 단일 진실이다.
 * 형식: `## <id> · <title>` 헤딩 + 그 아래 `- **key**: value` 라인.
 *   key ∈ {status, milestone, okr, why, success, scope}
 *   status ∈ {active, backlog, done}  (active 는 동시 1개)
 *
 * 순수 export 함수 + main() CLI (process.argv[1] 가드). build-lane-state.ts 패턴 답습.
 *   active <roadmap.md>            → 활성 프로젝트 JSON (없으면 null)
 *   list <roadmap.md>              → 전체 프로젝트 JSON 배열
 *   select <roadmap.md> <id>       → 해당 id 를 active 로(이전 active 는 backlog) 갱신한 MD 를 stdout
 *   summary <roadmap.md>           → Slack/리포트용 한 줄 요약 목록
 */

import { readFileSync, writeFileSync } from "node:fs";

export type ProjectStatus = "active" | "backlog" | "done";

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  milestone?: string;
  okr?: string;
  why?: string;
  success?: string;
  scope?: string;
}

interface Block {
  id: string;
  title: string;
  /** 헤딩 다음부터 다음 헤딩 전까지의 원본 라인들 */
  bodyLines: string[];
}

const HEADING_RE = /^##\s+(P\d+)\s+·\s+(.+?)\s*$/;
const FIELD_RE = /^-\s+\*\*(\w+)\*\*:\s*(.*)$/;

/** 마크다운을 프로젝트 블록으로 분해 (헤딩 단위). */
function splitBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of lines) {
    const h = line.match(HEADING_RE);
    if (h) {
      cur = { id: h[1]!, title: h[2]!, bodyLines: [] };
      blocks.push(cur);
    } else if (cur) {
      // 다음 최상위 섹션(## 진행 원칙 등 P\d 아닌 ##)을 만나면 블록 종료
      if (/^##\s+/.test(line) && !HEADING_RE.test(line)) {
        cur = null;
        continue;
      }
      cur.bodyLines.push(line);
    }
  }
  return blocks;
}

function parseBlock(b: Block): Project {
  const p: Project = { id: b.id, title: b.title, status: "backlog" };
  for (const line of b.bodyLines) {
    const m = line.match(FIELD_RE);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = (m[2] ?? "").trim();
    if (key === "status") {
      p.status = val === "active" || val === "done" ? (val as ProjectStatus) : "backlog";
    } else if (key === "milestone") p.milestone = val;
    else if (key === "okr") p.okr = val;
    else if (key === "why") p.why = val;
    else if (key === "success") p.success = val;
    else if (key === "scope") p.scope = val;
  }
  return p;
}

/** 로드맵 마크다운 → 프로젝트 배열. */
export function parseRoadmap(md: string): Project[] {
  return splitBlocks(md).map(parseBlock);
}

/** 활성 프로젝트(동시 1개 가정 — 여럿이면 첫 번째). 없으면 null. */
export function getActiveProject(projects: Project[]): Project | null {
  return projects.find((p) => p.status === "active") ?? null;
}

export function findProject(projects: Project[], id: string): Project | null {
  const want = (id || "").trim().toUpperCase();
  return projects.find((p) => p.id.toUpperCase() === want) ?? null;
}

export interface SelectResult {
  ok: boolean;
  md: string;
  /** 사람이 읽을 메시지 (실패 사유 또는 성공 안내) */
  message: string;
  previousActive?: string;
}

/**
 * 주어진 id 를 active 로, 기존 active(다른 것)는 backlog 로 강등한 새 마크다운을 반환.
 * status 라인만 교체 — 나머지 텍스트 무손실. done 프로젝트는 건드리지 않는다.
 */
export function selectProject(md: string, id: string): SelectResult {
  const projects = parseRoadmap(md);
  const target = findProject(projects, id);
  if (!target) {
    return { ok: false, md, message: `프로젝트 '${id}' 를 로드맵에서 찾을 수 없습니다. (있는 것: ${projects.map((p) => p.id).join(", ")})` };
  }
  if (target.status === "done") {
    return { ok: false, md, message: `프로젝트 ${target.id}(${target.title})는 이미 done 입니다. 다른 프로젝트를 선택하세요.` };
  }
  const prevActive = getActiveProject(projects);
  const targetId = target.id.toUpperCase();
  const prevId = prevActive && prevActive.id.toUpperCase() !== targetId ? prevActive.id.toUpperCase() : null;

  // 블록 경계를 추적하며 각 블록의 status 라인만 재작성
  const lines = md.split("\n");
  let curId: string | null = null;
  const out = lines.map((line) => {
    const h = line.match(HEADING_RE);
    if (h) { curId = h[1]!.toUpperCase(); return line; }
    if (/^##\s+/.test(line)) { curId = null; return line; }
    const f = line.match(FIELD_RE);
    if (f && f[1]!.toLowerCase() === "status" && curId) {
      if (curId === targetId) return line.replace(/:\s*.*$/, ": active");
      if (curId === prevId) return line.replace(/:\s*.*$/, ": backlog");
    }
    return line;
  });

  const msg = prevId
    ? `프로젝트 ${target.id}(${target.title}) 활성화. 이전 활성 ${prevId} → backlog 강등.`
    : `프로젝트 ${target.id}(${target.title}) 활성화.`;
  return { ok: true, md: out.join("\n"), message: msg, previousActive: prevId ?? undefined };
}

/** Slack/리포트용 요약. */
export function renderSummary(projects: Project[]): string {
  const icon: Record<ProjectStatus, string> = { active: "🟢", backlog: "⚪", done: "✅" };
  return projects.map((p) => `${icon[p.status]} ${p.id} · ${p.title} (${p.status}${p.milestone ? `, ${p.milestone}` : ""})`).join("\n");
}

// ─────────────────────────────────────────────────────────────
function main(): void {
  const argv = process.argv;
  const cmd = argv[2];
  const path = argv[3];
  if (!cmd || !path) {
    console.error("usage: tsx scripts/project-roadmap.ts <active|list|select|summary> <roadmap.md> [id]");
    process.exit(1);
  }
  const md = readFileSync(path, "utf8");
  if (cmd === "active") {
    process.stdout.write(JSON.stringify(getActiveProject(parseRoadmap(md))));
  } else if (cmd === "list") {
    process.stdout.write(JSON.stringify(parseRoadmap(md)));
  } else if (cmd === "summary") {
    process.stdout.write(renderSummary(parseRoadmap(md)));
  } else if (cmd === "select") {
    const id = argv[4] ?? "";
    const res = selectProject(md, id);
    if (!res.ok) { console.error(res.message); process.exit(2); }
    writeFileSync(path, res.md);
    process.stdout.write(res.message);
  } else {
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("project-roadmap")) {
  main();
}

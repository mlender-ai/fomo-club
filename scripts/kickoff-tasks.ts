/**
 * 프로젝트 킥오프 분해 — task 세트 파서/검증/렌더 (톱다운 워크플로).
 *
 * project-kickoff.yml 의 "직군 회의"(LLM) 가 활성 프로젝트를 정렬된 task 배열로 분해해
 * JSON 으로 뱉으면, 이 순수 모듈이 검증·정렬·이슈 본문 렌더를 담당한다.
 * 직군 4개: 기획 / 백엔드 / 프론트·UX / 품질 (사람이 읽는 한글명 — 약어 폐지).
 *
 * 순수 export 함수 + main() CLI (process.argv[1] 가드).
 *   parse <project_id> <tasks.json>            → 검증·정렬된 task JSON 배열을 stdout
 *   render <project_id> <project_title> <total> <task.json> → 단일 task 이슈 본문(마크다운)
 */

import { readFileSync } from "node:fs";

/** 직군 4축 (사람이 읽는 한글명). LLM 도 이 이름으로 출력한다. */
export const AXES = ["기획", "백엔드", "프론트·UX", "품질"] as const;
export type Axis = (typeof AXES)[number];

/** 직군 → GitHub 라벨. (중간점 없는 안전한 라벨) */
export const AXIS_LABEL: Record<Axis, string> = {
  기획: "기획",
  백엔드: "백엔드",
  "프론트·UX": "프론트UX",
  품질: "품질",
};

/** 직군 한 줄 설명 (회의 프롬프트·문서 공용). */
export const AXIS_DESC: Record<Axis, string> = {
  기획: "제품 기획·유저 저니·우선순위 (무엇을 왜 어떤 순서로)",
  백엔드: "데이터·API·스키마·집계·아키텍처·보안",
  "프론트·UX": "화면·렌더·정보위계·포모 표정/멘트·전환·플로우",
  품질: "안정성·성능·빌드·테스트·폴백 회귀·옵저버빌리티",
};

export interface KickoffTask {
  seq: number;
  axis: Axis;
  title: string;
  rationale: string;
  /** 선행 task 의 seq 들 */
  dependsOn: number[];
  /** 완료 판정 기준(검증 가능) */
  acceptance: string;
}

/** 구 약어(PL/TD/BA/UX)도 너그럽게 한글 직군으로 흡수. */
const LEGACY: Record<string, Axis> = {
  PL: "기획",
  BA: "백엔드",
  UX: "프론트·UX",
  TD: "품질",
};

function coerceAxis(v: unknown): Axis | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if ((AXES as readonly string[]).includes(t)) return t as Axis;
  const up = t.toUpperCase();
  if (LEGACY[up]) return LEGACY[up];
  // 부분 일치(예: "프론트", "UX", "프론트엔드")
  if (/프론트|front|ux|디자인|화면/i.test(t)) return "프론트·UX";
  if (/백|back|api|데이터|스키마|서버/i.test(t)) return "백엔드";
  if (/품질|qa|테스트|안정|성능|부채/i.test(t)) return "품질";
  if (/기획|product|pm|로드맵/i.test(t)) return "기획";
  return null;
}

function coerceDeps(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * LLM 원문(JSON 문자열/객체)을 검증된 task 배열로.
 * - 코드펜스/잡텍스트 둘러싸여도 첫 '['~마지막 ']' 추출.
 * - 직군 화이트리스트 밖, title 없음 → 제외(부분 성공 허용).
 * - seq 오름차순 정렬, 자기/미존재 의존성 제거.
 */
export function parseKickoffTasks(raw: string): KickoffTask[] {
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

  const tasks: KickoffTask[] = [];
  let auto = 1;
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const axis = coerceAxis(o.axis);
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!axis || !title) continue;
    const seq = Number.isInteger(Number(o.seq)) && Number(o.seq) > 0 ? Number(o.seq) : auto;
    tasks.push({
      seq,
      axis,
      title,
      rationale: typeof o.rationale === "string" ? o.rationale.trim() : "",
      dependsOn: coerceDeps(o.dependsOn),
      acceptance: typeof o.acceptance === "string" ? o.acceptance.trim() : "",
    });
    auto = seq + 1;
  }
  tasks.sort((a, b) => a.seq - b.seq);
  const seqs = new Set(tasks.map((t) => t.seq));
  for (const t of tasks) t.dependsOn = t.dependsOn.filter((d) => d !== t.seq && seqs.has(d));
  return tasks;
}

/** 단일 task 의 GitHub 이슈 본문(마크다운) — 상위 프로젝트 → 하위 개발 이슈 맥락을 명확히. */
export function renderIssueBody(
  task: KickoffTask,
  projectId: string,
  projectTitle: string,
  total: number,
): string {
  const deps = task.dependsOn.length
    ? task.dependsOn.map((d) => `${d}단계`).join(", ")
    : "없음 (먼저 시작 가능)";
  return [
    `## 🗺️ 상위 프로젝트: ${projectId} · ${projectTitle}`,
    `이 이슈는 위 프로젝트를 완성하기 위한 **하위 개발 이슈**다.`,
    "",
    `## 🔢 진행 단계: ${task.seq} / ${total}`,
    `- **담당 직군**: ${task.axis} — ${AXIS_DESC[task.axis]}`,
    `- **선행 단계**: ${deps}`,
    "",
    "## 🎯 무엇을 하나",
    task.title,
    "",
    "## 왜 (이 프로젝트에 왜 필요한가)",
    task.rationale || "(근거 미기재)",
    "",
    "## ✅ 완료 판정 (검증 가능)",
    task.acceptance || "(판정 기준 미기재)",
    "",
    "---",
    `_프로젝트 \`${projectId}\` 의 ${task.seq}/${total} 단계. CEO 승인(슬랙 "개발해"/수동) 시에만 구현된다._`,
  ].join("\n");
}

/** 이슈 제목 — [프로젝트 · 단계 N/M · 직군] 제목 */
export function renderIssueTitle(task: KickoffTask, projectId: string, total: number): string {
  return `[${projectId} ${task.seq}/${total} · ${task.axis}] ${task.title}`;
}

/** 분해 요약(Slack/리포트) — 순서가 보이게. */
export function renderPlan(tasks: KickoffTask[], projectId: string): string {
  if (!tasks.length) return `(${projectId} 분해 task 없음)`;
  const total = tasks.length;
  return tasks
    .map(
      (t) =>
        `${t.seq}/${total} [${t.axis}] ${t.title}${t.dependsOn.length ? ` ← ${t.dependsOn.map((d) => `${d}단계`).join(",")} 후` : ""}`,
    )
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
function main(): void {
  const argv = process.argv;
  const cmd = argv[2];
  if (cmd === "parse") {
    const raw = readFileSync(argv[4] ?? "/dev/stdin", "utf8");
    process.stdout.write(JSON.stringify(parseKickoffTasks(raw)));
  } else if (cmd === "render") {
    const pid = argv[3] ?? "P?";
    const ptitle = argv[4] ?? "";
    const total = Number(argv[5]) || 0;
    const task = JSON.parse(readFileSync(argv[6] ?? "/dev/stdin", "utf8")) as KickoffTask;
    process.stdout.write(renderIssueBody(task, pid, ptitle, total));
  } else {
    console.error("usage: tsx scripts/kickoff-tasks.ts <parse|render> ...");
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("kickoff-tasks")) {
  main();
}

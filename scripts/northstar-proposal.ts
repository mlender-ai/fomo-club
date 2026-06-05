/**
 * North Star 제안형 거버넌스 — 제안 검증 (Task B).
 *
 * 에이전트가 AGENT_NORTH_STAR.md 변경을 제안하면 CEO 가 PR 머지로 승인한다.
 * 이 스크립트는 "제안된 전문(markdown)"이 안전한지 결정론적으로 검증한다:
 *  - 필수 섹션이 하나라도 빠지면 거부(LLM 이 파일을 망가뜨리는 사고 방지) → PR 생성 안 함
 *  - 헌법적 섹션(절대 제안 금지 / 제안 작성 절대 규칙) 변경 시 플래그 → PR 에 ⚠️ 배지
 *
 * 순수 함수 + CLI + vitest. North Star 파일 자체는 워크플로가 PR 로만 반영(직접 push 금지).
 */

import { readFileSync } from "node:fs";

/** 제안 markdown 에 반드시 존재해야 하는 섹션(헤더 prefix — `<<< CEO 확정 >>>` 접미사 무시). */
export const REQUIRED_SECTIONS = [
  "## 🎯 이번 주 테마",
  "## ⛔ 절대 제안 금지",
  "## 🧪 핵심 가설",
  "## 📊 측정 지표",
  "## 🚫 이번 주 손대지 않을 것",
  "## 🧭 직군 경계",
  "## 📐 프로젝트 사실 규약",
  "## ✍️ 제안 작성 절대 규칙",
] as const;

/** 변경 시 CEO 가 특히 주의해야 하는 "헌법적" 섹션. */
export const CONSTITUTIONAL_SECTIONS = [
  "## ⛔ 절대 제안 금지",
  "## ✍️ 제안 작성 절대 규칙",
] as const;

function headerLines(md: string): string[] {
  return md.split("\n").filter((l) => l.startsWith("## "));
}

/** 필수 섹션 누락 검증. */
export function validateProposal(proposed: string): { ok: boolean; missing: string[] } {
  const headers = headerLines(proposed);
  const missing: string[] = [];
  for (const req of REQUIRED_SECTIONS) {
    if (!headers.some((h) => h.startsWith(req))) missing.push(req);
  }
  // 본문이 사실상 비었으면(헤더만) 거부
  const nonEmpty = proposed.trim().length > 200;
  return { ok: missing.length === 0 && nonEmpty, missing };
}

/** 특정 헤더 prefix 로 시작하는 섹션 본문 추출(다음 `## ` 전까지). 없으면 "". */
export function extractSection(md: string, headerPrefix: string): string {
  const lines = md.split("\n");
  let i = lines.findIndex((l) => l.startsWith(headerPrefix));
  if (i === -1) return "";
  const out: string[] = [];
  for (i = i + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("## ")) break;
    out.push(lines[i]!);
  }
  return out.join("\n").trim();
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 헌법적 섹션 중 하나라도 본문이 바뀌었는가. */
export function detectConstitutionalChange(current: string, proposed: string): boolean {
  for (const sec of CONSTITUTIONAL_SECTIONS) {
    if (normalize(extractSection(current, sec)) !== normalize(extractSection(proposed, sec))) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// CLI:
//   validate <proposed.md>              → exit 0(ok)/1(missing), stdout=missing 목록
//   constitutional <current.md> <proposed.md> → stdout "true"/"false"
// ─────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv;
  const cmd = argv[2];
  if (cmd === "validate") {
    let md = "";
    try {
      md = readFileSync(argv[3] ?? "", "utf8");
    } catch {
      md = "";
    }
    const r = validateProposal(md);
    if (r.ok) {
      process.stdout.write("ok\n");
    } else {
      process.stdout.write(`missing: ${r.missing.join(", ") || "(빈 제안)"}\n`);
      process.exit(1);
    }
  } else if (cmd === "constitutional") {
    let cur = "";
    let prop = "";
    try {
      cur = readFileSync(argv[3] ?? "", "utf8");
      prop = readFileSync(argv[4] ?? "", "utf8");
    } catch {
      /* 읽기 실패 → 보수적으로 변경됨 처리 */
      process.stdout.write("true\n");
      return;
    }
    process.stdout.write(detectConstitutionalChange(cur, prop) ? "true\n" : "false\n");
  } else {
    console.error("usage:\n  validate <proposed.md>\n  constitutional <current.md> <proposed.md>");
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("northstar-proposal")) {
  main();
}

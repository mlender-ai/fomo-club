/**
 * 리스크 합성 프롬프트 번들 생성 (WO-SUB-06 §5-2).
 *
 * 정본은 `prompts/risk/*.v{n}.md` 다. 런타임(Vercel 함수)에서 `prompts/` 를 fs 로 읽는 것은
 * 파일 트레이싱에 의존해 깨질 수 있으므로 TS 번들을 굽고 런타임은 import 만 한다 —
 * WO-SUB-03 의 `business-context-prompts-render.ts` 와 같은 방식이다.
 *
 * **검증 프롬프트는 만들지 않는다.** §5-2 가 "WO-SUB-03 과 동일한 근거 검증 패스 적용" 을
 * 요구하므로 `verify.v1` 을 그대로 재사용한다. 검증기를 두 벌 두면 판정 기준이 갈린다.
 *
 * 실행: npx tsx scripts/risk-prompts-render.ts [--check]
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RISK_PROMPT_DIR = join("prompts", "risk");
export const RISK_BUNDLE_PATH = join("packages", "fomo-core", "src", "risk", "prompts.generated.ts");

interface PromptFile {
  id: string;
  name: string;
  version: string;
  text: string;
  hash: string;
}

export function loadRiskPrompts(): PromptFile[] {
  const files = readdirSync(RISK_PROMPT_DIR)
    .filter((file) => /\.v\d+\.md$/.test(file))
    .sort();
  return files.map((file) => {
    const text = readFileSync(join(RISK_PROMPT_DIR, file), "utf8");
    const match = file.match(/^(.+)\.v(\d+)\.md$/)!;
    return {
      id: `${match[1]}.v${match[2]}`,
      name: match[1]!,
      version: `v${match[2]}`,
      text,
      // 본문 해시 — 버전 문자열을 안 올리고 본문만 고치는 사고를 잡는다(재합성 트리거).
      hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
    };
  });
}

export function renderRiskBundle(): string {
  const prompts = loadRiskPrompts();
  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * **생성 파일이다. 직접 고치지 말 것.**");
  lines.push(" *");
  lines.push(" * 정본: `prompts/risk/*.md`");
  lines.push(" * 생성: `npx tsx scripts/risk-prompts-render.ts`");
  lines.push(" *");
  lines.push(" * 검증 프롬프트는 여기 없다 — WO-SUB-03 의 `verify.v1` 을 재사용한다(§5-2).");
  lines.push(" */");
  lines.push("");
  lines.push("export interface RiskPrompt {");
  lines.push("  id: string;");
  lines.push("  name: string;");
  lines.push("  version: string;");
  lines.push("  hash: string;");
  lines.push("  text: string;");
  lines.push("}");
  lines.push("");
  lines.push("export const RISK_PROMPTS: Readonly<Record<string, RiskPrompt>> = {");
  for (const prompt of prompts) {
    lines.push(`  ${JSON.stringify(prompt.id)}: {`);
    lines.push(`    id: ${JSON.stringify(prompt.id)},`);
    lines.push(`    name: ${JSON.stringify(prompt.name)},`);
    lines.push(`    version: ${JSON.stringify(prompt.version)},`);
    lines.push(`    hash: ${JSON.stringify(prompt.hash)},`);
    lines.push(`    text: ${JSON.stringify(prompt.text)},`);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");
  lines.push("export function riskPromptOf(id: string): RiskPrompt {");
  lines.push("  const prompt = RISK_PROMPTS[id];");
  lines.push("  if (!prompt) throw new Error(`리스크 프롬프트 없음: ${id}`);");
  lines.push("  return prompt;");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const rendered = renderRiskBundle();
  if (process.argv.includes("--check")) {
    const current = readFileSync(RISK_BUNDLE_PATH, "utf8");
    if (current === rendered) {
      console.log("[risk-prompts] 최신 상태");
      return;
    }
    console.error("[risk-prompts] 번들이 정본과 어긋난다 — npx tsx scripts/risk-prompts-render.ts 실행할 것");
    process.exit(1);
  }
  mkdirSync(join("packages", "fomo-core", "src", "risk"), { recursive: true });
  writeFileSync(RISK_BUNDLE_PATH, rendered);
  for (const prompt of loadRiskPrompts()) {
    console.log(`[risk-prompts] ${prompt.id}  hash=${prompt.hash}  ${prompt.text.length}자`);
  }
}

if (process.argv[1] && process.argv[1].includes("risk-prompts-render")) main();

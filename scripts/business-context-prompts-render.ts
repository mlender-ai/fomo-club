/**
 * WO-SUB-03 §10 "프롬프트를 코드에 인라인하지 말 것. 파일로 관리하고 버전을 찍는다."
 *
 * 정본은 `prompts/business-context/*.v{n}.md` 다. 런타임(Vercel 함수)에서 `docs/`·`prompts/` 를
 * fs 로 읽는 것은 파일 트레이싱에 의존해 깨질 수 있으므로, **여기서 TS 번들을 생성**해 런타임은
 * import 만 한다. 문서와 번들이 어긋나면 `business-context-prompts.test.ts` 가 실패한다.
 * (WO-SUB-02 독트린 렌더와 같은 방식 — 정본은 하나, 코드가 읽는 것은 생성물)
 *
 * 실행: npx tsx scripts/business-context-prompts-render.ts [--check]
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PROMPT_DIR = join("prompts", "business-context");
export const BUNDLE_PATH = join("packages", "fomo-core", "src", "business-context", "prompts.generated.ts");

interface PromptFile {
  /** "synthesize.v1" */
  id: string;
  name: string;
  version: string;
  text: string;
  hash: string;
}

export function loadPrompts(): PromptFile[] {
  const files = readdirSync(PROMPT_DIR)
    .filter((file) => /\.v\d+\.md$/.test(file))
    .sort();
  return files.map((file) => {
    const text = readFileSync(join(PROMPT_DIR, file), "utf8");
    const match = file.match(/^(.+)\.v(\d+)\.md$/)!;
    return {
      id: `${match[1]}.v${match[2]}`,
      name: match[1]!,
      version: `v${match[2]}`,
      text,
      // 프롬프트 해시 — 버전 문자열을 안 올리고 본문만 고치는 사고를 잡는다(재합성 트리거).
      hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
    };
  });
}

export function renderBundle(): string {
  const prompts = loadPrompts();
  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * **생성 파일이다. 직접 고치지 말 것.**");
  lines.push(" *");
  lines.push(" * 정본: `prompts/business-context/*.md`");
  lines.push(" * 생성: `npx tsx scripts/business-context-prompts-render.ts`");
  lines.push(" *");
  lines.push(" * 런타임이 `prompts/` 를 fs 로 읽지 않게 번들로 굽는다(Vercel 파일 트레이싱 의존 제거).");
  lines.push(" * `hash` 는 본문 해시다 — 버전 문자열을 안 올리고 본문만 고쳐도 재합성이 트리거된다.");
  lines.push(" */");
  lines.push("");
  lines.push("export interface BusinessContextPrompt {");
  lines.push("  id: string;");
  lines.push("  name: string;");
  lines.push("  version: string;");
  lines.push("  hash: string;");
  lines.push("  text: string;");
  lines.push("}");
  lines.push("");
  lines.push("export const BUSINESS_CONTEXT_PROMPTS: Readonly<Record<string, BusinessContextPrompt>> = {");
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
  lines.push("export function promptOf(id: string): BusinessContextPrompt {");
  lines.push("  const prompt = BUSINESS_CONTEXT_PROMPTS[id];");
  lines.push("  if (!prompt) throw new Error(`프롬프트 없음: ${id}`);");
  lines.push("  return prompt;");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const rendered = renderBundle();
  if (process.argv.includes("--check")) {
    const current = readFileSync(BUNDLE_PATH, "utf8");
    if (current === rendered) {
      console.log("[prompts] 최신 상태");
      return;
    }
    console.error("[prompts] 번들이 정본과 어긋난다 — npx tsx scripts/business-context-prompts-render.ts 실행할 것");
    process.exit(1);
  }
  mkdirSync(join("packages", "fomo-core", "src", "business-context"), { recursive: true });
  writeFileSync(BUNDLE_PATH, rendered);
  const prompts = loadPrompts();
  console.log(`[prompts] 생성 — ${BUNDLE_PATH}`);
  for (const prompt of prompts) console.log(`  ${prompt.id}  hash=${prompt.hash}  ${prompt.text.length}자`);
}

if (process.argv[1] && process.argv[1].includes("business-context-prompts-render")) main();

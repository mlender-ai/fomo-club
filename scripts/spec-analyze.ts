import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

export interface SpecAnalyzeFinding {
  severity: "error" | "warn";
  code: string;
  message: string;
  file?: string;
  sample?: string;
}

export interface SpecAnalyzeResult {
  ok: boolean;
  changedFiles: string[];
  findings: SpecAnalyzeFinding[];
}

export interface SpecAnalyzeOptions {
  guardDiscoveryRan?: boolean;
}

interface DiffLine {
  file: string;
  text: string;
}

interface ParsedDiff {
  changedFiles: string[];
  added: DiffLine[];
  removed: DiffLine[];
}

const FORBIDDEN_PRODUCT_COPY =
  /(?:목표가|급등\s*임박|텐베거|지금\s*안\s*(?:사|보)면\s*늦|사야\s*할|팔아야\s*할|매수\s*(?:기회|타이밍|추천|신호)|매도\s*(?:추천|신호))/i;

const DISCOVERY_SENSITIVE_FILE =
  /^(?:apps\/web\/lib\/discovery-supply\.ts|apps\/web\/app\/api\/fomo\/discovery\/|apps\/fomo-web\/components\/(?:StockSwipeDeck|KeywordDepthPage|TodayDiscoveryDeck|SectorStockDeck)\.tsx|packages\/fomo-core\/src\/keyword-cards\/|scripts\/discovery-regression-gate\.ts)/;

const CONCRETE_DISCOVERY_COPY =
  /(?:\d+\s*개|가장|먼저|외국인|기관|거래량|순매수|공급계약|계약|공시|수주|클러스터|자사주|배당|실적|파트너십|제품|인프라)/;

const GENERIC_DISCOVERY_COPY =
  /(?:흐름에서\s*(?:먼저|새로|같이)?\s*확인|더\s*(?:확인|살펴볼)\s*종목|발견\s*풀|오늘\s*가격이|움직였어요|움직임)/;

const GOVERNANCE_FILES = [
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^GEMINI\.md$/,
  /^ANTIGRAVITY\.md$/,
  /^\.rules$/,
  /^\.cursor\/rules\//,
  /^docs\/templates\//,
  /^\.github\/workflows\/spec-analyze\.yml$/,
  /^scripts\/spec-analyze\.ts$/,
  /^scripts\/__tests__\/spec-analyze\.test\.ts$/,
];

export function analyzeSpecDiff(diffText: string, options: SpecAnalyzeOptions = {}): SpecAnalyzeResult {
  const parsed = parseUnifiedDiff(diffText);
  const findings: SpecAnalyzeFinding[] = [];
  const addFinding = (finding: SpecAnalyzeFinding) => findings.push(finding);

  for (const line of parsed.added) {
    if (isGovernanceFile(line.file)) continue;
    if (FORBIDDEN_PRODUCT_COPY.test(line.text)) {
      addFinding({
        severity: "error",
        code: "constitution.forbidden_copy",
        message: "제품 표면에 투자조언/예측/목표가로 읽힐 수 있는 문구가 추가됐습니다.",
        file: line.file,
        sample: line.text.trim(),
      });
    }
  }

  if (touchesDiscoveryInvariant(parsed.changedFiles) && !options.guardDiscoveryRan) {
    addFinding({
      severity: "error",
      code: "guard.discovery_required",
      message: "발견 덱/카드/뎁스 불변식 파일을 변경했지만 npm run guard:discovery 실행 표시가 없습니다.",
      sample: parsed.changedFiles.filter((file) => DISCOVERY_SENSITIVE_FILE.test(file)).join(", "),
    });
  }

  const removedConcrete = parsed.removed.filter((line) => !isGovernanceFile(line.file) && CONCRETE_DISCOVERY_COPY.test(line.text));
  const addedGeneric = parsed.added.filter((line) => !isGovernanceFile(line.file) && GENERIC_DISCOVERY_COPY.test(line.text));
  if (removedConcrete.length > 0 && addedGeneric.length > 0) {
    addFinding({
      severity: "error",
      code: "diff.generic_overwrite",
      message: "구체적인 발견 훅/기능을 제네릭 문구로 대체하는 과잉 삭제 패턴입니다.",
      file: addedGeneric[0]?.file,
      sample: `removed: ${removedConcrete[0]?.text.trim()} / added: ${addedGeneric[0]?.text.trim()}`,
    });
  }

  if (implementationChanged(parsed.changedFiles) && !specOrChecklistChanged(parsed.changedFiles)) {
    addFinding({
      severity: "warn",
      code: "spec.coverage_missing",
      message: "제품/엔진 구현 변경에 연결된 SPEC/WO 또는 checklist 변경이 보이지 않습니다. PR 본문에 스펙 링크와 검증 커버리지를 남기세요.",
    });
  }

  return {
    ok: !findings.some((finding) => finding.severity === "error"),
    changedFiles: parsed.changedFiles,
    findings,
  };
}

export function parseUnifiedDiff(diffText: string): ParsedDiff {
  const changedFiles = new Set<string>();
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let currentFile = "";

  for (const line of diffText.split(/\r?\n/)) {
    const diffMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (diffMatch) {
      currentFile = diffMatch[2] ?? diffMatch[1] ?? "";
      if (currentFile) changedFiles.add(currentFile);
      continue;
    }
    const renameMatch = /^(?:\+\+\+|---) b\/(.+)$/.exec(line);
    if (renameMatch && renameMatch[1] !== "/dev/null") {
      currentFile = renameMatch[1] ?? currentFile;
      if (currentFile) changedFiles.add(currentFile);
      continue;
    }
    if (!currentFile) continue;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added.push({ file: currentFile, text: line.slice(1) });
    if (line.startsWith("-")) removed.push({ file: currentFile, text: line.slice(1) });
  }

  return { changedFiles: [...changedFiles].sort(), added, removed };
}

function isGovernanceFile(file: string): boolean {
  return GOVERNANCE_FILES.some((pattern) => pattern.test(file));
}

function touchesDiscoveryInvariant(files: readonly string[]): boolean {
  return files.some((file) => DISCOVERY_SENSITIVE_FILE.test(file));
}

function implementationChanged(files: readonly string[]): boolean {
  return files.some((file) => /^(?:apps|packages)\//.test(file) && !/(__tests__|\.test\.)/.test(file));
}

function specOrChecklistChanged(files: readonly string[]): boolean {
  return files.some((file) => /^docs\/(?:WO-|templates\/SPEC_CHECKLIST|templates\/SPEC_TEMPLATE|PRODUCT_VISION|DATA_ENGINE_STRATEGY|DEVELOPMENT_QUALITY_GUARDRAILS)/.test(file));
}

async function diffFromArgs(args: readonly string[]): Promise<string> {
  const diffFileIndex = args.indexOf("--diff-file");
  if (diffFileIndex >= 0 && args[diffFileIndex + 1]) return readFile(args[diffFileIndex + 1], "utf8");

  const baseIndex = args.indexOf("--base");
  if (baseIndex >= 0 && args[baseIndex + 1]) return gitDiff(args[baseIndex + 1]);

  if (process.env.GITHUB_BASE_REF) return gitDiff(`origin/${process.env.GITHUB_BASE_REF}...HEAD`);

  const cached = gitDiff("--cached");
  const unstaged = gitDiff();
  const untracked = await untrackedDiff();
  return [cached, unstaged, untracked].filter(Boolean).join("\n");
}

function gitDiff(revision?: string): string {
  const args = ["diff", "--no-ext-diff", "--unified=80"];
  if (revision) args.push(revision);
  return execFileSync("git", args, { encoding: "utf8" });
}

async function untrackedDiff(): Promise<string> {
  const files = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter((file) => file && !file.startsWith(".codebase-memory/"));
  const chunks: string[] = [];
  for (const file of files) {
    try {
      const text = await readFile(file, "utf8");
      chunks.push([
        `diff --git a/${file} b/${file}`,
        "new file mode 100644",
        "index 0000000..1111111",
        "--- /dev/null",
        `+++ b/${file}`,
        "@@ -0,0 +1,999 @@",
        ...text.split(/\r?\n/).map((line) => `+${line}`),
      ].join("\n"));
    } catch {
      // Binary or unreadable untracked files are ignored by this text-oriented governance gate.
    }
  }
  return chunks.join("\n");
}

function printResult(result: SpecAnalyzeResult): void {
  console.log("Spec analyze");
  console.log(`- changed files: ${result.changedFiles.length}`);
  if (result.findings.length === 0) {
    console.log("✅ passed");
    return;
  }
  for (const finding of result.findings) {
    const mark = finding.severity === "error" ? "❌" : "⚠️";
    console.log(`${mark} [${finding.code}] ${finding.message}`);
    if (finding.file) console.log(`   file: ${finding.file}`);
    if (finding.sample) console.log(`   sample: ${finding.sample}`);
  }
}

async function main(): Promise<void> {
  const diffText = await diffFromArgs(process.argv.slice(2));
  const guardDiscoveryRan = /^(?:1|true|yes)$/i.test(process.env.SPEC_ANALYZE_GUARD_DISCOVERY_RAN ?? "");
  const result = analyzeSpecDiff(diffText, { guardDiscoveryRan });
  printResult(result);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("spec-analyze.ts") || process.argv[1]?.endsWith("spec-analyze.js")) {
  main().catch((err) => {
    console.error("[spec-analyze] failed", err);
    process.exitCode = 1;
  });
}

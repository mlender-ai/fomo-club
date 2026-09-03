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
  investmentJudgmentConstraintsLifted?: boolean;
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
  /^docs\/CONSTRAINT_OVERRIDE_DEV\.md$/, // 제약 오버라이드 정책 문서(거버넌스) — 예시 단어 스캔 제외
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
    if (isTestFile(line.file)) continue;
    if (!options.investmentJudgmentConstraintsLifted && FORBIDDEN_PRODUCT_COPY.test(line.text)) {
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

  const removedConcrete = parsed.removed.filter(
    (line) => !isGovernanceFile(line.file) && !isTestFile(line.file) && !isPatternOrAssertionLine(line.text) && CONCRETE_DISCOVERY_COPY.test(line.text),
  );
  const addedGeneric = parsed.added.filter(
    (line) =>
      !isGovernanceFile(line.file) &&
      !isTestFile(line.file) &&
      !isPatternOrAssertionLine(line.text) &&
      !isCommentLine(line.text) &&
      GENERIC_DISCOVERY_COPY.test(line.text),
  );
  const genericOverwrite = removedConcrete
    .map((removed) => ({ removed, added: addedGeneric.find((added) => added.file === removed.file) }))
    .find((pair): pair is { removed: DiffLine; added: DiffLine } => !!pair.added);
  if (genericOverwrite) {
    addFinding({
      severity: "error",
      code: "diff.generic_overwrite",
      message: "구체적인 발견 훅/기능을 제네릭 문구로 대체하는 과잉 삭제 패턴입니다.",
      file: genericOverwrite.added.file,
      sample: `removed: ${genericOverwrite.removed.text.trim()} / added: ${genericOverwrite.added.text.trim()}`,
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

function isTestFile(file: string): boolean {
  return /(?:^|\/)__tests__\/|(?:^|\/)[^/]+\.test\.[cm]?[tj]sx?$/.test(file);
}

function touchesDiscoveryInvariant(files: readonly string[]): boolean {
  return files.some((file) => DISCOVERY_SENSITIVE_FILE.test(file));
}

function implementationChanged(files: readonly string[]): boolean {
  return files.some((file) => /^(?:apps|packages)\//.test(file) && !/(__tests__|\.test\.)/.test(file));
}

/**
 * 스펙·작업지시가 같이 바뀌었나.
 *
 * `docs/wo/` 를 넣는다 — 이 저장소의 작업지시는 **거기** 산다(`docs/wo/WO-HOOK-01-*.md` 등).
 * 종전 정규식은 `docs/WO-` 만 봐서 **한 번도 만족된 적이 없었고**, 그래서 이 경고가 모든
 * PR 에 떴다. 늘 뜨는 경고는 아무도 안 읽는다.
 */
function specOrChecklistChanged(files: readonly string[]): boolean {
  return files.some((file) =>
    /^docs\/(?:wo\/|WO-|templates\/SPEC_CHECKLIST|templates\/SPEC_TEMPLATE|PRODUCT_VISION|DATA_ENGINE_STRATEGY|DEVELOPMENT_QUALITY_GUARDRAILS)/.test(file)
  );
}

function isPatternOrAssertionLine(text: string): boolean {
  return /(?:PATTERN|RegExp|toMatch|not\.toMatch|toContain|not\.toContain)/.test(text);
}

/**
 * 주석 줄인가 — **주석은 사용자에게 안 나간다.**
 *
 * 이 규칙이 잡으려는 것은 「구체적인 발견 훅이 제네릭 문구로 바뀌는 것」이고, 그건 화면에
 * 나가는 문구 얘기다. 주석은 그 문구가 아니라 **왜 그렇게 했는지 적은 글**이다.
 * 정규식 정의 줄을 빼는 것(`isPatternOrAssertionLine`)과 같은 이유다.
 *
 * 실제로 걸린 사례(2026-09-01, MACRO-01): 업종 목록이 **자리만 옮겼는데** 제거로 잡히고,
 * 같은 파일에 새로 쓴 JSDoc 의 「움직임」이 제네릭으로 잡혀 둘이 짝지어졌다. 목록에서
 * 빠진 값은 하나도 없었다.
 *
 * 코드 뒤에 붙은 꼬리 주석은 빼지 않는다 — 줄 **맨 앞**이 주석 기호일 때만이다.
 * 안 그러면 `const x = "…"; // 움직임` 같은 줄로 규칙을 피해갈 수 있다.
 */
function isCommentLine(text: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*)/.test(text);
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

async function constraintOverrideActive(): Promise<boolean> {
  try {
    const doc = await readFile("docs/CONSTRAINT_OVERRIDE_DEV.md", "utf8");
    return /ACTIVE:\s*true/i.test(doc);
  } catch {
    return false;
  }
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
  const investmentJudgmentConstraintsLifted = await constraintOverrideActive();
  const result = analyzeSpecDiff(diffText, { guardDiscoveryRan, investmentJudgmentConstraintsLifted });
  printResult(result);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("spec-analyze.ts") || process.argv[1]?.endsWith("spec-analyze.js")) {
  main().catch((err) => {
    console.error("[spec-analyze] failed", err);
    process.exitCode = 1;
  });
}

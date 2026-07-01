/**
 * Hardening Scout — 백엔드·인프라·보안·API 강화 이슈 생성기 (결정론, LLM 불필요).
 *
 * 왜: daily-product-monitor 는 "제품 데이터"만 본다. 1인 개발자가 약한
 *     백엔드/인프라/보안/API/DB/성능 축을 매주 다른 영역으로 스캔해 *구체적* 강화 태스크를 이슈화한다.
 * 반복 방지: ISO 주차로 영역 로테이션(보안→인프라→API→DB→성능) → 매주 다른 축.
 * 출력: hardening-reports/latest.md + latest.json (findingCount>0 일 때만 워크플로우가 이슈 생성).
 * 실행: npm run hardening:scout   (HARDENING_AREA=security 로 영역 강제 가능)
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const REPORT_DIR = "hardening-reports";
const AREAS = ["security", "infra", "api", "db", "perf"] as const;
type Area = (typeof AREAS)[number];

interface Finding {
  title: string;
  detail: string;
}
interface AreaReport {
  area: Area;
  label: string;
  whyForNonExpert: string;
  findings: Finding[];
}

function kstDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

/** ISO 주차(월요일 시작) — 영역 로테이션 인덱스. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

export function pickArea(date: Date, override?: string): Area {
  if (override && (AREAS as readonly string[]).includes(override)) return override as Area;
  return AREAS[isoWeek(date) % AREAS.length]!;
}

function gitGrep(args: string[]): string[] {
  try {
    return execFileSync("git", ["grep", "-I", ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // git grep exits 1 when 0 matches
  }
}

async function readIfExists(rel: string): Promise<string> {
  try {
    return await fs.readFile(path.resolve(process.cwd(), rel), "utf8");
  } catch {
    return "";
  }
}

// ── 영역별 결정론 체크 ──────────────────────────────────────────────

async function scanSecurity(): Promise<AreaReport> {
  const findings: Finding[] = [];

  // 1) 코드가 참조하지만 .env.example 에 없는 env (설정 누락/문서화 공백).
  const codeEnv = new Set(
    gitGrep(["-hoE", "process\\.env\\[[\"'][A-Z0-9_]+[\"']\\]", "--", "apps", "packages", "scripts"])
      .map((line) => line.match(/[A-Z0-9_]+/g)?.slice(-1)[0] ?? "")
      .filter(Boolean)
  );
  const exampleText = await readIfExists(".env.example");
  const exampleEnv = new Set([...exampleText.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]!));
  const runtimeIgnore = new Set(["NODE_ENV", "CI", "PATH", "VERCEL", "VERCEL_ENV", "npm_lifecycle_event"]);
  const missing = [...codeEnv].filter((k) => !exampleEnv.has(k) && !runtimeIgnore.has(k)).sort();
  if (missing.length > 0) {
    findings.push({
      title: `.env.example 에 없는 코드 참조 env ${missing.length}개`,
      detail: `${missing.join(", ")} — 누락 시 배포에서 조용히 오작동. .env.example 에 플레이스홀더 추가하거나 fail-closed 확인.`,
    });
  }

  // 2) npm audit 취약점 요약(직접적 공급망 리스크).
  try {
    const audit = JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    const v = audit?.metadata?.vulnerabilities ?? {};
    const high = (v.critical ?? 0) + (v.high ?? 0);
    if (high > 0) findings.push({ title: `npm audit high/critical ${high}건`, detail: `critical ${v.critical ?? 0}, high ${v.high ?? 0}. \`npm audit\` 로 상세 확인 후 상향/교체.` });
  } catch {
    // audit 는 취약점 있으면 exit!=0 → stdout 에 JSON. 파싱 실패 시 무시.
  }

  // 3) 빈 catch(에러 삼킴 — 관측 공백). CLAUDE.md 코드원칙 6 위반 후보.
  const emptyCatch = gitGrep(["-lE", "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}", "--", "apps", "packages"]);
  if (emptyCatch.length > 0) {
    findings.push({ title: `빈 catch 블록 파일 ${emptyCatch.length}개`, detail: `${emptyCatch.slice(0, 8).join(", ")}${emptyCatch.length > 8 ? " 외" : ""} — 최소 console.warn/에러상태. 조용한 실패는 디버깅 불가.` });
  }

  return {
    area: "security",
    label: "보안·시크릿·에러가시성",
    whyForNonExpert: "털리거나 조용히 깨지는 걸 막는 축. env 누락·취약 의존성·삼켜진 에러가 가장 흔한 구멍.",
    findings,
  };
}

async function scanInfra(): Promise<AreaReport> {
  const findings: Finding[] = [];
  let wf: string[] = [];
  try {
    wf = (await fs.readdir(path.resolve(process.cwd(), ".github/workflows"))).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    wf = [];
  }
  const noConcurrency: string[] = [];
  for (const f of wf) {
    const text = await readIfExists(`.github/workflows/${f}`);
    if (/^on:\s*[\s\S]*schedule|cron/m.test(text) && !/concurrency:/.test(text)) noConcurrency.push(f);
  }
  if (noConcurrency.length > 0) {
    findings.push({ title: `cron 워크플로우 중 concurrency 없음 ${noConcurrency.length}개`, detail: `${noConcurrency.join(", ")} — 겹쳐 돌면 중복 이슈/레이스. concurrency group 추가 권장.` });
  }
  return {
    area: "infra",
    label: "CI/CD·워크플로우 안정성",
    whyForNonExpert: "자동화가 겹치거나 캐시 없이 느리게 도는 걸 잡는 축. 배포 파이프라인 신뢰성.",
    findings,
  };
}

async function scanApi(): Promise<AreaReport> {
  const findings: Finding[] = [];
  const routes = gitGrep(["-lE", "export async function (GET|POST|PUT|PATCH|DELETE)", "--", "apps/web/app/api", "apps/fomo-web/app/api"]);
  // 입력을 실제로 받는가(body/query). 안 받으면(정적 GET) 검증 대상 아님 → 오탐 제거.
  const TAKES_INPUT = /req(?:uest)?\.(?:json|formData|text)\(|searchParams|context\.params|params\./;
  const LIB_VALIDATION = /zod|\.parse\(|safeParse|\bschema\b|z\.object/i;
  // 수동 검증 흔적(라이브러리 안 써도 손으로 막는 경우).
  const MANUAL_VALIDATION = /if\s*\(!|typeof\s|\.test\(|\.length\s*[<>]=?|===\s*""|status:\s*400|code:\s*"(?:MISSING|BAD_|INVALID)/;

  const genuinelyUnvalidated: string[] = [];
  let manualOnly = 0;
  let noInput = 0;
  for (const f of routes) {
    const text = execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }).slice(0, 20000);
    if (!TAKES_INPUT.test(text)) {
      noInput += 1;
      continue; // 입력 안 받는 라우트는 스킵(오탐 방지)
    }
    if (LIB_VALIDATION.test(text)) continue; // 스키마 검증 있음
    if (MANUAL_VALIDATION.test(text)) {
      manualOnly += 1;
      continue; // 수동 검증 있음(약할 수 있으나 문지기는 있음)
    }
    genuinelyUnvalidated.push(f);
  }

  if (genuinelyUnvalidated.length > 0) {
    findings.push({
      title: `입력을 받는데 검증 흔적이 전혀 없는 라우트 ${genuinelyUnvalidated.length}개`,
      detail: `${genuinelyUnvalidated.slice(0, 12).join(", ")}${genuinelyUnvalidated.length > 12 ? " 외" : ""} — 경계 입력검증(allowlist/스키마) 추가. docs/SECURITY_CHECKLIST.md '입력 검증' 참조.`,
    });
  }
  // 투명성: 전체 그림(스캐너가 부풀리지 않도록 분모 공개).
  findings.push({
    title: `참고: 라우트 ${routes.length}개 중 입력無(정적 GET) ${noInput}개 · 수동검증만 ${manualOnly}개 · 진짜 무검증 ${genuinelyUnvalidated.length}개`,
    detail: `수동검증만(${manualOnly}개)은 스키마 라이브러리는 아니지만 문지기는 있음 — 여유 될 때 공용 검증 헬퍼로 표준화 검토.`,
  });
  return {
    area: "api",
    label: "API 경계·입력검증",
    whyForNonExpert: "외부 입력이 들어오는 문. 검증 없으면 SSRF·주입·오작동. 라우트별 입력검증 존재 여부.",
    findings: findings.filter((f) => !f.title.includes("0개")),
  };
}

async function scanDb(): Promise<AreaReport> {
  const findings: Finding[] = [];
  const schema = await readIfExists("prisma/schema.prisma");
  if (schema) {
    const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]!);
    const indexCount = (schema.match(/@@index/g) ?? []).length;
    const relationNoIndex = models.filter((m) => {
      const block = schema.slice(schema.indexOf(`model ${m}`), schema.indexOf("}", schema.indexOf(`model ${m}`)));
      return /@relation/.test(block) && !/@@index/.test(block);
    });
    if (relationNoIndex.length > 0) {
      findings.push({ title: `@relation 있으나 @@index 없는 모델 ${relationNoIndex.length}개`, detail: `${relationNoIndex.join(", ")} — FK 조회 느려질 수 있음(인덱스 검토). 모델 ${models.length}개, 인덱스 ${indexCount}개.` });
    }
  }
  return {
    area: "db",
    label: "DB 스키마·인덱스",
    whyForNonExpert: "데이터 늘면 느려지는 지점. 관계 컬럼 인덱스 누락이 대표적 확장성 병목.",
    findings,
  };
}

async function scanPerf(): Promise<AreaReport> {
  const findings: Finding[] = [];
  const clientComps = gitGrep(["-l", "use client", "--", "apps/fomo-web/components", "apps/fomo-web/app"]);
  const heavyClient = clientComps.filter((f) => {
    const text = execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }).slice(0, 20000);
    return /recharts|framer-motion|three|chart\.js|@react-pdf|xlsx/i.test(text);
  });
  if (heavyClient.length > 0) {
    findings.push({ title: `무거운 라이브러리를 정적 import 하는 client 컴포넌트 ${heavyClient.length}개`, detail: `${heavyClient.slice(0, 8).join(", ")} — next/dynamic 지연로딩 검토(초기 번들↓).` });
  }
  findings.push({ title: `client 컴포넌트 ${clientComps.length}개`, detail: `"use client" 컴포넌트 수. 서버 컴포넌트로 내릴 수 있는 건 내리면 번들·TTI 개선.` });
  return {
    area: "perf",
    label: "번들·렌더 성능",
    whyForNonExpert: "첫 화면이 빨리 뜨게 하는 축. 무거운 라이브러리·과도한 client 컴포넌트가 느림의 주범.",
    findings,
  };
}

const SCANNERS: Record<Area, () => Promise<AreaReport>> = {
  security: scanSecurity,
  infra: scanInfra,
  api: scanApi,
  db: scanDb,
  perf: scanPerf,
};

function renderReport(report: AreaReport, dateKst: string): string {
  return [
    `# 강화 스카우트 — ${report.label} (${dateKst})`,
    "",
    `> 축: **${report.area}** · 왜 중요한가(비전문가용): ${report.whyForNonExpert}`,
    `> 결정론 스캔(레포 스냅샷 기준). 매주 다른 축을 돈다. 아래는 *검토 태스크*지 자동수정 아님.`,
    "",
    ...(report.findings.length === 0
      ? ["## 결과", "- 이번 스냅샷에선 이 축에서 걸린 항목 없음. (좋은 신호이거나 체크 확장 필요)"]
      : ["## 강화 후보", ...report.findings.flatMap((f) => [`### ${f.title}`, f.detail, ""])]),
    "## 다음 액션",
    "- 채택: 개별 강화 PR/이슈로 분해.",
    "- 보류: 우선순위 낮으면 다음 로테이션까지.",
    "",
    "## 가드레일",
    "- 자동 구현 없음(검토 이슈까지만). 제품 카피·투자판단 무관.",
  ].join("\n");
}

async function main(): Promise<void> {
  const now = new Date();
  const area = pickArea(now, process.env["HARDENING_AREA"]?.trim());
  const report = await SCANNERS[area]();
  const dateKst = kstDate(now);
  const md = renderReport(report, dateKst);
  const summary = { area, label: report.label, generatedDateKst: dateKst, findingCount: report.findings.length };

  const outDir = path.resolve(process.cwd(), REPORT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "latest.md"), md);
  await fs.writeFile(path.join(outDir, "latest.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[hardening-scout] area=${area} findings=${report.findings.length}`);
}

if (process.env["HARDENING_SCOUT_TEST"] !== "1") {
  void main();
}

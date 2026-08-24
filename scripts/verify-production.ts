import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * 프로덕션 실측 게이트 (WO-RENDER-01 PART B).
 *
 * `AGENTS.md` 세션 시작 체크리스트 2번이 이 파일을 가리킨다. **파일이 없어 2026-08-17 까지 모든
 * 세션이 그 단계를 건너뛰었다** — 지시와 코드가 어긋난 상태 자체가 WO-SYNC 가 잡으려던 드리프트다.
 *
 * ## 무엇을 재는가
 *
 * "배포가 성공했는가" 가 아니다. **정규 도메인이 지금 사용자에게 무엇을 주는가** 다.
 * 같은 사고가 네 번 반복됐고 원인은 매번 달랐지만 증상은 같았다 — 배포는 READY, 화면은 그대로:
 *
 * | 사고 | 배포 기록 | 정규 도메인 실제 |
 * |---|---|---|
 * | #1076 별칭 미이동 | 최신 커밋 | 옛 빌드 |
 * | #1075 옛 페이로드 | 최신 커밋 | 최신 코드 + 24h 전 페이로드 |
 * | WO-OPS-504 스테일 서빙 | 정상 | 마지막 성공분(200 인데 새것이 아니다) |
 * | 2026-08-17 asOf < 배포 | 최신 커밋 | 배포보다 **먼저** 구워진 페이로드 |
 * | 2026-08-23 빈 덱 | 최신 커밋 | 최신 페이로드인데 **카드가 0장** (STATUS §12) |
 *
 * 넷 다 "Vercel 이 READY 라고 했다" 로는 안 잡힌다. 그래서 이 스크립트는 **배포 기록을 믿지 않고
 * 정규 도메인에 HTTP 로 직접 묻는다.**
 *
 * ## 실패(exit 1) 조건 — 넷
 *
 * 1. **커밋이 `origin/main` HEAD 보다 뒤** — 머지한 코드가 아직 서빙되지 않는다.
 * 2. **페이로드 `asOf` < 최신 코드 커밋 시각** — 새 코드가 옛 페이로드를 서빙 중이다(자동배포 경로의 틈).
 *    *배포* 시각이 아니라 *코드 커밋* 시각과 잰다 — §12-5 (4) 가 문서 배포의 재생성을 건너뛰게
 *    만들어, 배포 시각을 쓰면 문서 push 마다 거짓 실패가 난다(2026-08-24 실측).
 * 3. **`staleServe: true`** — 200 이지만 마지막 성공분이다. 새로 구운 것이 아니다.
 * 4. **`picks: 0`** — 덱이 비었다. 2026-08-23 12:09 UTC 실측에서 위 셋이 **전부 통과인 채**
 *    정규 도메인이 빈 덱을 서빙했다. 재지 않은 것이 하나 있었고 그것이 사용자가 보는 유일한
 *    것이었다 — 덱에 카드가 있는가. 빈 덱을 통과시키는 게이트는 게이트가 아니라 알리바이다.
 *
 * 판정 불가는 **실패로 세지 않고 `미확인` 으로 남긴다**(`AGENTS.md`: 추정으로 메우지 않는다).
 * 단 그때는 종료코드 2 로 구분한다 — 통과(0)로 위장하지 않는다.
 *
 * ## 캐시 우회는 선택이 아니다
 *
 * `quiet-picks` 는 `s-maxage=3600` 이다. 그냥 부르면 최대 1시간 전 `asOf` 가 온다 —
 * **우회 없는 검증은 통과처럼 보이는 실패다**(`docs/STATUS.md` §9).
 * 모든 요청에 `Cache-Control: no-cache` + 캐시버스터를 붙이고, 응답의 `x-vercel-cache` 를 같이 찍어
 * 우회가 실제로 됐는지 사람이 확인할 수 있게 한다.
 *
 * ## 실행
 *
 * ```
 * npm run verify:production          # 전부
 * npm run verify:production -- --json
 * ```
 *
 * Vercel 자격증명 없이도 동작한다. 있으면(`vercel` CLI 로그인 또는 `VERCEL_TOKEN`) 배포 시각을
 * **별칭 기준으로 정확히** 얻고, 없으면 배포 커밋의 커밋 시각으로 대체한다(더 관대한 하한).
 */

const exec = promisify(execFile);

// ── 정규 도메인 — `.github/workflows/vercel-production-deploy.yml` 의 alias 대상이 정본이다.
//    `fomo-web-liart.vercel.app`(Vercel 자동 생성 도메인)은 정규 도메인이 아니다. 404 가 정상이다.
const API_BASE = (process.env.VERIFY_API_BASE || "https://fomo-club-backend.vercel.app").replace(/\/$/, "");
const WEB_BASE = (process.env.VERIFY_WEB_BASE || "https://fomo-web-mlender-ais-projects.vercel.app").replace(/\/$/, "");

/** 페이로드 신선도의 기준 라우트 — quiet-pick 덱이 제품의 활성 화면이다. */
const PAYLOAD_PATH = "/api/fomo/quiet-picks";
const VERSION_PATH = "/api/fomo/ops/version";
const WEB_VERSION_PATH = "/api/ops/version";

/** 프리웜은 Vercel 크론이 아니라 GitHub Actions 다(`apps/web/vercel.json` 크론 10개에 없다). */
const PREWARM_WORKFLOWS = ["kr-candle-prewarm.yml", "us-market-prewarm.yml", "coin-market-prewarm.yml"] as const;

const HTTP_TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 90_000);

type Verdict = "pass" | "fail" | "unknown";

interface Check {
  name: string;
  verdict: Verdict;
  detail: string;
}

const checks: Check[] = [];
const record = (name: string, verdict: Verdict, detail: string): void => {
  checks.push({ name, verdict, detail });
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP — 캐시 우회 필수
// ─────────────────────────────────────────────────────────────────────────────

interface Fetched {
  status: number;
  body: unknown;
  text: string;
  cache: string | null;
}

/** 캐시버스터는 시각 기반. 같은 초에 두 번 불러도 겹치지 않게 난수를 섞는다. */
const bust = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function get(url: string, accept: "json" | "text" = "json"): Promise<Fetched | null> {
  const target = `${url}${url.includes("?") ? "&" : "?"}cb=${bust()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      // 우회는 두 겹이다: 쿼리(오리진 캐시 키) + 헤더(CDN). 하나만으로는 새는 사례가 있었다.
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (accept === "json") {
      try {
        body = JSON.parse(text);
      } catch {
        body = null; // JSON 이 아니면 파싱 실패를 숨기지 않고 body=null 로 두고 text 를 남긴다
      }
    }
    return { status: response.status, body, text, cache: response.headers.get("x-vercel-cache") };
  } catch (error) {
    console.error(`  ! GET 실패 ${target} — ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// git — `origin/main` HEAD 는 **원격에** 물어본다
// ─────────────────────────────────────────────────────────────────────────────

async function git(...args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", args, { maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * 로컬 `origin/main` 은 낡을 수 있다 — 마지막 `fetch` 시점의 것이다.
 * `ls-remote` 로 **지금 원격의** HEAD 를 읽는다. 이 값이 비교 기준이다.
 */
async function remoteHead(): Promise<string | null> {
  const out = await git("ls-remote", "origin", "refs/heads/main");
  return out?.split(/\s+/)[0] ?? null;
}

/**
 * **페이로드에 영향을 주는** 최신 커밋의 시각(문서 커밋은 제외).
 *
 * ## 왜 배포 시각이 아니라 이것과 재야 하는가 (2026-08-24 실측)
 *
 * 실패조건 ② 는 원래 "새 코드가 옛 페이로드를 서빙한다" 를 잡으려던 것이고, 그 대리 지표로
 * **마지막 배포 시각**을 썼다. 그런데 §12-5 (4) 가 **문서만 바뀐 배포에서는 재생성을 건너뛰게**
 * 만들면서 이 대리 지표가 깨졌다 — 문서 커밋을 올리면 배포 시각만 새로워지고 `asOf` 는
 * 그대로라, ② 가 매번 거짓 실패를 낸다. 실제로 §12-5b 직후 첫 문서 push 에서 그렇게 됐다.
 *
 * 두 규칙이 정면으로 부딪친 것이고, 틀린 쪽은 대리 지표다. **재야 할 것은 "배포가 있었나" 가
 * 아니라 "페이로드를 바꿀 변경이 있었나" 다.** 그래서 `docs/`·`*.md` 를 뺀 최신 커밋 시각과
 * 잰다. 문서만 바뀐 배포는 이 값이 안 움직이므로 ② 가 조용하고, 코드가 바뀌면 즉시 움직인다.
 *
 * 판정 불가(shallow clone 등)면 `null` — 호출자가 종전 기준으로 되돌아간다.
 */
async function newestPayloadRelevantCommitAt(head: string): Promise<Date | null> {
  const out = await git(
    "log", "-1", "--format=%cI", head,
    "--", ".", ":(exclude)docs", ":(exclude)docs/**", ":(exclude)*.md", ":(exclude)**/*.md"
  );
  if (!out) return null;
  const at = new Date(out);
  return Number.isFinite(at.getTime()) ? at : null;
}

/** 배포 커밋이 HEAD 의 조상인가 = 뒤처졌는가. 조상도 아니면 다른 계보(경고 대상). */
async function ancestry(deployed: string, head: string): Promise<"same" | "behind" | "ahead" | "diverged" | "unknown"> {
  if (deployed === head) return "same";
  const known = await git("cat-file", "-e", `${deployed}^{commit}`);
  if (known === null) return "unknown"; // 로컬에 없는 커밋 — shallow clone 이거나 미fetch
  const behind = await exec("git", ["merge-base", "--is-ancestor", deployed, head]).then(() => true).catch(() => false);
  if (behind) return "behind";
  const ahead = await exec("git", ["merge-base", "--is-ancestor", head, deployed]).then(() => true).catch(() => false);
  return ahead ? "ahead" : "diverged";
}

/** 배포 커밋의 커밋 시각 — Vercel 자격증명이 없을 때 배포 시각의 **하한**으로 쓴다. */
async function commitTime(sha: string): Promise<Date | null> {
  const out = await git("show", "-s", "--format=%cI", sha);
  const date = out ? new Date(out) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

const countBetween = async (from: string, to: string): Promise<number | null> => {
  const out = await git("rev-list", "--count", `${from}..${to}`);
  return out === null ? null : Number(out);
};

// ─────────────────────────────────────────────────────────────────────────────
// 배포 시각 — 별칭이 가리키는 배포의 생성 시각
// ─────────────────────────────────────────────────────────────────────────────

interface DeployInfo {
  createdAt: Date;
  deploymentId: string;
  source: "vercel-alias";
}

/**
 * `vercel inspect <정규도메인>` 은 **별칭을 해소해서** 그 도메인이 실제로 가리키는 배포를 준다 —
 * "최신 프로덕션 배포" 를 묻는 것과 다르다. #1076 이 그 차이에서 나왔으므로 이쪽을 쓴다.
 *
 * 자격증명이 없으면 `null`. 그때는 호출부가 커밋 시각으로 대체한다.
 */
async function aliasDeployment(domain: string): Promise<DeployInfo | null> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const args = ["--yes", "vercel@latest", "inspect", domain, "--json"];
  if (token) args.push("--token", token);
  try {
    const { stdout } = await exec("npx", args, { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 });
    // CLI 가 진행 로그를 섞어 내보내므로 첫 '{' 부터 잘라 파싱한다.
    const start = stdout.indexOf("{");
    if (start < 0) return null;
    const parsed = JSON.parse(stdout.slice(start)) as { id?: string; createdAt?: number };
    if (!parsed.createdAt || !parsed.id) return null;
    return { createdAt: new Date(parsed.createdAt), deploymentId: parsed.id, source: "vercel-alias" };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 프리웜 — GitHub Actions 최근 성공
// ─────────────────────────────────────────────────────────────────────────────

interface PrewarmRun {
  workflow: string;
  at: Date | null;
  note: string;
}

async function lastPrewarm(workflow: string): Promise<PrewarmRun> {
  try {
    const { stdout } = await exec(
      "gh",
      ["run", "list", "--workflow", workflow, "--status", "success", "--limit", "1", "--json", "updatedAt,displayTitle"],
      { timeout: 60_000 }
    );
    const rows = JSON.parse(stdout) as Array<{ updatedAt?: string }>;
    const raw = rows[0]?.updatedAt;
    if (!raw) return { workflow, at: null, note: "성공 이력 없음" };
    return { workflow, at: new Date(raw), note: "" };
  } catch {
    return { workflow, at: null, note: "미확인 (gh CLI 없음/미인증)" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildId — 프론트 HTML 에서만 읽을 수 있다
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Next.js App Router 는 `__NEXT_DATA__` 를 내보내지 않는다. buildId 는 RSC flight 페이로드의
 * 라우터 상태에 `"b":"<buildId>"` 로 실려 온다. 실측(2026-08-17)으로 확인한 형태다.
 * 형태가 바뀌면 `null` 을 내고 `미확인` 으로 남긴다 — 엉뚱한 문자열을 buildId 라고 부르지 않는다.
 */
function extractBuildId(html: string): string | null {
  const match = html.match(/\\"b\\":\\"([A-Za-z0-9_-]{8,64})\\"/) ?? html.match(/"buildId":"([A-Za-z0-9_-]{8,64})"/);
  return match?.[1] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 출력 도우미
// ─────────────────────────────────────────────────────────────────────────────

const iso = (date: Date | null): string => (date ? date.toISOString() : "미확인");
const minutesBetween = (later: Date, earlier: Date): number => Math.round((later.getTime() - earlier.getTime()) / 60_000);

/** 사람이 읽는 상대시각. "26분 전" 이 "2026-08-17T15:07Z" 보다 판단에 빠르다. */
function ago(date: Date | null, now: Date): string {
  if (!date) return "";
  const min = minutesBetween(now, date);
  if (min < 0) return ` (${-min}분 후 — 시계 확인)`;
  if (min < 60) return ` (${min}분 전)`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return ` (${hours}시간 ${min % 60}분 전)`;
  return ` (${Math.floor(hours / 24)}일 전)`;
}

const MARK: Record<Verdict, string> = { pass: "✅", fail: "❌", unknown: "⚠️ " };

// ─────────────────────────────────────────────────────────────────────────────
// 본체
// ─────────────────────────────────────────────────────────────────────────────

interface Report {
  now: string;
  head: string | null;
  api: {
    base: string;
    commit: string | null;
    ancestry: string;
    behindBy: number | null;
    deployedAt: string;
    deployedAtSource: string;
    deploymentId: string | null;
  };
  web: { base: string; commit: string | null; buildId: string | null };
  payload: {
    asOf: string | null;
    date: string | null;
    picks: number | null;
    status: number | null;
    staleServe: unknown;
    cacheHeader: string | null;
  };
  prewarm: Array<{ workflow: string; at: string; note: string }>;
  checks: Check[];
  exitCode: number;
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const now = new Date();
  const log = asJson ? () => {} : (line = "") => console.log(line);

  log("═══ 프로덕션 실측 (verify-production) ═══");
  log(`측정 시각   ${now.toISOString()}`);
  log(`API 정규    ${API_BASE}`);
  log(`WEB 정규    ${WEB_BASE}`);
  log();

  // ── 1. origin/main HEAD
  const head = await remoteHead();
  log("── 1. origin/main HEAD");
  log(`  HEAD       ${head ?? "미확인 (git ls-remote 실패)"}`);
  if (!head) record("origin/main HEAD 확인", "unknown", "git ls-remote origin refs/heads/main 실패");

  // ── 2. 정규 도메인 신원
  log();
  log("── 2. 정규 도메인 신원");
  const [apiVersion, webVersion, webHtml] = await Promise.all([
    get(`${API_BASE}${VERSION_PATH}`),
    get(`${WEB_BASE}${WEB_VERSION_PATH}`),
    get(WEB_BASE, "text"),
  ]);

  const versionBody = (fetched: Fetched | null): { commit?: string | null; deploymentId?: string | null } | null =>
    fetched && fetched.status === 200 && fetched.body && typeof fetched.body === "object"
      ? (fetched.body as { commit?: string | null; deploymentId?: string | null })
      : null;

  const apiInfo = versionBody(apiVersion);
  const webInfo = versionBody(webVersion);
  const apiCommit = apiInfo?.commit ?? null;
  const webCommit = webInfo?.commit ?? null;
  const buildId = webHtml ? extractBuildId(webHtml.text) : null;

  const versionRouteMissing = apiVersion !== null && apiVersion.status === 404;
  log(`  API 커밋   ${apiCommit ?? `미확인 (버전 라우트 HTTP ${apiVersion?.status ?? "실패"})`}`);
  log(`  API 배포ID ${apiInfo?.deploymentId ?? "미확인"}`);
  log(`  WEB 커밋   ${webCommit ?? `미확인 (버전 라우트 HTTP ${webVersion?.status ?? "실패"})`}`);
  log(`  WEB buildId ${buildId ?? "미확인 (HTML 에서 추출 실패)"}`);
  if (versionRouteMissing) {
    log("  ↳ 버전 라우트가 아직 배포되지 않았다. 이 라우트가 담긴 커밋이 프로덕션에 닿으면 채워진다.");
  }

  // ── 3. HEAD 와의 차이
  log();
  log("── 3. origin/main HEAD 와의 차이");
  let relation: Awaited<ReturnType<typeof ancestry>> = "unknown";
  let behindBy: number | null = null;
  if (apiCommit && head) {
    relation = await ancestry(apiCommit, head);
    if (relation === "behind") behindBy = await countBetween(apiCommit, head);
    const label = {
      same: "일치 — 정규 도메인이 HEAD 를 서빙한다",
      behind: `**뒤처짐** — HEAD 보다 ${behindBy ?? "?"}커밋 뒤`,
      ahead: "HEAD 보다 앞섬 — 되돌려진 main 이거나 다른 ref 배포",
      diverged: "계보 분기 — HEAD 의 조상도 후손도 아니다",
      unknown: "미확인 — 배포 커밋이 로컬에 없다(shallow clone?)",
    }[relation];
    log(`  판정       ${label}`);
    record(
      "정규 도메인 커밋 = origin/main HEAD",
      relation === "same" ? "pass" : relation === "behind" ? "fail" : "unknown",
      `${apiCommit.slice(0, 8)} vs HEAD ${head.slice(0, 8)} → ${relation}`
    );
  } else {
    log("  판정       미확인 (배포 커밋 또는 HEAD 를 못 읽었다)");
    record("정규 도메인 커밋 = origin/main HEAD", "unknown", "배포 커밋 또는 HEAD 미확인");
  }
  // ── 프론트를 따로 판정한다. 백엔드가 초록이라고 프론트가 초록인 것이 아니다.
  //
  // 2026-08-17 실측: 백엔드 정규 도메인은 Git 자동배포로 별칭이 따라 움직이는데(프로젝트 도메인으로
  // 등록돼 있다) **프론트 정규 도메인은 안 움직였다.** 최신 배포는 READY·별칭 0개였고 정규 도메인은
  // 1시간 반 전 빌드를 서빙했다(buildId `bd2mmus…` vs 최신 `hTFMwPF…`). #1076 의 구조적 재발이다.
  // 그래서 프론트 커밋 불일치는 경고가 아니라 **실패**다.
  if (webCommit && head) {
    const webRelation = await ancestry(webCommit, head);
    if (webRelation === "same") {
      record("프론트 정규 도메인 커밋 = origin/main HEAD", "pass", `${webCommit.slice(0, 8)} = HEAD`);
    } else {
      record(
        "프론트 정규 도메인 커밋 = origin/main HEAD",
        webRelation === "behind" ? "fail" : "unknown",
        `web ${webCommit.slice(0, 8)} vs HEAD ${head.slice(0, 8)} → ${webRelation}`
      );
    }
  } else {
    record(
      "프론트 정규 도메인 커밋 = origin/main HEAD",
      "unknown",
      webVersion?.status === 404
        ? `버전 라우트 404 — (a) 라우트 미배포이거나 (b) **정규 별칭이 스테일**이다. ` +
          `\`vercel inspect ${WEB_BASE.replace(/^https?:\/\//, "")}\` 로 별칭이 가리키는 배포를 확인하라`
        : `프론트 커밋 미확인 (HTTP ${webVersion?.status ?? "실패"})`
    );
  }
  if (webCommit && apiCommit && webCommit !== apiCommit) {
    log(`  ⚠️  프론트(${webCommit.slice(0, 8)})와 백엔드(${apiCommit.slice(0, 8)}) 커밋이 다르다 — 한쪽만 배포됐다.`);
  }

  // ── 4. 마지막 배포 시각
  log();
  log("── 4. 마지막 배포 시각 (별칭이 가리키는 배포)");
  const domain = API_BASE.replace(/^https?:\/\//, "");
  const alias = await aliasDeployment(domain);
  let deployedAt: Date | null = alias?.createdAt ?? null;
  let deployedAtSource = "vercel inspect (별칭 해소)";
  if (!deployedAt && apiCommit) {
    deployedAt = await commitTime(apiCommit);
    deployedAtSource = "배포 커밋의 커밋 시각 (하한 — Vercel 자격증명 없음)";
  }
  if (!deployedAt) deployedAtSource = "미확인";
  log(`  배포 시각   ${iso(deployedAt)}${ago(deployedAt, now)}`);
  log(`  근거        ${deployedAtSource}`);
  if (alias) log(`  배포 ID     ${alias.deploymentId}`);

  // ── 5. 페이로드
  log();
  log("── 5. 페이로드 (캐시 우회)");
  const payload = await get(`${API_BASE}${PAYLOAD_PATH}`);
  const payloadBody = (payload?.body ?? null) as {
    asOf?: string;
    date?: string;
    picks?: unknown[];
    meta?: { staleServe?: unknown };
    staleServe?: unknown;
  } | null;
  const asOfRaw = payloadBody?.asOf ?? null;
  const asOf = asOfRaw ? new Date(asOfRaw) : null;
  const asOfValid = asOf && Number.isFinite(asOf.getTime()) ? asOf : null;
  // `staleServe` 는 `meta` 안에 들어가는 것이 규약(`apps/web/lib/stale-serve.ts`)이지만
  // 라우트마다 위치가 달랐던 전례가 있어 최상위도 같이 본다.
  const staleServe = payloadBody?.meta?.staleServe ?? payloadBody?.staleServe ?? null;

  log(`  HTTP        ${payload?.status ?? "실패"}`);
  log(`  x-vercel-cache ${payload?.cache ?? "없음"}${payload?.cache === "HIT" ? "  ⚠️ 캐시 우회 실패 — 이 asOf 는 옛것일 수 있다" : ""}`);
  log(`  asOf        ${asOfRaw ?? "미확인"}${ago(asOfValid, now)}`);
  log(`  date        ${payloadBody?.date ?? "미확인"}`);
  log(`  picks       ${Array.isArray(payloadBody?.picks) ? payloadBody.picks.length : "미확인"}`);
  log(`  staleServe  ${staleServe === null ? "없음 (= 새로 구운 것)" : JSON.stringify(staleServe)}`);

  if (payload?.cache === "HIT") {
    record("캐시 우회", "unknown", "x-vercel-cache: HIT — asOf 판정을 신뢰할 수 없다");
  }

  // 실패조건 ③ staleServe
  if (staleServe === null) {
    record("staleServe 없음", "pass", "마지막 성공분 서빙 아님");
  } else {
    const stale = staleServe as { stale?: unknown; savedAt?: string; reason?: string };
    record(
      "staleServe 없음",
      stale.stale === true ? "fail" : "unknown",
      `staleServe=${JSON.stringify(staleServe)} — savedAt ${stale.savedAt ?? "?"} · reason ${stale.reason ?? "?"}`
    );
  }

  // ── 실패조건 ④ 빈 덱.
  //
  // ## 왜 이것이 없었던 것이 문제인가 (2026-08-23 12:09 UTC 실측)
  //
  // 이 스크립트가 **exit 0 을 내는 동안 정규 도메인은 `picks: 0` 을 서빙하고 있었다.**
  // 커밋도 맞고 staleServe 도 없고 asOf 도 배포보다 늦었다 — 재던 셋이 전부 통과였다.
  // 재지 않은 것이 하나 있었고 그것이 사용자가 보는 유일한 것이었다: **덱에 카드가 있는가.**
  //
  // 빈 덱은 `AGENTS.md` 자동 실패 목록에 오른 회귀다. 그것을 통과시키는 게이트는 게이트가
  // 아니라 알리바이다. `docs/STATUS.md` §12 의 세 번째 발생을 이 검사가 없어서 놓쳤다.
  //
  // `watching` 은 보지 않는다 — 지켜보는 중 선반은 픽이 아니고, 그것만 있는 화면은
  // 사용자에게 여전히 "오늘은 없다" 다.
  const picksCount = Array.isArray(payloadBody?.picks) ? payloadBody.picks.length : null;
  if (picksCount === null) {
    record("덱이 비어 있지 않다", "unknown", `picks 를 읽을 수 없다 — HTTP ${payload?.status ?? "실패"}`);
  } else if (picksCount === 0) {
    record(
      "덱이 비어 있지 않다",
      "fail",
      `picks 0 — 정규 도메인이 빈 덱을 서빙한다. 재생성을 돌려라(quiet-pick-trigger.yml).`
    );
  } else {
    record("덱이 비어 있지 않다", "pass", `picks ${picksCount}`);
  }

  // 실패조건 ② asOf < **페이로드에 영향을 주는** 최신 커밋 시각.
  //
  // 배포 시각이 아니라 코드 커밋 시각과 잰다 — 이유는 `newestPayloadRelevantCommitAt` 주석에 있다
  // (요약: §12-5 (4) 가 문서 배포의 재생성을 건너뛰게 만들어 배포 시각 대리 지표가 깨졌다).
  const codeAt = head ? await newestPayloadRelevantCommitAt(head) : null;
  const LABEL2 = "페이로드 asOf ≥ 최신 코드 커밋";
  if (asOfValid && codeAt) {
    const gapMin = minutesBetween(codeAt, asOfValid);
    if (gapMin > 0) {
      record(
        LABEL2,
        "fail",
        `asOf ${asOfValid.toISOString()} 가 최신 코드 커밋 ${codeAt.toISOString()} 보다 ${gapMin}분 이르다 — 새 코드가 옛 페이로드를 서빙한다`
      );
    } else {
      const deployNote =
        deployedAt && minutesBetween(deployedAt, asOfValid) > 0
          ? ` (마지막 배포보다는 ${minutesBetween(deployedAt, asOfValid)}분 이르지만 그 배포는 문서 변경뿐 — 재생성 생략이 맞다)`
          : "";
      record(LABEL2, "pass", `asOf 가 최신 코드 커밋보다 ${-gapMin}분 늦다${deployNote}`);
    }
  } else if (asOfValid && deployedAt) {
    // 코드 커밋 시각을 못 구했다(shallow clone 등) — 종전 기준으로 되돌아가되 **미확인**으로 남긴다.
    // 문서 배포에서 거짓 실패를 내느니 못 쟀다고 말하는 쪽이 낫다(AGENTS.md: 종료코드 2).
    const gapMin = minutesBetween(deployedAt, asOfValid);
    record(
      LABEL2,
      gapMin > 0 ? "unknown" : "pass",
      gapMin > 0
        ? `코드 커밋 시각 미확인(shallow clone?) — 배포 기준으로는 ${gapMin}분 이르다. 문서 배포면 정상이다`
        : `asOf 가 배포보다 ${-gapMin}분 늦다 (코드 커밋 시각 미확인)`
    );
  } else {
    record(LABEL2, "unknown", `asOf ${asOfRaw ?? "미확인"} · 코드커밋 ${iso(codeAt)} · 배포 ${iso(deployedAt)}`);
  }

  // ── 6. 프리웜
  log();
  log("── 6. 마지막 성공 프리웜 (GitHub Actions)");
  const prewarm = await Promise.all(PREWARM_WORKFLOWS.map(lastPrewarm));
  for (const run of prewarm) {
    log(`  ${run.workflow.padEnd(24)} ${run.at ? run.at.toISOString() : run.note}${ago(run.at, now)}`);
  }
  // 프리웜은 실패조건이 아니다 — 주말·장휴일에 안 도는 것이 정상인 워크플로가 있다. 보고만 한다.

  // ── 판정
  log();
  log("── 판정");
  for (const check of checks) log(`  ${MARK[check.verdict]} ${check.name} — ${check.detail}`);

  const failed = checks.filter((c) => c.verdict === "fail");
  const unknown = checks.filter((c) => c.verdict === "unknown");
  const exitCode = failed.length > 0 ? 1 : unknown.length > 0 ? 2 : 0;

  log();
  if (exitCode === 1) {
    log(`❌ 실패 ${failed.length}건 — 정규 도메인이 기대 상태가 아니다. exit 1`);
    log("   완료 판정 금지. 원인을 고치고 다시 실행한다.");
  } else if (exitCode === 2) {
    log(`⚠️  미확인 ${unknown.length}건 — 통과라고 하지 않는다. exit 2`);
  } else {
    log("✅ 전부 통과 — 정규 도메인이 HEAD 를 서빙하고 페이로드가 배포 이후 것이다. exit 0");
  }

  if (asJson) {
    const report: Report = {
      now: now.toISOString(),
      head,
      api: {
        base: API_BASE,
        commit: apiCommit,
        ancestry: relation,
        behindBy,
        deployedAt: iso(deployedAt),
        deployedAtSource,
        deploymentId: alias?.deploymentId ?? apiInfo?.deploymentId ?? null,
      },
      web: { base: WEB_BASE, commit: webCommit, buildId },
      payload: {
        asOf: asOfRaw,
        date: payloadBody?.date ?? null,
        picks: Array.isArray(payloadBody?.picks) ? payloadBody.picks.length : null,
        status: payload?.status ?? null,
        staleServe,
        cacheHeader: payload?.cache ?? null,
      },
      prewarm: prewarm.map((run) => ({ workflow: run.workflow, at: iso(run.at), note: run.note })),
      checks,
      exitCode,
    };
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error("verify-production 자체가 실패했다 —", error);
  // 스크립트 오류를 통과로 오해하면 안 된다. 3 은 "재지 못했다".
  process.exit(3);
});

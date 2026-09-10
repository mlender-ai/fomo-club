/**
 * CTX-07 §4 — 성능 회귀 게이트 (CI, 오프라인·결정론).
 *
 * ## 무엇을 재는가, 그리고 왜 그것인가
 *
 * 504 사고의 원인은 "조회 핸들러가 느림" 이 아니었다. `AGENTS.md` 작업 규율의 실측 기록:
 * **콜드 49.0s vs 서버 self-report 175ms · 람다 10.15MB.** 핸들러는 빨랐고 **모듈 로딩이 느렸다.**
 * 무거운 의존성이 조회 번들에 들어온 것이 원인이다.
 *
 * 그래서 이 게이트는 두 축을 본다.
 *
 *  ① **콜드 임포트 무게** — 조회 라우트의 전이 값-임포트 그래프 크기. 정적이라 네트워크·DB 없이
 *     결정론적으로 나온다.
 *
 *     ⚠️ **이 숫자는 번들 크기가 아니라 상한이다.** `@fomo/core` 배럴(export 37개)을 값으로
 *     임포트하면 그 뒤 약 120개 모듈이 전부 그래프에 들어오는데, webpack 은 실제로 쓰이는 것만
 *     남긴다(tree-shaking). 실측 2026-08-19: `route:quiet-picks` 123 모듈 중 대부분이 배럴 경유다.
 *     그래서 이 지표는 **절대값이 아니라 방향**으로 읽는다 — 늘었으면 왜 늘었는지 본다.
 *     실제 람다 크기는 Vercel 이 알려준다(504 당시 10.15MB). 그 숫자를 여기서 대신하지 않는다.
 *  ② **조립 처리량** — 고정 모의 데이터로 덱 구성·랭킹을 N회 돌린 시간. 알고리즘 퇴화(O(n²) 등)를 잡는다.
 *
 * ## 임계값을 어떻게 잡았나
 *
 * ①은 **현재 실측 + 여유**다. 이 축은 사람이 의존성을 추가할 때만 움직이므로 타이트하게 잡는다.
 * ②는 **현재 실측 × 10** 이다. CI 러너의 성능은 실행마다 흔들리고, 촘촘한 시간 임계는
 * 회귀가 아니라 **잡음으로 실패**한다. 잡음으로 실패하는 게이트는 곧 꺼진다 —
 * 그래서 자릿수 퇴화만 잡는다. 정밀한 지연은 프로덕션 감시(`fomo-quality-report`)의 몫이다.
 *
 * 실행: npx tsx scripts/perf-regression-gate.ts [--update]
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const REPO_ROOT = join(__dirname, "..");
const BUDGET_PATH = join(REPO_ROOT, "docs", "quality", "perf-budget.json");

interface Budget {
  note: string;
  /** 조회 경로 엔트리별 전이 로컬 모듈 수 상한. */
  importWeight: Record<string, number>;
  /** 조회 경로 엔트리별 외부 패키지 수 상한 — 번들 무게의 실질 대리 지표. */
  externalWeight: Record<string, number>;
  /** 조립 벤치 상한(ms). 실측 × 10. */
  assemblyMs: Record<string, number>;
}

// ── ① 콜드 임포트 무게 — 정적 전이 그래프 ──────────────────────────────────
/**
 * 조회 경로 엔트리 — **요청마다 로딩되는 라우트 파일 그대로**. 라이브러리 층이 아니다.
 * 504 는 라우트 모듈이 끌고 온 것 전체의 비용이었으므로, 재는 지점도 라우트여야 한다.
 */
const REQUEST_PATH_ENTRIES: Record<string, string> = {
  "route:quiet-picks": "apps/web/app/api/fomo/quiet-picks/route.ts",
  "route:track-record-picks": "apps/web/app/api/fomo/track-record/picks/route.ts",
  "route:daily-30": "apps/web/app/api/fomo/daily-30/route.ts",
};

/** 참고용 — 크론(배치)은 무거워도 된다. 조회와 섞이지 않았음을 보이려고 같이 잰다. */
const BATCH_ENTRIES: Record<string, string> = {
  "cron:quiet-pick": "apps/web/app/api/fomo/cron/quiet-pick/route.ts",
};

/**
 * `import type` / `export type` 는 **세지 않는다.**
 *
 * TypeScript 가 지워버리므로 번들·콜드스타트에 기여하지 않는다. 세면 지표가 자기 이름을
 * 배신한다 — 실측(2026-08-19)에서 조회 라우트가 타입 전용으로 참조하는 배치 엔진 때문에
 * 전이 모듈 169개로 잡혔다. 그 숫자로 경보를 울리면 아무 의미 없는 실패가 된다.
 */
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/g;
/** 지운 것을 기록해 둔다 — "왜 이 모듈이 안 세지나" 를 나중에 되묻지 않게. */
const TYPE_ONLY_RE = /(?:^|\n)\s*(?:import|export)\s+type\s[^;]*?from\s+["']([^"']+)["']/g;

function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) {
    // 별칭은 워크스페이스 소스로 되돌린다 — node_modules 는 이 축의 대상이 아니다.
    if (spec === "@fomo/core") return join(REPO_ROOT, "packages/fomo-core/src/index.ts");
    if (spec === "@fomo/shared") return join(REPO_ROOT, "packages/shared/src/index.ts");
    return null;
  }
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith(".json")) {
      try {
        if (readFileSync(candidate, "utf8")) return candidate;
      } catch {
        /* 디렉터리 */
      }
    }
  }
  return null;
}

export interface GraphResult {
  /** 전이 로컬 모듈 수(값 임포트만). */
  modules: number;
  /** 전이 그래프가 끌어오는 외부 패키지 수 — 번들 무게의 실질 대리 지표다. */
  externals: number;
  /** 타입 전용으로만 참조돼 세지 않은 모듈 수(설명용). */
  typeOnlySkipped: number;
}

/** 전이 그래프. 순환은 방문 집합으로 끊는다. */
function analyzeGraph(entry: string): GraphResult {
  const seen = new Set<string>();
  const externals = new Set<string>();
  let typeOnlySkipped = 0;
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(source)) !== null) {
      const spec = m[1]!;
      const next = resolveLocal(file, spec);
      if (next) stack.push(next);
      else if (!spec.startsWith(".")) externals.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);
    }
    TYPE_ONLY_RE.lastIndex = 0;
    while (TYPE_ONLY_RE.exec(source) !== null) typeOnlySkipped += 1;
  }
  seen.delete(entry);
  return { modules: seen.size, externals: externals.size, typeOnlySkipped };
}

// ── ② 조립 처리량 — 고정 모의 데이터 ────────────────────────────────────────
/** 종목 수를 고정한다 — 입력이 흔들리면 시간도 흔들리고 게이트가 의미를 잃는다. */
const FIXED_CANDIDATES = 200;
const ITERATIONS = 200;

async function benchDeckComposition(): Promise<number> {
  const { composeDeck, rankScore } = await import("../apps/web/lib/deck-ranking");
  // 결정론 입력: 경과일·유형을 순환시켜 200개를 만든다. 난수 금지(실행마다 달라지면 비교 불가).
  const kinds = ["insider_cluster", "institution_streak", "foreign_streak", "multi_cluster"];
  const candidates = Array.from({ length: FIXED_CANDIDATES }, (_, i) => ({
    kind: kinds[i % kinds.length]!,
    ageDays: i % 20,
    score: rankScore({ ageDays: i % 20, page1Streak: i % 9, anomalyStrength: (i % 43) / 10 }),
  })).sort((a, b) => b.score - a.score);

  const started = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) composeDeck(candidates, { deckSize: 10 });
  return performance.now() - started;
}

function loadBudget(): Budget | null {
  if (!existsSync(BUDGET_PATH)) return null;
  return JSON.parse(readFileSync(BUDGET_PATH, "utf8")) as Budget;
}

async function main(): Promise<void> {
  const update = process.argv.includes("--update");
  const graphs: Record<string, GraphResult> = {};
  for (const [name, rel] of Object.entries(REQUEST_PATH_ENTRIES)) graphs[name] = analyzeGraph(join(REPO_ROOT, rel));
  const measuredWeight = Object.fromEntries(Object.entries(graphs).map(([k, g]) => [k, g.modules]));
  const measuredExternals = Object.fromEntries(Object.entries(graphs).map(([k, g]) => [k, g.externals]));
  const assemblyMs = { deckComposition: Math.round(await benchDeckComposition()) };

  console.log("── 성능 회귀 게이트 ──");
  console.log("① 콜드 임포트 무게 (값 임포트만 — 타입 전용은 지워지므로 세지 않는다)");
  console.log("   엔트리                          로컬모듈  외부패키지  (타입전용 제외)");
  for (const [name, g] of Object.entries(graphs)) {
    console.log(`   ${name.padEnd(30)} ${String(g.modules).padStart(7)} ${String(g.externals).padStart(10)}  ${g.typeOnlySkipped}`);
  }
  console.log("   — 참고: 배치는 무거워도 된다(크론 maxDuration 300s). 조회와 섞이지 않았음을 보인다.");
  for (const [name, rel] of Object.entries(BATCH_ENTRIES)) {
    const g = analyzeGraph(join(REPO_ROOT, rel));
    console.log(`   ${name.padEnd(30)} ${String(g.modules).padStart(7)} ${String(g.externals).padStart(10)}  ${g.typeOnlySkipped}`);
  }
  console.log(`② 조립 처리량 — ${FIXED_CANDIDATES}후보 × ${ITERATIONS}회: ${assemblyMs.deckComposition}ms`);

  if (update) {
    const budget: Budget = {
      note:
        "CTX-07 §4 성능 예산. importWeight = 실측 + 여유(의존성 추가 시에만 움직이므로 타이트). " +
        "assemblyMs = 실측 × 10(CI 러너 편차로 인한 잡음 실패를 막는다 — 자릿수 퇴화만 잡는 게이트다). " +
        "갱신: npx tsx scripts/perf-regression-gate.ts --update",
      importWeight: Object.fromEntries(Object.entries(measuredWeight).map(([k, v]) => [k, v + 5])),
      externalWeight: Object.fromEntries(Object.entries(measuredExternals).map(([k, v]) => [k, v + 2])),
      assemblyMs: Object.fromEntries(Object.entries(assemblyMs).map(([k, v]) => [k, Math.max(50, v * 10)])),
    };
    writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, 2)}\n`);
    console.log(`\n예산 갱신 — ${BUDGET_PATH}`);
    return;
  }

  const budget = loadBudget();
  if (!budget) {
    console.error("\n예산 파일이 없다 — npx tsx scripts/perf-regression-gate.ts --update 로 먼저 만든다");
    process.exit(3);
  }

  const failures: string[] = [];
  for (const [name, n] of Object.entries(measuredWeight)) {
    const limit = budget.importWeight[name];
    if (limit == null) {
      failures.push(`${name}: 예산에 없는 엔트리 — 예산을 갱신할 것`);
    } else if (n > limit) {
      failures.push(
        `${name}: 전이 모듈 ${n} > 예산 ${limit}. 조회 경로에 의존성이 늘었다 — 콜드스타트가 나빠진다(504 사고의 원인)`
      );
    }
  }
  for (const [name, n] of Object.entries(measuredExternals)) {
    const limit = budget.externalWeight?.[name];
    if (limit != null && n > limit) {
      failures.push(`${name}: 외부 패키지 ${n} > 예산 ${limit}. 조회 번들이 무거워졌다 — 람다 크기·콜드스타트를 볼 것`);
    }
  }
  for (const [name, ms] of Object.entries(assemblyMs)) {
    const limit = budget.assemblyMs[name];
    if (limit != null && ms > limit) {
      failures.push(`${name}: ${ms}ms > 예산 ${limit}ms. 자릿수 퇴화다 — 알고리즘을 볼 것`);
    }
  }

  if (failures.length > 0) {
    console.error("\n❌ 성능 예산 초과");
    for (const f of failures) console.error(`  - ${f}`);
    console.error("\n예산을 올리는 것은 마지막 수단이다. 먼저 왜 늘었는지 본다.");
    process.exit(1);
  }
  console.log("\n✅ 예산 안");
}

main().catch((error) => {
  console.error("[perf-gate] 실패", error);
  process.exit(3);
});

/**
 * FCE 파이썬 사이드카 — 러너가 못 여는 FCE 파일을 대신 읽어 **업로더 캐시**를 채운다 (UI-10).
 *
 * ## 왜
 *
 * 러너(`runner.ts`)가 FCE 자신의 함수를 부를 때(`fce-whale-report.py` · `fce-paper-analysis.py`) 러너 프로세스는
 * `~/Documents` 아래 FCE 파일을 못 읽는다 — `PermissionError: Operation not permitted`(러너를 띄운 쪽의 권한 문제).
 * 업로더는 실패하면 캐시(2시간 안)를 쓴다. 이 사이드카가 **읽을 수 있는 프로세스에서** 그 캐시를 10분마다 채운다.
 *
 * - 토큰이 필요 없다 — LAB 에 올리지 않는다. FCE 를 읽고 `/tmp/fce-upload-cache` 에 쓸 뿐이다
 * - 열린 페이퍼 포지션은 LAB 의 공개 조립본에서 읽는다(FCE 대시보드를 한 번 더 부르지 않는다)
 *
 *   npx tsx scripts/lab/fce-sidecar.ts           # 10분마다
 *   npx tsx scripts/lab/fce-sidecar.ts --once
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FCE_BACKEND, FCE_PYTHON } from "./fce-home";

const LAB = process.env.LAB_BASE_URL ?? "https://fomo-web-mlender-ais-projects.vercel.app";
const CACHE_DIR = process.env.FCE_CACHE_DIR ?? "/tmp/fce-upload-cache";
const REPO = process.cwd();
const EVERY_MS = 10 * 60 * 1000;

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

async function once(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });

  // 리더보드 · 24시간 관측 — 업로더 `whaleReport` 의 캐시와 같은 모양.
  try {
    const out = execFileSync(FCE_PYTHON, [join(REPO, "scripts/lab/fce-whale-report.py")], { cwd: FCE_BACKEND, encoding: "utf8", timeout: 120_000 });
    const body = JSON.parse(out) as { leaderboard?: unknown; observation?: unknown };
    writeFileSync(join(CACHE_DIR, "whale-report.json"), JSON.stringify({ at: Date.now(), leaderboard: body.leaderboard ?? null, observation: body.observation ?? null }));
    console.log(`[${stamp()}] 고래 리포트 ✅`);
  } catch (error) {
    console.log(`[${stamp()}] 고래 리포트 ❌ ${error instanceof Error ? error.message.slice(0, 160) : error}`);
  }

  // 페이퍼 포지션 분석 — 업로더 `withAnalysis` 의 캐시(포지션 id → { at, analysis })와 같은 모양.
  try {
    const res = await fetch(`${LAB}/api/lab/positions`, { signal: AbortSignal.timeout(30_000) });
    const positions = ((await res.json()) as { data?: { positions?: Record<string, unknown>[] } }).data?.positions ?? [];
    if (positions.length > 0) {
      const input = JSON.stringify(
        positions.map((p) => ({ id: p.id, symbol: p.symbol, direction: p.direction, entryPrice: p.entryPrice, quantity: p.quantity, leverage: p.leverage, markPrice: p.markPrice }))
      );
      const out = JSON.parse(
        execFileSync(FCE_PYTHON, [join(REPO, "scripts/lab/fce-paper-analysis.py")], { cwd: FCE_BACKEND, input, encoding: "utf8", timeout: 180_000 })
      ) as Record<string, { error?: string }>;
      const file = join(CACHE_DIR, "paper-analysis.json");
      let saved: Record<string, unknown> = {};
      try {
        saved = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        // 처음.
      }
      let ok = 0;
      for (const [id, a] of Object.entries(out)) {
        if (a && !a.error) {
          saved[id] = { at: Date.now(), analysis: a };
          ok += 1;
        }
      }
      writeFileSync(file, JSON.stringify(saved));
      console.log(`[${stamp()}] 포지션 분석 ✅ ${ok}/${positions.length}`);
    }
  } catch (error) {
    console.log(`[${stamp()}] 포지션 분석 ❌ ${error instanceof Error ? error.message.slice(0, 160) : error}`);
  }
}

async function main(): Promise<void> {
  await once();
  if (process.argv.includes("--once")) return;
  setInterval(() => void once(), EVERY_MS);
}

void main();

/**
 * 심장박동 모으기 (OPS-03 A) — 러너가 1분마다 LAB 에 올린다.
 *
 * - FCE `/api/system/worker` — 잡별 마지막 실제 실행 시각(20KB · 0.1초). 무거운 대시보드는 부르지 않는다
 * - FCE `stock_paper_tracks` — 시장별 상태 · 관측 시각(DB 읽기 전용). API 에 없는 칸이다
 *
 * FCE 에 못 닿아도 **심장박동은 올린다** — `reachable: false` 로. 그래야 맥 밖에서 "맥은 살아 있고 FCE 가 죽었다" 가 갈린다.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { WATCHED_JOBS, type HeartbeatPayload } from "../../apps/web/lib/lab/watch";
import { FCE_DB } from "./fce-home";

const execFileAsync = promisify(execFile);
const FCE = process.env.FCE_BASE_URL ?? "http://127.0.0.1:8875";

type WorkerJob = { last_effective_run_at?: string | null; last_success_at?: string | null };

export async function collectHeartbeat(now: Date = new Date()): Promise<HeartbeatPayload> {
  const jobs: Record<string, string | null> = {};
  let reachable = false;
  let error: string | null = null;
  try {
    const res = await fetch(`${FCE}/api/system/worker`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`FCE /api/system/worker ${res.status}`);
    const body = (await res.json()) as { jobs?: Record<string, WorkerJob> };
    for (const name of WATCHED_JOBS) {
      const j = body.jobs?.[name];
      jobs[name] = j?.last_effective_run_at ?? j?.last_success_at ?? null;
    }
    reachable = true;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 160) : "FCE 에 닿지 못했다";
  }

  let stock: HeartbeatPayload["stock"] = [];
  try {
    const { stdout } = await execFileAsync(
      "sqlite3",
      ["-readonly", "-json", FCE_DB, "SELECT market, status, stop_reason, last_market_observed_at FROM stock_paper_tracks"],
      { timeout: 20_000 }
    );
    const rows = JSON.parse(stdout || "[]") as { market: string; status: string; stop_reason: string | null; last_market_observed_at: string | null }[];
    stock = rows
      .filter((r) => r.market === "KR" || r.market === "US")
      .map((r) => ({ market: r.market as "KR" | "US", status: r.status, stopReason: r.stop_reason, observedAt: r.last_market_observed_at }));
  } catch {
    // 못 읽으면 빈 배열 — 주식 판정은 "모름" 으로 남는다(알림을 지어내지 않는다).
  }
  return { at: now.toISOString(), fce: { reachable, error, jobs }, stock };
}

/**
 * B1a — Outcome Grounding 스냅샷.
 *
 * KR↔측정신호 매핑(metric-registry.json)을 읽어 각 지표의 현재값을 한 번에 떠서
 * generated/outcomes/okr-snapshot-<date>.json 으로 남긴다. 시계열이 쌓인다.
 *
 * "활동(제안→머지)"만 보던 시스템에 "지표가 실제로 움직였는가(결과)"를 보는
 * 나침반의 베이스라인. 취득 실패 지표는 null(unknown) — 파이프라인 안 죽음(폴백 철학).
 *
 * 순수 함수(captureSnapshot) + 주입 fetcher → vitest. 외부 취득은 CLI 경계에서만.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

export type MetricSource = "github-issues" | "repo-files" | "ci-or-test" | "manual";
export type Direction = "up" | "down";

export interface Metric {
  id: string;
  okr: string;
  label: string;
  source: MetricSource;
  query: string;
  direction: Direction;
  target?: number;
  auto: boolean;
}

export interface Registry {
  metrics: Metric[];
}

export interface Snapshot {
  date: string;
  values: Record<string, number | null>;
}

/** 소스별 취득 함수. number 반환 또는 null(측정 불가). 절대 throw 밖으로 내보내지 않음. */
export type Fetcher = (m: Metric) => number | null;

export function loadRegistry(path: string): Registry {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as { metrics?: unknown };
  if (!Array.isArray(parsed.metrics)) throw new Error("metric-registry: metrics 배열 필요");
  return { metrics: parsed.metrics as Metric[] };
}

/**
 * 레지스트리의 각 지표를 fetcher 로 취득해 스냅샷 생성(순수).
 * - auto=false 또는 해당 source fetcher 없음 → null
 * - fetcher 가 throw 하거나 비유한값 반환 → null (degrade)
 */
export function captureSnapshot(
  registry: Registry,
  fetchers: Partial<Record<MetricSource, Fetcher>>,
  today: string,
): Snapshot {
  const values: Record<string, number | null> = {};
  for (const m of registry.metrics) {
    if (!m.auto) {
      values[m.id] = null;
      continue;
    }
    const fetcher = fetchers[m.source];
    if (!fetcher) {
      values[m.id] = null;
      continue;
    }
    try {
      const v = fetcher(m);
      values[m.id] = typeof v === "number" && Number.isFinite(v) ? v : null;
    } catch {
      values[m.id] = null;
    }
  }
  return { date: today, values };
}

// ─────────────────────────────────────────────────────────────
// 실 취득 fetcher (CLI 경계 — execFile/fs)
// ─────────────────────────────────────────────────────────────

/** "label:X state:open author:Y" 형태 쿼리를 gh issue list 인자로 파싱. */
export function parseIssueQuery(query: string): { labels: string[]; state: string } {
  const labels: string[] = [];
  let state = "open";
  for (const tok of query.split(/\s+/)) {
    const [k, v] = tok.split(":");
    if (k === "label" && v) labels.push(v);
    else if (k === "state" && v) state = v;
  }
  return { labels, state };
}

function githubIssuesFetcher(m: Metric): number | null {
  const { labels, state } = parseIssueQuery(m.query);
  const args = ["issue", "list", "--state", state, "--limit", "200", "--json", "number"];
  for (const l of labels) args.push("--label", l);
  const out = execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const arr = JSON.parse(out) as unknown[];
  return Array.isArray(arr) ? arr.length : null;
}

function repoFilesFetcher(m: Metric): number | null {
  // git ls-files 는 glob 패턴을 지원. 추적 파일만 카운트(결정론적).
  const out = execFileSync("git", ["ls-files", "--", m.query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return out.split("\n").filter((l) => l.trim().length > 0).length;
}

export const REAL_FETCHERS: Partial<Record<MetricSource, Fetcher>> = {
  "github-issues": githubIssuesFetcher,
  "repo-files": repoFilesFetcher,
  // ci-or-test, manual 은 B1a 에서 null(향후/수동)
};

// ─────────────────────────────────────────────────────────────
// CLI: outcome-snapshot.ts <registry.json> <outDir> [today]
// ─────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv;
  const registryPath = argv[2] ?? "generated/outcomes/metric-registry.json";
  const outDir = argv[3] ?? "generated/outcomes";
  const today = argv[4] ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const registry = loadRegistry(registryPath);
  const snapshot = captureSnapshot(registry, REAL_FETCHERS, today);
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/okr-snapshot-${today}.json`;
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  process.stdout.write(`snapshot → ${outPath}\n`);
  process.stdout.write(JSON.stringify(snapshot) + "\n");
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("outcome-snapshot")) {
  main();
}

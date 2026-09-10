/**
 * B1c — 베팅 재측정 · 판정.
 *
 * 베팅 카드(generated/outcomes/bets/<pr>.json) 중 기한이 도래한 pending 을 찾아
 * 같은 지표의 *현재값*을 다시 재서 baseline 과 비교 → 판정:
 *   moved    — 원하는 방향(direction)으로 의미있게 이동
 *   flat     — 거의 변화 없음
 *   worsened — 반대 방향으로 이동
 *   unknown  — baseline 또는 현재값이 null(측정 불가)
 *
 * ⚠️ 상관 기록만. "지표가 움직였다 = 이 PR 덕분"이라 단정하지 않는다(중립어).
 * 순수 함수(judge) + CLI + vitest. 외부 취득은 outcome-snapshot 재사용(CLI 경계).
 */

import { readFileSync, writeFileSync, appendFileSync, readdirSync, mkdirSync } from "node:fs";

export type Verdict = "moved" | "flat" | "worsened" | "unknown";
export type Direction = "up" | "down";

export interface Bet {
  pr: number;
  issue: number | null;
  metricId: string;
  expectedDirection: Direction | null;
  baselineValue: number | null;
  mergedAt: string;
  checkAfterDays: number;
  status: "pending" | "checked";
}

export interface LedgerEntry {
  pr: number;
  issue: number | null;
  metricId: string;
  baseline: number | null;
  after: number | null;
  direction: Direction | null;
  verdict: Verdict;
  checkedAt: string;
}

/** 의미있는 이동으로 볼 최소 상대 변화(5%) — 노이즈 컷. */
const MIN_REL_CHANGE = 0.05;

/**
 * 베팅 + 현재값 → 판정(순수).
 * direction 이 null 이면 절대 변화 방향을 좋다/나쁘다로 못 정하므로,
 * 변화가 있으면 moved, 없으면 flat (보수적).
 */
export function judge(bet: Bet, currentValue: number | null, checkedAt: string): LedgerEntry {
  const base = bet.baselineValue;
  const after = currentValue;

  let verdict: Verdict;
  if (base === null || after === null || !Number.isFinite(base) || !Number.isFinite(after)) {
    verdict = "unknown";
  } else {
    const delta = after - base;
    // 변화량 임계 — baseline 이 0이면 절대 1 이상 변화, 아니면 5% 이상
    const threshold = base === 0 ? 1 : Math.abs(base) * MIN_REL_CHANGE;
    if (Math.abs(delta) < threshold) {
      verdict = "flat";
    } else if (bet.expectedDirection === null) {
      // 방향 미지정 → 변화는 있으나 좋고나쁨 판단 불가 → moved(중립적 "움직임")
      verdict = "moved";
    } else {
      const movedDesiredWay =
        (bet.expectedDirection === "up" && delta > 0) ||
        (bet.expectedDirection === "down" && delta < 0);
      verdict = movedDesiredWay ? "moved" : "worsened";
    }
  }

  return {
    pr: bet.pr,
    issue: bet.issue,
    metricId: bet.metricId,
    baseline: base,
    after,
    direction: bet.expectedDirection,
    verdict,
    checkedAt,
  };
}

/** 베팅이 지금 재측정 대상인가 (pending && mergedAt + checkAfterDays <= today). */
export function isDue(bet: Bet, today: string): boolean {
  if (bet.status !== "pending") return false;
  const due = addDays(bet.mergedAt, bet.checkAfterDays);
  return due <= today;
}

/** YYYY-MM-DD + days → YYYY-MM-DD (UTC 기준 산술). */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// CLI: outcome-judge.ts <betsDir> <snapshotFile> <ledgerFile> [today]
//   - betsDir 의 pending && due 베팅을 snapshot 현재값으로 판정
//   - ledgerFile(jsonl)에 append, 베팅 status=checked 로 갱신
// ─────────────────────────────────────────────────────────────

function loadSnapshotValues(path: string): Record<string, number | null> {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { values?: Record<string, number | null> };
    return parsed.values ?? {};
  } catch {
    return {};
  }
}

function main(): void {
  const argv = process.argv;
  const betsDir = argv[2] ?? "generated/outcomes/bets";
  const snapshotFile = argv[3] ?? "";
  const ledgerFile = argv[4] ?? "generated/outcomes/ledger.jsonl";
  const today = argv[5] ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const values = loadSnapshotValues(snapshotFile);

  let files: string[] = [];
  try {
    files = readdirSync(betsDir).filter((f) => f.endsWith(".json"));
  } catch {
    process.stdout.write("no bets dir\n");
    return;
  }

  const judged: LedgerEntry[] = [];
  for (const f of files) {
    const path = `${betsDir}/${f}`;
    let bet: Bet;
    try {
      bet = JSON.parse(readFileSync(path, "utf8")) as Bet;
    } catch {
      continue;
    }
    if (!isDue(bet, today)) continue;
    const current = Object.prototype.hasOwnProperty.call(values, bet.metricId)
      ? values[bet.metricId]
      : null;
    const entry = judge(bet, current ?? null, today);
    judged.push(entry);
    // 베팅 status 갱신
    bet.status = "checked";
    writeFileSync(path, JSON.stringify(bet, null, 2) + "\n", "utf8");
  }

  if (judged.length > 0) {
    mkdirSync(ledgerFile.replace(/\/[^/]*$/, "") || ".", { recursive: true });
    appendFileSync(ledgerFile, judged.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  }

  process.stdout.write(`judged=${judged.length}\n`);
  process.stdout.write(JSON.stringify(judged) + "\n");
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("outcome-judge")) {
  main();
}

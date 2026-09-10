/**
 * B1b — 머지 시점 "베팅 카드" 생성.
 *
 * Auto PR 이 머지될 때, 그 PR 이 참조한 제안의 Target-Metric 을 읽어
 * 해당 지표의 *현재 스냅샷값(baseline)* 과 함께 베팅 카드를 만든다.
 *   generated/outcomes/bets/<pr>.json
 * N일 뒤 B1c 가 같은 지표를 재측정해 "움직였나"를 판정한다.
 *
 * 순수 함수(buildBet/parseTargetMetric) + CLI + vitest. 외부 취득 없음.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

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

/** 제안/PR 본문에서 Target-Metric / Expected-Direction 필드 추출. */
export function parseTargetMetric(text: string): {
  metricId: string | null;
  direction: Direction | null;
} {
  const t = text || "";
  const midMatch = t.match(/Target-Metric:\s*([A-Za-z0-9_\-]+)/i);
  const dirMatch = t.match(/Expected-Direction:\s*(up|down)/i);
  const metricId = midMatch && midMatch[1] ? midMatch[1].trim() : null;
  const direction = dirMatch && dirMatch[1] ? (dirMatch[1].toLowerCase() as Direction) : null;
  // placeholder/none 류는 무시
  if (!metricId || /^(none|n\/a|na|tbd|metric|id)$/i.test(metricId)) {
    return { metricId: null, direction };
  }
  return { metricId, direction };
}

/** 본문에서 첫 번째 이슈 참조(#NNN)를 추출. */
export function parseIssueRef(text: string): number | null {
  const m = (text || "").match(/#(\d+)/);
  return m && m[1] ? Number(m[1]) : null;
}

export interface BuildBetInput {
  pr: number;
  text: string;
  /** okr-snapshot 의 values (metricId → number|null) */
  snapshotValues: Record<string, number | null>;
  mergedAt: string;
  checkAfterDays?: number;
}

/**
 * 베팅 카드 생성(순수). Target-Metric 이 없으면 null(베팅 카드 안 만듦).
 * baseline 은 스냅샷에서 가져오되, 없으면 null(unknown — 측정 불가).
 */
export function buildBet(input: BuildBetInput): Bet | null {
  const { metricId, direction } = parseTargetMetric(input.text);
  if (!metricId) return null;
  const baseline = Object.prototype.hasOwnProperty.call(input.snapshotValues, metricId)
    ? input.snapshotValues[metricId]
    : null;
  return {
    pr: input.pr,
    issue: parseIssueRef(input.text),
    metricId,
    expectedDirection: direction,
    baselineValue: baseline ?? null,
    mergedAt: input.mergedAt,
    checkAfterDays: input.checkAfterDays ?? 7,
    status: "pending",
  };
}

// ─────────────────────────────────────────────────────────────
// CLI: outcome-bet.ts <pr> <bodyFile> <snapshotFile> <mergedAt> <outDir> [checkAfterDays]
// ─────────────────────────────────────────────────────────────

function loadSnapshotValues(path: string): Record<string, number | null> {
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { values?: Record<string, number | null> };
    return parsed.values ?? {};
  } catch {
    return {};
  }
}

function main(): void {
  const argv = process.argv;
  const pr = Number(argv[2]);
  const bodyFile = argv[3] ?? "";
  const snapshotFile = argv[4] ?? "";
  const mergedAt = argv[5] ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const outDir = argv[6] ?? "generated/outcomes/bets";
  const checkAfterDays = argv[7] ? Number(argv[7]) : 7;

  if (!Number.isInteger(pr) || pr <= 0) {
    console.error("usage: outcome-bet.ts <pr> <bodyFile> <snapshotFile> <mergedAt> <outDir> [checkAfterDays]");
    process.exit(1);
    return;
  }

  let text = "";
  try {
    text = readFileSync(bodyFile, "utf8");
  } catch {
    text = "";
  }

  const bet = buildBet({
    pr,
    text,
    snapshotValues: loadSnapshotValues(snapshotFile),
    mergedAt,
    checkAfterDays,
  });

  if (!bet) {
    process.stdout.write("no-target-metric\n");
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/${pr}.json`;
  writeFileSync(outPath, JSON.stringify(bet, null, 2) + "\n", "utf8");
  process.stdout.write(`bet → ${outPath}\n`);
  process.stdout.write(JSON.stringify(bet) + "\n");
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("outcome-bet")) {
  main();
}

/**
 * LAUNCH-P2 §A-1·§B-1 — **공시 본문에서 숫자가 몇 %나 나오나.**
 *
 * 프로덕션 페이로드의 공시 링크를 그대로 훑어 본문 파서를 돌린다. 배포 없이 재는 수단이고,
 * 출시 후에도 확보율을 확인하는 자리다(§D 대시보드의 손 계측 버전).
 *
 * ```
 * npx tsx scripts/audit-dart-body.ts            # 프로덕션 페이로드에서 링크를 캔다
 * npx tsx scripts/audit-dart-body.ts a.json     # 내려둔 페이로드로
 * ```
 */
import { readFileSync } from "node:fs";
import { readDartBodyFacts, fetchDartBodyText } from "../apps/web/lib/dart-body";
import { amountLabelsFor } from "@fomo/core/keyword-cards/disclosure-body";
import { EARNINGS_REPORT_TITLE } from "@fomo/core/keyword-cards/disclosure-figures";

const API = process.env["AUDIT_API"] ?? "https://fomo-club-backend.vercel.app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { rcp: string; text: string; hadFigures: boolean }

async function payload(): Promise<unknown> {
  const file = process.argv[2];
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const res = await fetch(`${API}/api/fomo/quiet-picks`, { signal: AbortSignal.timeout(40_000) });
  return res.json();
}

async function main(): Promise<void> {
  const data = (await payload()) as { picks?: Array<{ whyNow?: Array<Record<string, unknown>> }> };
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const pick of data.picks ?? []) {
    for (const event of pick.whyNow ?? []) {
      const url = typeof event["url"] === "string" ? event["url"] : "";
      if (!url.includes("rcpNo=")) continue;
      const rcp = url.split("rcpNo=")[1]!;
      if (seen.has(rcp)) continue;
      seen.add(rcp);
      rows.push({ rcp, text: String(event["text"] ?? ""), hadFigures: Boolean(event["figures"]) });
    }
  }

  let bodyOk = 0, earnings = 0, amounts = 0, amountForms = 0, earningsForms = 0;
  const lines: string[] = [];
  for (const row of rows) {
    const body = await fetchDartBodyText(row.rcp);
    await sleep(300);
    if (!body) { lines.push(`  ! ${row.text.slice(0, 34)} — 본문 못 읽음`); continue; }
    bodyOk += 1;
    /**
     * 제목 원문이 페이로드에 없다(번역돼서 나간다). 본문 첫 줄에 서식명이 들어 있으므로
     * 그것을 제목 대신 쓴다 — 금액 서식 판정에 필요하다.
     */
    const head = body.slice(0, 160);
    const isAmountForm = amountLabelsFor(head) !== null;
    const isEarningsForm = EARNINGS_REPORT_TITLE.test(head.replace(/\s+/g, ""));
    if (isAmountForm) amountForms += 1;
    if (isEarningsForm) earningsForms += 1;
    const facts = await readDartBodyFacts(row.rcp, head);
    if (facts?.earnings) earnings += 1;
    if (facts?.amount) amounts += 1;
    const mark = facts?.earnings || facts?.amount ? "✓" : "-";
    const got = [
      facts?.earnings ? `실적 ${facts.earnings.periodLabel} ${facts.earnings.rows.length}줄` : "",
      facts?.amount ? `${facts.amount.label} ${Math.round(facts.amount.won / 1e8)}억` : "",
    ].filter(Boolean).join(" · ");
    lines.push(`  ${mark} ${row.text.slice(0, 34).padEnd(36)}${got}${isAmountForm && !facts?.amount ? " (금액 서식인데 못 뽑음)" : ""}`);
  }

  console.log(`공시 ${rows.length}건 · 본문 읽힘 ${bodyOk}건\n`);
  console.log(lines.join("\n"));
  console.log(`\n실적: 본문에서 ${earnings}건 (실적 서식 ${earningsForms}건 기준 ${pct(earnings, earningsForms)})`);
  console.log(`금액: 본문에서 ${amounts}건 (금액 서식 ${amountForms}건 기준 ${pct(amounts, amountForms)} · 전체 ${rows.length}건 기준 ${pct(amounts, rows.length)})`);
}

function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "표본 0";
}

main().catch((e) => { console.error(e); process.exit(1); });

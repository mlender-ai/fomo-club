/**
 * WO-SUB-03 §4-5·§10 — **자동 검증기 신뢰도 확인.**
 *
 * 지시서 §10: "골든셋 30종목 사람 검증을 자동 검증기 신뢰도 확인 후에 진행할 것.
 * 자동 검증기가 부정확하면 전체 파이프라인의 품질 신호가 거짓이 된다."
 *
 * 그래서 **정답이 이미 아는 케이스**로 검증기를 먼저 시험한다. 실제 종목이 아니라
 * 손으로 만든 케이스다 — 지지되는 문장/지지되지 않는 문장을 각각 넣고 검증기가 갈라내는지 본다.
 * 이건 골든셋보다 먼저 돌아야 한다.
 *
 * 실행: npx tsx --env-file=.env scripts/business-context-verifier-check.ts [--out docs/business-context]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceChunk } from "@fomo/core";
import { verifySentence } from "../apps/web/lib/business-context/synthesize";

/** [문장, 청크 원문, 정답(지지되는가), 이 케이스가 무엇을 시험하는가] */
type Case = readonly [string, string, boolean, string];

const CHUNK_A =
  "Columbia Bank operates 100 full-service banking offices located throughout New Jersey and in the New York City area. " +
  "The Bank's principal business consists of attracting retail and business deposits from the general public and investing " +
  "those deposits, together with funds generated from operations and borrowings, in residential mortgage loans, " +
  "commercial real estate loans and multifamily loans.";

const CHUNK_B =
  "Our net interest income is affected by the shape of the market yield curve and the timing of repricing of our assets " +
  "and liabilities. Deposit competition in our market area has increased the cost of interest-bearing deposits.";

const CHUNK_C =
  "Shopify provides essential internet infrastructure for commerce. Merchants pay us subscription fees for our platform " +
  "and merchant solutions revenue, which includes payment processing fees, is our largest revenue component.";

const CASES: readonly Case[] = [
  // ── 지지되는 문장 (검증기가 true 를 줘야 한다)
  ["뉴저지·뉴욕 지역 100개 지점 기반 예수금과 대출이 주된 사업", CHUNK_A, true, "압축·재배열은 지지된다"],
  ["주거용 모기지·상업용 부동산·다세대 대출에 예수금을 운용", CHUNK_A, true, "열거를 그대로 옮긴 경우"],
  ["장단기 금리차와 예금 조달비용이 순이자이익을 좌우", CHUNK_B, true, "의존 변수 서술"],
  ["구독료와 결제수수료 중심 매출, 결제수수료가 최대 비중", CHUNK_C, true, "매출 구성"],
  // ── 지지되지 않는 문장 (검증기가 false 를 줘야 한다)
  ["뉴저지·뉴욕 지역 250개 지점을 운영", CHUNK_A, false, "수치 조작(100 → 250)"],
  ["캘리포니아 중심의 상업용 부동산 대출이 주력", CHUNK_A, false, "지명 조작"],
  ["지점망 기반 지역 밀착 영업으로 경쟁 우위 확보", CHUNK_A, false, "청크에서 추론해야만 나오는 내용 + 평가"],
  ["예금 조달비용 상승으로 순이자마진이 하락했다", CHUNK_B, false, "인과 단정 + 청크에 없는 결과"],
  ["구독료가 매출의 70%를 차지", CHUNK_C, false, "청크에 없는 비중 수치"],
  ["광고 매출이 성장의 핵심 동력", CHUNK_C, false, "청크에 없는 사업"],
];

function chunkOf(text: string, index: number): SourceChunk {
  return { source_id: `check#${index}`, doc_id: "check", chunk_index: index, kind: "disclosure", text };
}

async function main(): Promise<void> {
  const outDir = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : undefined;
  const rows: Array<{ sentence: string; expected: boolean; actual: boolean; inconclusive: boolean; span: string | null; note: string }> = [];

  for (const [index, [sentence, chunkText, expected, note]] of CASES.entries()) {
    const outcome = await verifySentence(sentence, [chunkOf(chunkText, index)]);
    rows.push({ sentence, expected, actual: outcome.supported, inconclusive: outcome.inconclusive, span: outcome.unsupportedSpan, note });
    const mark = outcome.supported === expected ? "  " : "⚠︎";
    console.log(
      `  ${mark} [${index + 1}/${CASES.length}] 기대 ${expected ? "지지" : "미지지"} → ${outcome.supported ? "지지" : "미지지"}${outcome.inconclusive ? "(판정불가)" : ""}  ${note}`
    );
  }

  const supportedCases = rows.filter((row) => row.expected);
  const unsupportedCases = rows.filter((row) => !row.expected);
  const tp = supportedCases.filter((row) => row.actual).length;
  const tn = unsupportedCases.filter((row) => !row.actual).length;
  const summary = {
    n: rows.length,
    /** 지지되는 문장을 지지된다고 판정한 비율 — 낮으면 멀쩡한 문장이 버려진다. */
    recall: Number(((tp / supportedCases.length) * 100).toFixed(1)),
    /** 지지되지 않는 문장을 걸러낸 비율 — **낮으면 파이프라인의 품질 신호가 거짓이 된다.** */
    rejectRate: Number(((tn / unsupportedCases.length) * 100).toFixed(1)),
    inconclusive: rows.filter((row) => row.inconclusive).length,
  };

  console.log("\n=== 검증기 신뢰도 ===");
  console.log(` 지지 문장 통과율(recall) ${summary.recall}%  (${tp}/${supportedCases.length})`);
  console.log(` 미지지 문장 차단율       ${summary.rejectRate}%  (${tn}/${unsupportedCases.length})`);
  console.log(` 판정 불가 ${summary.inconclusive}건`);
  console.log(
    summary.rejectRate >= 80 && summary.recall >= 75
      ? " → 골든셋을 돌릴 수 있다."
      : " → **검증기를 먼저 고쳐야 한다.** 이 상태로 골든셋을 돌리면 품질 신호가 거짓이다."
  );

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const lines: string[] = [];
    lines.push("# 자동 검증기 신뢰도 (WO-SUB-03 §4-5)");
    lines.push("");
    lines.push("> 지시서 §10: 골든셋 사람 검증은 **자동 검증기 신뢰도 확인 후에** 진행한다.");
    lines.push("> 검증기가 부정확하면 파이프라인의 품질 신호 전체가 거짓이 된다.");
    lines.push("");
    lines.push("| 지표 | 값 |");
    lines.push("|---|---|");
    lines.push(`| 지지 문장 통과율(recall) | ${summary.recall}% (${tp}/${supportedCases.length}) |`);
    lines.push(`| 미지지 문장 차단율 | ${summary.rejectRate}% (${tn}/${unsupportedCases.length}) |`);
    lines.push(`| 판정 불가 | ${summary.inconclusive}건 |`);
    lines.push("");
    lines.push("## 케이스별 결과");
    lines.push("");
    lines.push("| # | 문장 | 시험 대상 | 기대 | 판정 | 일치 |");
    lines.push("|---|---|---|---|---|---|");
    rows.forEach((row, index) => {
      lines.push(
        `| ${index + 1} | ${row.sentence} | ${row.note} | ${row.expected ? "지지" : "미지지"} | ${row.actual ? "지지" : "미지지"}${row.inconclusive ? "(불가)" : ""} | ${row.actual === row.expected ? "✅" : "⚠︎"} |`
      );
    });
    lines.push("");
    writeFileSync(join(outDir, "EVAL_verifier.md"), lines.join("\n"));
    writeFileSync(join(outDir, "verifier_check_raw.json"), JSON.stringify({ summary, rows }, null, 2));
    console.log(`\n[verifier] 저장 — ${join(outDir, "EVAL_verifier.md")}`);
  }
}

main().catch((error) => {
  console.error("[verifier] 실패", error);
  process.exit(1);
});

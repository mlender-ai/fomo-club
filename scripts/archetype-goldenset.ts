/**
 * WO-SUB-02 §8 — 골든셋 100종목 검증 + 혼동 행렬.
 *
 * 라벨링 순서(§8-1)를 지켰다: **팩트시트를 보지 않고 사업 내용 기준으로 먼저** 라벨을 붙였고,
 * 그 다음 실제 팩트시트를 조회해 분류기와 대조했다. 라벨 근거는 각 행의 세 번째 항목이다.
 *
 * 측정(§8-2):
 *  · 전체 일치율 (목표 ≥ 85%)
 *  · **위험 오분류율** = 정답이 A 인데 다른 *특정* 유형으로 분류된 비율 (목표 ≤ 5%)
 *    `UNCLASSIFIED` 로 빠진 것은 오분류가 아니다 — 프레임을 씌우지 않았으므로 오도하지 않는다
 *  · 혼동 행렬
 *
 * 실행: npx tsx scripts/archetype-goldenset.ts --out docs/archetype
 * 외부 egress 필요(SEC·Nasdaq·네이버).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyHysteresis, classifyArchetype, RULESET_VERSION, type ArchetypeCode } from "../packages/fomo-core/src/archetype";
import { buildFactSheet } from "../apps/web/lib/fundamentals/build";
import type { UniverseEntry } from "../apps/web/lib/fundamentals/universe";

/** [식별자, 이름, 기대 분류, 라벨 근거] — 식별자가 6자리면 KR. */
type Entry = readonly [string, string, ArchetypeCode, string];

const KR: readonly Entry[] = [
  ["105560", "KB금융", "BANK_FINANCIAL", "은행지주 — 예대마진이 수익의 대부분"],
  ["055550", "신한지주", "BANK_FINANCIAL", "은행지주"],
  ["086790", "하나금융지주", "BANK_FINANCIAL", "은행지주"],
  ["316140", "우리금융지주", "BANK_FINANCIAL", "은행지주"],
  ["138930", "BNK금융지주", "BANK_FINANCIAL", "지방 은행지주"],
  ["024110", "기업은행", "BANK_FINANCIAL", "국책 은행"],
  ["000810", "삼성화재", "BANK_FINANCIAL", "손해보험"],
  ["032830", "삼성생명", "BANK_FINANCIAL", "생명보험"],
  ["005940", "NH투자증권", "BANK_FINANCIAL", "증권"],
  ["016360", "삼성증권", "BANK_FINANCIAL", "증권"],
  ["005930", "삼성전자", "CYCLICAL_COMMODITY", "메모리 반도체 비중 — 제품 가격 사이클"],
  ["000660", "SK하이닉스", "CYCLICAL_COMMODITY", "메모리 반도체 — 사이클 대표"],
  ["042700", "한미반도체", "CYCLICAL_COMMODITY", "반도체 장비 — 설비 투자 사이클"],
  ["000990", "DB하이텍", "CYCLICAL_COMMODITY", "파운드리 — 가동률 사이클"],
  ["051910", "LG화학", "CYCLICAL_COMMODITY", "석유화학 — 스프레드 사이클"],
  ["011170", "롯데케미칼", "CYCLICAL_COMMODITY", "석유화학"],
  ["005490", "POSCO홀딩스", "CYCLICAL_COMMODITY", "철강 — 원료·제품 가격"],
  ["004020", "현대제철", "CYCLICAL_COMMODITY", "철강"],
  ["010950", "S-Oil", "CYCLICAL_COMMODITY", "정유 — 정제마진 사이클"],
  ["096770", "SK이노베이션", "CYCLICAL_COMMODITY", "정유·배터리"],
  ["009540", "HD한국조선해양", "CYCLICAL_COMMODITY", "조선 — 수주 사이클"],
  ["010140", "삼성중공업", "CYCLICAL_COMMODITY", "조선"],
  ["011200", "HMM", "CYCLICAL_COMMODITY", "컨테이너 해운 — 운임 사이클"],
  ["028670", "팬오션", "CYCLICAL_COMMODITY", "벌크 해운"],
  ["005380", "현대차", "CYCLICAL_COMMODITY", "완성차 — 수요 사이클"],
  ["000270", "기아", "CYCLICAL_COMMODITY", "완성차"],
  ["012330", "현대모비스", "CYCLICAL_COMMODITY", "자동차 부품"],
  ["010060", "OCI홀딩스", "CYCLICAL_COMMODITY", "폴리실리콘 — 가격 사이클"],
  ["103140", "풍산", "CYCLICAL_COMMODITY", "비철금속(구리) — 가격 사이클"],
  ["001430", "세아베스틸지주", "CYCLICAL_COMMODITY", "특수강"],
  ["185750", "종근당", "PHARMA_STABLE", "판매 중인 전문·일반의약품 매출"],
  ["000100", "유한양행", "PHARMA_STABLE", "제약 — 판매 매출 기반"],
  ["069620", "대웅제약", "PHARMA_STABLE", "제약"],
  ["128940", "한미약품", "PHARMA_STABLE", "제약"],
  ["001630", "종근당홀딩스", "PHARMA_STABLE", "제약 지주"],
  ["326030", "SK바이오팜", "PHARMA_STABLE", "세노바메이트 판매 매출 발생 — 개발단계 아님"],
  ["196170", "알테오젠", "BIOTECH_PIPELINE", "기술이전 중심 — 제품 매출 미미"],
  ["141080", "리가켐바이오", "BIOTECH_PIPELINE", "ADC 개발단계"],
  ["145720", "덴티움", "PHARMA_STABLE", "임플란트 — 판매 매출 기반 의료기기"],
  ["214450", "파마리서치", "PHARMA_STABLE", "필러·의료기기 판매"],
  ["015760", "한국전력", "MATURE_INCOME", "규제 유틸리티 — 저성장"],
  ["036460", "한국가스공사", "MATURE_INCOME", "가스 유틸리티"],
  ["017670", "SK텔레콤", "MATURE_INCOME", "통신 — 저성장·고배당"],
  ["030200", "KT", "MATURE_INCOME", "통신"],
  ["032640", "LG유플러스", "MATURE_INCOME", "통신"],
  ["035420", "NAVER", "QUALITY_COMPOUNDER", "플랫폼 — 성장 + 흑자"],
  ["035720", "카카오", "QUALITY_COMPOUNDER", "플랫폼"],
  ["018260", "삼성에스디에스", "QUALITY_COMPOUNDER", "IT서비스 — 안정 흑자"],
  ["012450", "한화에어로스페이스", "QUALITY_COMPOUNDER", "방산 — 수주 성장 + 흑자"],
  ["079550", "LIG넥스원", "QUALITY_COMPOUNDER", "방산"],
];

const US: readonly Entry[] = [
  ["JPM", "JPMorgan", "BANK_FINANCIAL", "대형 은행"],
  ["BAC", "Bank of America", "BANK_FINANCIAL", "대형 은행"],
  ["WFC", "Wells Fargo", "BANK_FINANCIAL", "대형 은행"],
  ["CLBK", "Columbia Financial", "BANK_FINANCIAL", "저축은행 지주"],
  ["RBKB", "Rhinebeck Bancorp", "BANK_FINANCIAL", "저축은행 지주"],
  ["SOFI", "SoFi", "BANK_FINANCIAL", "대출 기반 핀테크 — 예대마진 구조"],
  ["SCHW", "Charles Schwab", "BANK_FINANCIAL", "증권·은행"],
  ["ALL", "Allstate", "BANK_FINANCIAL", "손해보험"],
  ["MET", "MetLife", "BANK_FINANCIAL", "생명보험"],
  ["BLK", "BlackRock", "BANK_FINANCIAL", "자산운용"],
  ["MU", "Micron", "CYCLICAL_COMMODITY", "메모리 반도체"],
  ["WDC", "Western Digital", "CYCLICAL_COMMODITY", "HDD·낸드"],
  ["STX", "Seagate", "CYCLICAL_COMMODITY", "HDD"],
  ["NUE", "Nucor", "CYCLICAL_COMMODITY", "철강"],
  ["STLD", "Steel Dynamics", "CYCLICAL_COMMODITY", "철강"],
  ["CLF", "Cleveland-Cliffs", "CYCLICAL_COMMODITY", "철강·철광석"],
  ["DOW", "Dow", "CYCLICAL_COMMODITY", "석유화학"],
  ["LYB", "LyondellBasell", "CYCLICAL_COMMODITY", "석유화학"],
  ["CE", "Celanese", "CYCLICAL_COMMODITY", "화학"],
  ["VLO", "Valero", "CYCLICAL_COMMODITY", "정유"],
  ["MPC", "Marathon Petroleum", "CYCLICAL_COMMODITY", "정유"],
  ["PSX", "Phillips 66", "CYCLICAL_COMMODITY", "정유"],
  ["CF", "CF Industries", "CYCLICAL_COMMODITY", "비료"],
  ["MOS", "Mosaic", "CYCLICAL_COMMODITY", "비료"],
  ["FCX", "Freeport-McMoRan", "CYCLICAL_COMMODITY", "구리"],
  ["AA", "Alcoa", "CYCLICAL_COMMODITY", "알루미늄"],
  ["MATX", "Matson", "CYCLICAL_COMMODITY", "해운"],
  ["CAT", "Caterpillar", "CYCLICAL_COMMODITY", "건설기계"],
  ["DE", "Deere", "CYCLICAL_COMMODITY", "농기계"],
  ["F", "Ford", "CYCLICAL_COMMODITY", "완성차"],
  ["MSFT", "Microsoft", "QUALITY_COMPOUNDER", "소프트웨어 — 성장 + 흑자"],
  ["ADBE", "Adobe", "QUALITY_COMPOUNDER", "소프트웨어"],
  ["NOW", "ServiceNow", "QUALITY_COMPOUNDER", "엔터프라이즈 SaaS"],
  ["CRM", "Salesforce", "QUALITY_COMPOUNDER", "SaaS"],
  ["SHOP", "Shopify", "QUALITY_COMPOUNDER", "커머스 플랫폼"],
  ["V", "Visa", "QUALITY_COMPOUNDER", "결제 네트워크"],
  ["MA", "Mastercard", "QUALITY_COMPOUNDER", "결제 네트워크"],
  ["GOOGL", "Alphabet", "QUALITY_COMPOUNDER", "광고·클라우드"],
  ["COST", "Costco", "QUALITY_COMPOUNDER", "회원제 소매 — 안정 성장"],
  ["ORCL", "Oracle", "QUALITY_COMPOUNDER", "소프트웨어 — 전환기 경계 케이스"],
  ["CRWV", "CoreWeave", "HYPERGROWTH_UNPROFITABLE", "AI 인프라 — 매출 급증 + 적자"],
  ["RIVN", "Rivian", "HYPERGROWTH_UNPROFITABLE", "전기차 — 매출 성장 + 대규모 적자"],
  ["LCID", "Lucid", "HYPERGROWTH_UNPROFITABLE", "전기차 — 적자"],
  ["MRNA", "Moderna", "TURNAROUND_LOSS", "코로나 매출 급감 후 적자 — 성장 없음"],
  ["PFE", "Pfizer", "PHARMA_STABLE", "대형 제약 — 판매 매출 기반"],
  ["JNJ", "Johnson & Johnson", "PHARMA_STABLE", "제약·헬스케어"],
  ["ABT", "Abbott", "PHARMA_STABLE", "의료기기·진단"],
  ["VZ", "Verizon", "MATURE_INCOME", "통신 — 저성장·고배당"],
  ["T", "AT&T", "MATURE_INCOME", "통신"],
  ["SO", "Southern Company", "MATURE_INCOME", "전기 유틸리티"],
];

function entryOf(id: string): UniverseEntry {
  const kr = /^\d{6}$/.test(id);
  return {
    canonical: id,
    displayName: id,
    country: kr ? "KR" : "US",
    ...(kr ? { naverCode: id } : { symbol: id }),
    lastPublishedAt: "2026-07-28",
  };
}

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

interface Row {
  id: string;
  name: string;
  market: "KR" | "US";
  expected: ArchetypeCode;
  basis: string;
  actual: ArchetypeCode;
  matched_rule: string;
  reason: string | null;
  stdev_confirmed: boolean;
  industry: string | null;
  coverage_flag: string;
}

export interface GoldenSummary {
  n: number;
  agreed: number;
  agreementPct: number;
  /** 다른 특정 유형으로 분류된 건수 — 잘못된 프레임이 씌워진 경우. */
  riskyMisclassified: number;
  riskyPct: number;
  /** UNCLASSIFIED 로 빠진 건수 — 오분류가 아니다. */
  unclassified: number;
  unclassifiedPct: number;
}

export function summarize(rows: readonly Row[]): GoldenSummary {
  const n = rows.length;
  const agreed = rows.filter((r) => r.actual === r.expected).length;
  const unclassified = rows.filter((r) => r.actual === "UNCLASSIFIED" && r.expected !== "UNCLASSIFIED").length;
  const risky = rows.filter((r) => r.actual !== r.expected && r.actual !== "UNCLASSIFIED").length;
  const pct = (x: number) => (n === 0 ? 0 : Number(((x / n) * 100).toFixed(1)));
  return {
    n,
    agreed,
    agreementPct: pct(agreed),
    riskyMisclassified: risky,
    riskyPct: pct(risky),
    unclassified,
    unclassifiedPct: pct(unclassified),
  };
}

function confusionMatrix(rows: readonly Row[]): { codes: ArchetypeCode[]; matrix: Record<string, Record<string, number>> } {
  const codes = [...new Set([...rows.map((r) => r.expected), ...rows.map((r) => r.actual)])].sort() as ArchetypeCode[];
  const matrix: Record<string, Record<string, number>> = {};
  for (const expected of codes) {
    matrix[expected] = {};
    for (const actual of codes) matrix[expected]![actual] = 0;
  }
  for (const row of rows) matrix[row.expected]![row.actual] = (matrix[row.expected]![row.actual] ?? 0) + 1;
  return { codes, matrix };
}

function renderReport(rows: readonly Row[]): string {
  const all = summarize(rows);
  const kr = summarize(rows.filter((r) => r.market === "KR"));
  const us = summarize(rows.filter((r) => r.market === "US"));
  const { codes, matrix } = confusionMatrix(rows);
  const lines: string[] = [];

  lines.push("# 아키타입 골든셋 검증 (WO-SUB-02 §8)");
  lines.push("");
  lines.push(`- 룰셋: \`${RULESET_VERSION}\``);
  lines.push(`- 라벨링 순서: 팩트시트를 보지 않고 **사업 내용 기준으로 먼저** 라벨 → 그 다음 실측 대조(§8-1)`);
  lines.push(`- 생성 스크립트: \`scripts/archetype-goldenset.ts\` · 원본 \`docs/archetype/goldenset_raw.json\``);
  lines.push("");
  lines.push("## 1. 측정 결과");
  lines.push("");
  lines.push("| 구분 | n | 일치 | 일치율 | 위험 오분류 | 위험률 | UNCLASSIFIED |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const [label, s] of [["전체", all], ["KR", kr], ["US", us]] as const) {
    lines.push(
      `| ${label} | ${s.n} | ${s.agreed} | ${s.agreementPct}% | ${s.riskyMisclassified} | ${s.riskyPct}% | ${s.unclassified} (${s.unclassifiedPct}%) |`
    );
  }
  lines.push("");
  lines.push(`- 목표: 일치율 ≥ 85% → **${all.agreementPct >= 85 ? "달성" : "미달"}**`);
  lines.push(`- 목표: 위험 오분류율 ≤ 5% → **${all.riskyPct <= 5 ? "달성" : "미달"}**`);
  lines.push("");
  lines.push("> **`UNCLASSIFIED` 는 오분류가 아니다.** 프레임을 씌우지 않았으므로 오도하지 않는다(WO §8-2).");
  lines.push("> 일치율과 별도로 집계한다.");
  lines.push("");
  lines.push("## 2. 혼동 행렬 (행 = 정답, 열 = 분류기)");
  lines.push("");
  lines.push(`| 정답 \\ 분류 | ${codes.map((c) => c.replace(/_/g, " ")).join(" | ")} |`);
  lines.push(`|---|${codes.map(() => "---").join("|")}|`);
  for (const expected of codes) {
    const cells = codes.map((actual) => {
      const value = matrix[expected]![actual] ?? 0;
      return value === 0 ? "·" : expected === actual ? `**${value}**` : String(value);
    });
    lines.push(`| ${expected.replace(/_/g, " ")} | ${cells.join(" | ")} |`);
  }
  lines.push("");
  lines.push("## 3. 불일치 상세");
  lines.push("");
  const mismatches = rows.filter((r) => r.actual !== r.expected);
  if (mismatches.length === 0) lines.push("없음.");
  else {
    lines.push("| 종목 | 시장 | 기대 | 분류 | 성격 | 업종 | 규칙/사유 |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const row of mismatches) {
      const kind = row.actual === "UNCLASSIFIED" ? "안전(프레임 없음)" : "**위험(잘못된 프레임)**";
      lines.push(
        `| ${row.name} | ${row.market} | ${row.expected} | ${row.actual} | ${kind} | ${row.industry ?? "—"} | ${row.reason ?? row.matched_rule} |`
      );
    }
  }
  lines.push("");
  lines.push("## 4. 통계로 확인되지 않은 시클리컬 판정");
  lines.push("");
  const unconfirmed = rows.filter((r) => r.actual === "CYCLICAL_COMMODITY" && !r.stdev_confirmed);
  lines.push(`${unconfirmed.length}건 — 업종 코드 단독 판정(독트린 §4-3). \`stdev_confirmed: false\` 로 남아 WO-SUB-07 이 분리 집계한다.`);
  if (unconfirmed.length > 0) {
    lines.push("");
    for (const row of unconfirmed) lines.push(`- ${row.name}(${row.market}, ${row.industry ?? "—"})`);
  }
  lines.push("");
  lines.push("## 5. 전체 라벨과 근거");
  lines.push("");
  lines.push("| 종목 | 시장 | 라벨 근거 | 기대 | 분류 | coverage |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rows) {
    const mark = row.actual === row.expected ? "" : " ⚠︎";
    lines.push(`| ${row.name} | ${row.market} | ${row.basis} | ${row.expected} | ${row.actual}${mark} | ${row.coverage_flag} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outDir = flag(args, "--out");
  const labeled = [...KR, ...US];
  const rows: Row[] = [];

  for (const [index, [id, name, expected, basis]] of labeled.entries()) {
    const factsheet = await buildFactSheet(entryOf(id));
    const result = classifyArchetype(factsheet);
    // 히스테리시스는 이력이 없으면 즉시 확정한다 — 골든셋은 첫 관측이므로 raw 와 같아야 한다.
    const decision = applyHysteresis(result, null);
    rows.push({
      id,
      name,
      market: /^\d{6}$/.test(id) ? "KR" : "US",
      expected,
      basis,
      actual: decision.code,
      matched_rule: result.matched_rule,
      reason: result.reason,
      stdev_confirmed: result.stdev_confirmed,
      industry: factsheet.classification.industry,
      coverage_flag: factsheet.fiscal.coverage_flag,
    });
    const row = rows[rows.length - 1]!;
    const mark = row.actual === row.expected ? "  " : "⚠︎";
    console.log(
      `  ${mark} [${index + 1}/${labeled.length}] ${name.padEnd(20)} 기대 ${expected.padEnd(24)} → ${row.actual.padEnd(24)} ${row.industry ?? "-"}`
    );
  }

  const summary = summarize(rows);
  console.log("\n=== 결과 ===");
  console.log(` 일치율 ${summary.agreementPct}% (${summary.agreed}/${summary.n}) — 목표 85%`);
  console.log(` 위험 오분류율 ${summary.riskyPct}% (${summary.riskyMisclassified}건) — 목표 5%`);
  console.log(` UNCLASSIFIED ${summary.unclassifiedPct}% (${summary.unclassified}건, 오분류 아님)`);

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "GOLDENSET_report.md"), renderReport(rows));
    writeFileSync(join(outDir, "goldenset_raw.json"), JSON.stringify({ rulesetVersion: RULESET_VERSION, summary, rows }, null, 2));
    console.log(`\n[goldenset] 저장 — ${join(outDir, "GOLDENSET_report.md")}`);
  }
}

if (process.argv[1] && process.argv[1].includes("archetype-goldenset")) {
  main().catch((error) => {
    console.error("[goldenset] 실패", error);
    process.exit(1);
  });
}

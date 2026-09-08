/**
 * LAUNCH-P2 §D — **확보율 대시보드.** 상세가 채워지는 비율을 매일 같은 자리에 적는다.
 *
 * ## 왜 라우트가 아니라 스크립트인가
 *
 * 계측은 **이미 페이로드에 있다**(`qualification`). 새 저장소도, 새 엔드포인트도 필요 없다 —
 * 매일 같은 숫자를 뽑아 한 화면에 모으면 그게 대시보드다. 워크플로가 이 스크립트를 돌려
 * 실행 요약에 남기고, 마지막 지표가 문턱 아래면 실패로 알린다(§D-1).
 *
 * ```
 * npx tsx scripts/coverage-dashboard.ts            # 프로덕션
 * COVERAGE_API=… npx tsx scripts/coverage-dashboard.ts
 * ```
 *
 * ## 마지막 항목이 가장 중요하다
 *
 * 지시서가 그렇게 못 박았다 — 「눈에 띄는 것」 2개 이상 비율이 **상세가 채워지는 비율**이다.
 * 나머지는 그 비율을 올리는 재료다.
 */
const API = process.env["COVERAGE_API"] ?? "https://fomo-club-backend.vercel.app";
/** §D-1 — 이 아래면 알린다. */
export const THESIS_ALERT_FLOOR_PCT = 50;
/** §E 출시 전 목표. */
export const TARGETS = { earnings: 60, amount: 40, usAbout: 70, thesis: 60 } as const;

interface Census {
  disclosureFigures?: { total: number; figures: number; scale: number };
  earningsFigureReasons?: Record<string, number>;
  disclosureAmounts?: { forms: number; withLine: number };
  disclosurePhrases?: { total: number; raw: number };
  thesis?: { stocks: number; byCount: number[] };
  companySections?: Record<string, { shown: number; missing: number }>;
  companyPeers?: { min?: number; median?: number };
}

function pct(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : null;
}

function line(label: string, value: number | null, target?: number): string {
  const shown = value === null ? "표본 0" : `${value}%`;
  const verdict = value === null || target === undefined ? "" : value >= target ? "  ✅" : `  ❌ (목표 ${target}%)`;
  return `| ${label} | ${shown} |${verdict ? ` ${verdict.trim()} |` : " — |"}`;
}

async function main(): Promise<void> {
  const res = await fetch(`${API}/api/fomo/quiet-picks`, { cache: "no-store", signal: AbortSignal.timeout(40_000) });
  const payload = (await res.json()) as { asOf?: string; qualification?: Census };
  const q = payload.qualification ?? {};

  const reasons = q.earningsFigureReasons ?? {};
  const success = (reasons["body"] ?? 0) + (reasons["join"] ?? 0);
  /**
   * 실적 확보율의 분모는 **실적 서식**이다. 전체 공시를 분모로 쓰면 지분 5% 보고처럼
   * 금액·실적이 없는 서식이 분모를 채워, 목표가 원리적으로 도달 불가가 된다.
   */
  const earningsForms = Object.entries(reasons)
    .filter(([key]) => key !== "not-earnings-form")
    .reduce((sum, [, count]) => sum + count, 0);
  const amounts = q.disclosureAmounts ?? { forms: 0, withLine: 0 };
  const thesis = q.thesis ?? { stocks: 0, byCount: [] };
  const twoPlus = (thesis.byCount[2] ?? 0) + (thesis.byCount[3] ?? 0);
  const thesisPct = pct(twoPlus, thesis.stocks);

  console.log(`## 확보율 — ${payload.asOf ?? "(asOf 없음)"}\n`);
  console.log("| 항목 | 확보율 | 판정 |");
  console.log("|---|---|---|");
  console.log(line("실적 숫자 (실적 서식 기준)", pct(success, earningsForms), TARGETS.earnings));
  console.log(line("공시 금액 (금액 서식 기준)", pct(amounts.withLine, amounts.forms), TARGETS.amount));
  console.log(line("공시 뜻풀이", pct((q.disclosurePhrases?.total ?? 0) - (q.disclosurePhrases?.raw ?? 0), q.disclosurePhrases?.total ?? 0)));
  console.log(line("「눈에 띄는 것」 2개 이상", thesisPct, TARGETS.thesis));
  console.log("");
  console.log(`- 실적 실패 사유: ${JSON.stringify(reasons)}`);
  console.log(`- 금액 서식 ${amounts.forms}건 중 ${amounts.withLine}건에 금액+비율 줄`);
  console.log(`- 회사 설명·섹션: ${JSON.stringify(q.companySections ?? {})}`);
  console.log(`- 업종 비교 표본: min ${q.companyPeers?.min ?? "-"} · median ${q.companyPeers?.median ?? "-"}`);
  console.log(`- 미국 회사 설명은 백필 라우트가 답한다: GET /api/fomo/cron/us-about-backfill?limit=1`);

  if (thesisPct !== null && thesisPct < THESIS_ALERT_FLOOR_PCT) {
    // §D-1 — 상세가 절반도 안 채워지면 그게 가장 큰 문제다.
    console.error(`::error::「눈에 띄는 것」 2개 이상이 ${thesisPct}% — ${THESIS_ALERT_FLOOR_PCT}% 아래다. 상세가 비어 나간다.`);
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

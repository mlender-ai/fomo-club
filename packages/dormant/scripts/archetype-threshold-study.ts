/**
 * WO-SUB-02 §6-4 — θ_cyclical 결정 절차. **임계값을 감으로 정하지 않는다.**
 *
 * ## 왜 지시서의 FP 계산을 그대로 쓰지 않는가 (광혁 지적, 2026-07-28)
 *
 * 분류 규칙은 `industry ∈ CYCLICAL_INDUSTRY_SET` **AND** `stdev > θ` 다.
 * AND 구조에서 소프트웨어·통신·소매는 **업종 게이트에서 이미 걸러져 stdev 게이트에 도달하지 않는다.**
 * 그런데 1차 측정은 FP 를 라벨셋 40종목 전체에 대해 셌다 — 도달하지 않는 종목을 분모에 넣은 것이다.
 * 그래서 "FP=0 을 만족하는 임계값 9.775" 라는 값이 나왔고, 그 값은 **잘못된 모수로 잰 숫자**다
 * (실제로는 시클리컬 14개 중 9개를 놓친다).
 *
 * 지시서 §6-4 의 "FP 최소화" 는 stdev 가 단독으로 판별한다는 가정에서 쓴 문장이다. 실제 규칙은 다르다.
 * 그래서 라벨을 **세 그룹**으로 나눠 잰다.
 *
 *  · `cyclical`                — 사이클 업종 + 제품가격이 마진을 좌우 (게이트 통과 대상, 통과해야 함)
 *  · `cyclical_industry_stable` — **사이클 업종에 속하지만 마진이 계약으로 고정된 예외**
 *                                 (산업용 가스·특수화학). 게이트가 실제로 배제해야 하는 대상 = 진짜 FP 모수
 *  · `non_cyclical`            — 사이클 업종이 아예 아님. 업종 게이트에서 걸러지므로 θ 와 무관(참고용)
 *
 * θ 는 `cyclical` 을 전부 통과시키면서 `cyclical_industry_stable` 을 배제하는 구간에서 고른다.
 *
 * ## 왜 분기 통계를 쓰지 않는가
 *
 * 1차 실측: `operating_stdev_8q` 는 **계절성이 경기순환성을 덮어쓴다.** INTU(소프트웨어)가 18.7%p 로
 * 철강 CLF(3.75%p)보다 5배 컸다 — TurboTax 매출이 특정 분기에 몰려 분기 마진이 요동친 것이고
 * 사업이 순환적인 것과 무관하다. 연간 관측은 계절성이 상쇄되어 분리도가 훨씬 높다.
 * 또한 `operating_stdev_8q` 는 KR 에서 항상 null 이다(네이버 분기 5개 상한, WO-SUB-01 실측 0/40).
 *
 * 실행: npx tsx scripts/archetype-threshold-study.ts --out docs/archetype
 * 외부 egress 필요(SEC·Nasdaq).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFactSheet } from "../apps/web/lib/fundamentals/build";
import type { UniverseEntry } from "../apps/web/lib/fundamentals/universe";

/**
 * 라벨셋 — 업종 자체가 시클리컬인지로 정한다(주가 흐름이 아니라 사업 구조).
 * 팩트시트를 보기 **전에** 정했다(WO §8-1 라벨링 순서).
 */
const CYCLICAL: ReadonlyArray<[string, string]> = [
  ["MU", "메모리 반도체"],
  ["WDC", "HDD·낸드"],
  ["STX", "HDD"],
  ["NUE", "철강"],
  ["X", "철강"],
  ["CLF", "철강·철광석"],
  ["STLD", "철강"],
  ["DOW", "화학"],
  ["LYB", "화학"],
  ["CE", "화학"],
  ["VLO", "정유"],
  ["MPC", "정유"],
  ["PSX", "정유"],
  ["CF", "비료"],
  ["MOS", "비료"],
  ["FCX", "구리"],
  ["AA", "알루미늄"],
  ["ZIM", "컨테이너 해운"],
  ["MATX", "해운"],
  ["CAT", "건설기계"],
];

/**
 * **사이클 업종에 속하지만 마진이 계약으로 고정된 예외** — stdev 게이트가 실제로 배제해야 하는 대상.
 * 산업용 가스는 장기 take-or-pay 계약, 특수화학·도료는 브랜드·조제 기반이라 원자재 가격을 전가한다.
 * 이 그룹이 θ 의 진짜 FP 모수다(업종 게이트를 통과하기 때문).
 */
const CYCLICAL_INDUSTRY_STABLE: ReadonlyArray<[string, string]> = [
  ["LIN", "산업용 가스 — 장기 계약"],
  ["APD", "산업용 가스 — 장기 계약"],
  ["SHW", "도료 — 브랜드·전가력"],
  ["ECL", "특수화학 — 서비스 결합"],
  ["PPG", "도료"],
  ["TXN", "아날로그 반도체 — 자체 팹·장수 제품"],
];

const NON_CYCLICAL: ReadonlyArray<[string, string]> = [
  ["MSFT", "소프트웨어"],
  ["ADBE", "소프트웨어"],
  ["CRM", "소프트웨어"],
  ["NOW", "소프트웨어"],
  ["ORCL", "소프트웨어"],
  ["INTU", "소프트웨어"],
  ["V", "결제"],
  ["MA", "결제"],
  ["KO", "음료"],
  ["PEP", "음료·스낵"],
  ["PG", "생활용품"],
  ["CL", "생활용품"],
  ["JNJ", "제약·헬스케어"],
  ["ABT", "의료기기"],
  ["MCD", "외식"],
  ["COST", "소매"],
  ["WMT", "소매"],
  ["UNH", "건강보험"],
  ["VZ", "통신"],
  ["T", "통신"],
];

type Label = "cyclical" | "cyclical_industry_stable" | "non_cyclical";

/**
 * nasdaq_industry 기준 사이클 업종 집합 — 라벨셋 실측에서 나온 문자열 그대로 쓴다.
 * (추측한 업종명으로 집합을 만들면 매칭이 조용히 실패한다.)
 */
const CYCLICAL_INDUSTRY_NASDAQ: readonly string[] = [
  "Semiconductors",
  "Electronic Components",
  "Steel/Iron Ore",
  "Metal Mining",
  "Major Chemicals",
  "Integrated oil Companies",
  "Oil Refining/Marketing",
  "Agricultural Chemicals",
  "Aluminum",
  "Precious Metals",
  "Marine Transportation",
  "Construction/Ag Equipment/Trucks",
  "Industrial Machinery/Components",
  "Paints/Coatings",
  "Containers/Packaging",
  "Coal Mining",
  "Oil & Gas Production",
];

interface Row {
  symbol: string;
  note: string;
  label: Label;
  /** 업종 게이트 통과 여부 — θ 평가 모수를 이걸로 한정한다. */
  industryGate: boolean;
  stdev8q: number | null;
  stdevAnnual: number | null;
  annualYears: number;
  quarters: number;
  marginTtm: number | null;
  industry: string | null;
  errors: number;
}

function entryOf(symbol: string): UniverseEntry {
  return {
    canonical: symbol,
    displayName: symbol,
    country: "US",
    symbol,
    lastPublishedAt: "2026-07-28",
  };
}

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

/**
 * 후보 임계값 평가. `>= t` 를 시클리컬로 볼 때의 오분류를 센다.
 * FP = 비시클리컬을 시클리컬로(위험 — 잘못된 프레임을 씌운다), FN = 시클리컬을 놓침(안전 — UNCLASSIFIED 쪽).
 */
export function evaluateThreshold(
  values: ReadonlyArray<{ label: Label; value: number }>,
  threshold: number
): { tp: number; fp: number; fn: number; tn: number } {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const row of values) {
    const predicted = row.value >= threshold;
    if (row.label === "cyclical") predicted ? (tp += 1) : (fn += 1);
    else predicted ? (fp += 1) : (tn += 1);
  }
  return { tp, fp, fn, tn };
}

/**
 * FP=0 을 만족하는 가장 낮은 임계값을 고른다(재현율 최대화). FP=0 이 불가능하면 FP 최소 → 그중 FN 최소.
 * 후보는 관측값 사이의 중간점 — 관측값 자체를 쓰면 경계에 정확히 걸린 종목의 판정이 임의로 갈린다.
 */
export function chooseThreshold(
  values: ReadonlyArray<{ label: Label; value: number }>
): { threshold: number | null; fp: number; fn: number; candidates: Array<{ threshold: number; fp: number; fn: number }> } {
  const sorted = [...values].map((v) => v.value).sort((a, b) => a - b);
  const candidates: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const mid = (sorted[i - 1]! + sorted[i]!) / 2;
    if (Number.isFinite(mid) && !candidates.includes(mid)) candidates.push(mid);
  }
  const scored = candidates.map((threshold) => {
    const { fp, fn } = evaluateThreshold(values, threshold);
    return { threshold: Number(threshold.toFixed(3)), fp, fn };
  });
  if (scored.length === 0) return { threshold: null, fp: 0, fn: 0, candidates: [] };
  const minFp = Math.min(...scored.map((s) => s.fp));
  const best = scored.filter((s) => s.fp === minFp).sort((a, b) => a.fn - b.fn || a.threshold - b.threshold)[0]!;
  return { threshold: best.threshold, fp: best.fp, fn: best.fn, candidates: scored };
}

function describe(values: readonly number[]): string {
  if (values.length === 0) return "관측 없음";
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]!.toFixed(2);
  return `n=${sorted.length} min=${q(0)} p25=${q(0.25)} p50=${q(0.5)} p75=${q(0.75)} max=${q(1)}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outDir = flag(args, "--out");
  const labeled: Array<[string, string, Label]> = [
    ...CYCLICAL.map(([s, n]) => [s, n, "cyclical"] as [string, string, Label]),
    ...CYCLICAL_INDUSTRY_STABLE.map(([s, n]) => [s, n, "cyclical_industry_stable"] as [string, string, Label]),
    ...NON_CYCLICAL.map(([s, n]) => [s, n, "non_cyclical"] as [string, string, Label]),
  ];

  const rows: Row[] = [];
  for (const [index, [symbol, note, label]] of labeled.entries()) {
    const factsheet = await buildFactSheet(entryOf(symbol));
    const industry = factsheet.classification.industry;
    rows.push({
      symbol,
      note,
      label,
      industryGate: !!industry && CYCLICAL_INDUSTRY_NASDAQ.includes(industry),
      stdev8q: factsheet.margin.operating_stdev_8q,
      stdevAnnual: factsheet.margin.operating_stdev_annual,
      annualYears: factsheet.margin.operating_stdev_annual_years,
      quarters: factsheet.fiscal.quarters.length,
      marginTtm: factsheet.margin.operating_ttm,
      industry,
      errors: factsheet.source_errors.length,
    });
    const row = rows[rows.length - 1]!;
    console.log(
      `  [${index + 1}/${labeled.length}] ${symbol.padEnd(6)} ${label.padEnd(24)} gate=${row.industryGate ? "Y" : "n"} annual=${String(row.stdevAnnual).padStart(7)}(${row.annualYears}y) 8q=${String(row.stdev8q).padStart(7)} ${industry ?? "-"}`
    );
  }

  /** θ 평가 모수 = **업종 게이트를 통과한 종목만.** 게이트에 도달하지 않는 종목은 FP 를 만들 수 없다. */
  const gated = rows.filter((r) => r.industryGate && typeof r.stdevAnnual === "number");
  const gatedValues = gated.map((r) => ({ label: r.label, value: r.stdevAnnual as number, symbol: r.symbol }));
  const chosen = chooseThreshold(gatedValues);

  const valuesOf = (label: Label, key: "stdev8q" | "stdevAnnual", gateOnly = false) =>
    rows
      .filter((r) => r.label === label && typeof r[key] === "number" && (!gateOnly || r.industryGate))
      .map((r) => r[key] as number);

  /** 확인시킬 것 ② — 선택한 θ 에서 게이트 통과 종목 중 실제로 배제되는 것이 무엇인가. */
  const excludedAt = (threshold: number) =>
    gated.filter((r) => (r.stdevAnnual as number) < threshold).map((r) => `${r.symbol}(${r.label}, ${r.stdevAnnual})`);

  const study = {
    studiedAt: new Date().toISOString(),
    statistic: "margin.operating_stdev_annual",
    statisticNote:
      "분기 통계(operating_stdev_8q)는 계절성이 경기순환성을 덮어써 쓰지 않는다 — 실측: INTU 18.7%p > 철강 CLF 3.75%p. KR 은 분기 통계가 구조적으로 null 이기도 하다.",
    cyclicalIndustrySet: CYCLICAL_INDUSTRY_NASDAQ,
    labeled: rows,
    /** 지시서 방식(전 라벨셋 대상) — 잘못된 모수임을 보이기 위해 함께 남긴다. */
    naiveAllLabels: chooseThreshold(
      rows.filter((r) => typeof r.stdevAnnual === "number").map((r) => ({ label: r.label, value: r.stdevAnnual as number }))
    ),
    /** 올바른 모수(업종 게이트 통과 종목만). */
    gateRestricted: {
      n: gated.length,
      byLabel: {
        cyclical: describe(valuesOf("cyclical", "stdevAnnual", true)),
        cyclical_industry_stable: describe(valuesOf("cyclical_industry_stable", "stdevAnnual", true)),
        non_cyclical: describe(valuesOf("non_cyclical", "stdevAnnual", true)),
      },
      chosen,
      excludedAtChosen: chosen.threshold === null ? [] : excludedAt(chosen.threshold),
      excludedAt3: excludedAt(3.0),
    },
    /** 참고 — 업종 게이트에서 이미 걸러지는 그룹의 분포(θ 와 무관). */
    reference: {
      nonCyclicalAnnual: describe(valuesOf("non_cyclical", "stdevAnnual")),
      nonCyclical8q: describe(valuesOf("non_cyclical", "stdev8q")),
      cyclical8q: describe(valuesOf("cyclical", "stdev8q")),
      gateFailedCyclicalLabels: rows.filter((r) => r.label === "cyclical" && !r.industryGate).map((r) => `${r.symbol}(${r.industry ?? "업종없음"})`),
      gatePassedNonCyclicalLabels: rows.filter((r) => r.label === "non_cyclical" && r.industryGate).map((r) => `${r.symbol}(${r.industry})`),
    },
  };

  console.log("\n=== 업종 게이트 통과 종목만 (올바른 모수) ===");
  console.log(" n =", gated.length);
  console.log(" cyclical            ", study.gateRestricted.byLabel.cyclical);
  console.log(" cyclical_ind_stable ", study.gateRestricted.byLabel.cyclical_industry_stable);
  console.log(" non_cyclical        ", study.gateRestricted.byLabel.non_cyclical);
  console.log(` 선택 임계값 ${chosen.threshold} (FP ${chosen.fp} / FN ${chosen.fn})`);
  console.log(" 해당 θ 에서 배제되는 종목:", study.gateRestricted.excludedAtChosen.join(", ") || "(없음)");
  console.log(" θ=3.0 에서 배제되는 종목:", study.gateRestricted.excludedAt3.join(", ") || "(없음)");
  console.log("\n=== 참고 ===");
  console.log(" 지시서 방식(전 라벨셋) 임계값:", study.naiveAllLabels.threshold, `(FP ${study.naiveAllLabels.fp} / FN ${study.naiveAllLabels.fn})`);
  console.log(" 업종 게이트를 통과한 비시클리컬 라벨:", study.reference.gatePassedNonCyclicalLabels.join(", ") || "(없음)");
  console.log(" 업종 게이트에서 탈락한 시클리컬 라벨:", study.reference.gateFailedCyclicalLabels.join(", ") || "(없음)");

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "threshold_study_raw.json"), JSON.stringify(study, null, 2));
    console.log(`\n[study] 저장 — ${join(outDir, "threshold_study_raw.json")}`);
  }
}

if (process.argv[1] && process.argv[1].includes("archetype-threshold-study")) {
  main().catch((error) => {
    console.error("[study] 실패", error);
    process.exit(1);
  });
}

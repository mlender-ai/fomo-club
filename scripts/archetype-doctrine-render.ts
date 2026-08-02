/**
 * WO-SUB-02 §7 — `DOCTRINE_archetype_frames.md` 를 독트린 정본(JSON)에서 **생성**한다.
 *
 * 왜 생성하는가: 경고문·금지 지표가 문서와 코드 두 곳에 있으면 반드시 어긋난다.
 * 정본은 `packages/fomo-core/src/archetype/doctrine.json` 하나이고, 마크다운은 그것의 렌더다.
 * `archetype-doctrine.test.ts` 가 커밋된 마크다운이 최신 렌더와 일치하는지 검사한다.
 *
 * 실행: npx tsx scripts/archetype-doctrine-render.ts [--check]
 *   --check 를 주면 쓰지 않고 차이만 알린다(CI·테스트용).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOCTRINE } from "../packages/fomo-core/src/archetype/classify";
import { KNOWN_CYCLICAL_GATE_MISSES, RULESET_VERSION, THRESHOLDS, BIO_REVENUE_FLOOR } from "../packages/fomo-core/src/archetype/ruleset";
import { STDEV_MIN_YEARS } from "../packages/fomo-core/src/archetype/classify";
import type { ArchetypeFrame } from "../packages/fomo-core/src/archetype/types";

export const DOCTRINE_PATH = join("docs", "archetype", "DOCTRINE_archetype_frames.md");

interface ThresholdStudy {
  studiedAt?: string;
  gateRestricted?: {
    n?: number;
    byLabel?: Record<string, string>;
    chosen?: { threshold: number | null; fp: number; fn: number };
    excludedAt3?: string[];
  };
  naiveAllLabels?: { threshold: number | null; fp: number; fn: number };
  reference?: { gatePassedNonCyclicalLabels?: string[]; gateFailedCyclicalLabels?: string[]; nonCyclical8q?: string; cyclical8q?: string };
  labeled?: Array<{ symbol: string; label: string; industryGate: boolean; stdevAnnual: number | null; stdev8q: number | null }>;
}

function loadStudy(): ThresholdStudy | null {
  try {
    return JSON.parse(readFileSync(join("docs", "archetype", "threshold_study_raw.json"), "utf8")) as ThresholdStudy;
  } catch {
    return null;
  }
}

function metricTable(frame: ArchetypeFrame): string[] {
  const lines: string[] = [];
  if (frame.display_metrics.length === 0) {
    lines.push("표시 지표 없음 — 사실 나열만 한다.");
    return lines;
  }
  lines.push("| # | 지표 | 팩트시트 경로 | 왜 이 지표인가 |");
  lines.push("|---|---|---|---|");
  frame.display_metrics.forEach((metric, index) => {
    lines.push(`| ${index + 1} | ${metric.label} | \`${metric.path}\` | ${metric.why} |`);
  });
  return lines;
}

function renderFrame(frame: ArchetypeFrame, index: number): string[] {
  const lines: string[] = [];
  lines.push(`### 3-${index + 1}. \`${frame.code}\` — ${frame.label_ko}`);
  lines.push("");
  lines.push(`**정의.** ${frame.definition}`);
  lines.push("");
  lines.push(`**경계.** ${frame.boundary}`);
  lines.push("");
  lines.push("#### 표시 지표 (우선순위 순)");
  lines.push("");
  lines.push(...metricTable(frame));
  lines.push("");
  lines.push("#### 금지 지표");
  lines.push("");
  if (frame.forbidden_metrics.length === 0) lines.push("없음.");
  else {
    lines.push("| 경로 | 금지 사유 |");
    lines.push("|---|---|");
    for (const entry of frame.forbidden_metrics) lines.push(`| \`${entry.path}\` | ${entry.reason} |`);
  }
  lines.push("");
  if (frame.requires_warning_metrics.length > 0) {
    lines.push("#### 경고문 부착이 필수인 지표 (INV-11)");
    lines.push("");
    lines.push("| 경로 | 이유 |");
    lines.push("|---|---|");
    for (const entry of frame.requires_warning_metrics) lines.push(`| \`${entry.path}\` | ${entry.reason} |`);
    lines.push("");
  }
  lines.push("#### 밴드 지표");
  lines.push("");
  lines.push(`- 사용: ${frame.band_metric ? `\`${frame.band_metric}\`` : "**없음 — 값의 상태 층을 렌더링하지 않는다**"}`);
  if (frame.band_note) lines.push(`- 근거: ${frame.band_note}`);
  lines.push("");
  lines.push("#### 값의 상태 차트 축 (WO-SUB-04)");
  lines.push("");
  if (!frame.chart_axes) {
    lines.push("**차트 미표시.**");
  } else {
    const axes = frame.chart_axes;
    lines.push("| 축 | 지표 |");
    lines.push("|---|---|");
    lines.push(`| 막대(우축) | ${axes.bar_label} — \`${axes.bar_series}\` |`);
    lines.push(
      `| 선(좌축) | ${axes.line_metric ? `${axes.line_label} — \`${axes.line_metric}\`` : "**없음**"} |`
    );
    if (axes.line_fallback_metric) lines.push(`| 대체 | \`${axes.line_fallback_metric}\` |`);
    if (axes.note) {
      lines.push("");
      lines.push(`- ${axes.note}`);
    }
  }
  lines.push("");
  lines.push("#### 해석 경고문 (최종 문안)");
  lines.push("");
  if (!frame.warning_full && !frame.warning_short) lines.push("경고문 없음.");
  else {
    lines.push(`- **디테일용**: ${frame.warning_full ?? "—"}`);
    lines.push(`- **카드용(축약)**: ${frame.warning_short ?? "—"}`);
  }
  lines.push("");
  lines.push("#### 리스크 템플릿 (WO-SUB-06 입력)");
  lines.push("");
  if (frame.risks.length === 0) lines.push("없음.");
  else for (const risk of frame.risks) lines.push(`- ${risk}`);
  lines.push("");
  if (frame.unavailable_metrics.length > 0) {
    lines.push("#### 확보하지 못한 지표 (WO 카탈로그 요구 대비)");
    lines.push("");
    lines.push("| 지표 | 미확보 사유 |");
    lines.push("|---|---|");
    for (const entry of frame.unavailable_metrics) lines.push(`| ${entry.label} | ${entry.reason} |`);
    lines.push("");
    lines.push("> WO-SUB-04·05 는 이 지표를 렌더 계획에 넣지 말 것. 소스가 확보되면 독트린을 먼저 고친다.");
    lines.push("");
  }
  lines.push("#### 대표 종목 예시");
  lines.push("");
  for (const example of frame.examples) lines.push(`- **${example.name}** — ${example.note}`);
  lines.push("");
  return lines;
}

export function renderDoctrine(): string {
  const study = loadStudy();
  const lines: string[] = [];

  lines.push("# 아키타입 해석 독트린 (WO-SUB-02)");
  lines.push("");
  lines.push("> **생성 문서다.** 정본은 `packages/fomo-core/src/archetype/doctrine.json` 이고 이 파일은 그것의 렌더다.");
  lines.push("> 고칠 때는 JSON 을 고치고 `npx tsx scripts/archetype-doctrine-render.ts` 를 다시 돌린다.");
  lines.push("> 이 문서를 직접 편집하면 테스트(`archetype-doctrine.test.ts`)가 실패한다.");
  lines.push("");
  lines.push("| 항목 | 값 |");
  lines.push("|---|---|");
  lines.push(`| 룰셋 버전 | \`${RULESET_VERSION}\` |`);
  lines.push(`| 독트린 버전 | \`${DOCTRINE.version}\` |`);
  lines.push(`| 기준일 | ${DOCTRINE.as_of} |`);
  lines.push(`| 유형 수 | ${DOCTRINE.archetypes.length} |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push("## 1. 왜 유형 분류가 필요한가");
  lines.push("");
  lines.push("같은 숫자가 유형에 따라 정확히 반대로 읽힌다. **PER 역설**이 그 증거다.");
  lines.push("");
  lines.push("메모리 반도체의 PER 6배는 \"값이 낮다\"가 아니라 \"이익이 정점에 가깝다\"는 신호일 수 있다.");
  lines.push("사이클 업종은 제품 가격이 꼭지일 때 이익이 최대가 되고, 그 순간 PER 분모가 가장 커져 PER 이 최저로 찍힌다.");
  lines.push("반면 안정적으로 이익을 내는 소프트웨어 기업의 PER 6배는 다른 뜻이다.");
  lines.push("");
  lines.push("프레임이 없으면 우리는 **모든 종목에 같은 자**를 대게 된다 — 은행·제약·시클리컬 반도체·적자 고성장 인프라에");
  lines.push("같은 자를 대는 것은 틀린 게 아니라 **무의미**하다. 유형이 먼저 정해져야 어떤 숫자를 보여줄지,");
  lines.push("그 숫자를 어떻게 읽어야 하는지, 어떤 숫자는 절대 보여주면 안 되는지가 정해진다.");
  lines.push("");
  lines.push("그래서 이 문서가 `WO-SUB-04`(값 시각화)·`WO-SUB-05`(소견)·`WO-SUB-06`(리스크)의 **유일한 입력**이다.");
  lines.push("");

  lines.push("## 2. 아키타입 전체 목록");
  lines.push("");
  lines.push("| 코드 | 표시명 | 밴드 지표 | 금지 지표 수 | 경고문 |");
  lines.push("|---|---|---|---|---|");
  for (const frame of DOCTRINE.archetypes) {
    lines.push(
      `| \`${frame.code}\` | ${frame.label_ko} | ${frame.band_metric ?? "없음"} | ${frame.forbidden_metrics.length} | ${frame.warning_short ? "있음" : "없음"} |`
    );
  }
  lines.push("");

  lines.push("## 3. 유형별 상세");
  lines.push("");
  DOCTRINE.archetypes.forEach((frame, index) => lines.push(...renderFrame(frame, index)));

  lines.push("## 4. 분류 규칙 전문");
  lines.push("");
  lines.push("**규칙 기반. LLM 사용 금지 — 예외 없음.** 순수 함수이며 같은 팩트시트면 항상 같은 분류가 나온다.");
  lines.push("판정은 **첫 매치에서 종료**한다. 순서 자체가 정책이다.");
  lines.push("");
  lines.push("```");
  lines.push("0. 데이터 부족 선차단");
  lines.push("   coverage_flag == none              -> UNCLASSIFIED(no_fiscal)");
  lines.push("   sector == null || industry == null -> UNCLASSIFIED(no_sector)");
  lines.push("   스킴 미지원                        -> UNCLASSIFIED(unknown_scheme)");
  lines.push("1. 섹터 우선");
  lines.push("   industry ∈ bank                    -> BANK_FINANCIAL        # 적자여도 은행이다");
  lines.push("   industry ∈ biotech && rev < floor  -> BIOTECH_PIPELINE");
  lines.push("2. 시클리컬  ← 적자 판정보다 앞선다(§5-4). 단 적자+고성장은 예외");
  lines.push(`   industry ∈ cyclical && 연간관측 >= ${STDEV_MIN_YEARS}개년 && stdev_annual > ${THRESHOLDS.cyclical_operating_stdev_annual_pp}%p -> CYCLICAL_COMMODITY`);
  lines.push(`   industry ∈ cyclical && 연간관측 < ${STDEV_MIN_YEARS}개년       -> CYCLICAL_COMMODITY (업종 단독, stdev_confirmed=false, §4-3)`);
  lines.push("3. 손익 상태");
  lines.push(`   ni_ttm < 0 && yoy > ${THRESHOLDS.hypergrowth_revenue_yoy_pct}%           -> HYPERGROWTH_UNPROFITABLE`);
  lines.push("   ni_ttm < 0                         -> TURNAROUND_LOSS");
  lines.push("4. 제약");
  lines.push("   industry ∈ pharma && rev >= floor  -> PHARMA_STABLE");
  lines.push("5. 성숙·배당");
  lines.push(`   div_yield > ${THRESHOLDS.mature_dividend_yield_pct}% && cagr3y < ${THRESHOLDS.low_growth_cagr_pct}%    -> MATURE_INCOME`);
  lines.push("6. 성장·흑자");
  lines.push(`   cagr3y > ${THRESHOLDS.growth_cagr_pct}% && ni_ttm > 0        -> QUALITY_COMPOUNDER`);
  lines.push("7. 자산형");
  lines.push(`   pbr < 1 && net_cash/mcap > ${THRESHOLDS.asset_net_cash_ratio}     -> ASSET_DEEP_VALUE`);
  lines.push("8. 기본값");
  lines.push("   -> UNCLASSIFIED(no_rule_matched)");
  lines.push("```");
  lines.push("");
  lines.push("### 4-1. 통화별 절대금액 임계값");
  lines.push("");
  lines.push("| 임계값 | USD | KRW |");
  lines.push("|---|---|---|");
  lines.push(`| 바이오 매출 하한 | ${BIO_REVENUE_FLOOR.USD.toLocaleString("en-US")} | ${BIO_REVENUE_FLOOR.KRW.toLocaleString("ko-KR")} |`);
  lines.push("");
  lines.push("### 4-2. 업종 집합은 스킴별로 분리한다");
  lines.push("");
  lines.push("`nasdaq_industry`(Nasdaq summary 의 `Industry`)와 `naver_industry`(네이버 79개 업종 그룹명)는 서로 다른 체계다.");
  lines.push("하나의 문자열 리스트로 뭉개면 매칭이 조용히 실패한다. 집합 문자열은 전부 **실측 응답에서 그대로** 가져왔다.");
  lines.push("스킴을 모르면 어떤 집합에도 매치시키지 않고 `UNCLASSIFIED(unknown_scheme)` 로 보낸다.");
  lines.push("");
  lines.push("### 4-3. 【예외】 시클리컬에서는 원칙 3을 반대로 적용한다");
  lines.push("");
  lines.push("WO §4 원칙 3은 \"오분류는 `UNCLASSIFIED` 쪽으로 편향시킨다\"다. **시클리컬 판정에는 이 원칙을 반대로 적용한다.**");
  lines.push("");
  lines.push("근거는 오분류 비용의 비대칭이다. `CYCLICAL_COMMODITY` 로 분류됐을 때 실제로 바뀌는 것은 두 가지뿐이다 —");
  lines.push("PER 경고문 부착, 밴드 지표가 PER→PBR.");
  lines.push("");
  lines.push("| | 결과 | 성격 |");
  lines.push("|---|---|---|");
  lines.push("| 과잉 포함 | 시클리컬이 아닌데 PER 경고문을 봄 | 불필요한 주의. **오독을 유발하지 않는다** |");
  lines.push("| 과소 포함 | 정유·철강에 경고 없이 PER 제시 | **독트린이 막으려던 바로 그 오독이 발생한다** |");
  lines.push("");
  lines.push("원칙 3은 *잘못된 프레임이 오도할 때* 적용하는 원칙이다. 시클리컬 경고는 오도하지 않는 방향의 프레임이므로");
  lines.push("이 유형에는 반대가 맞다. 그래서 **연간 통계가 없으면 업종 코드 단독으로 시클리컬 판정한다**(KR 이 여기 해당).");
  lines.push("");
  lines.push(`판정 기준은 **연간 관측 연수**다 — θ 를 도출한 라벨셋이 5개년이므로, 관측이 ${STDEV_MIN_YEARS}개년 미만이면`);
  lines.push("통계를 쓰지 않고 업종 코드 단독으로 판정한다. 3개년 표본표준편차로 5개년 기준 임계값을 재는 것은 다른 자를 대는 것이다.");
  lines.push("실측: 이 게이트 없이는 POSCO홀딩스·현대차·현대제철·팬오션 등 KR 시클리컬 20종목 중 14종목이 탈락했다.");
  lines.push("");
  lines.push("단 두 가지 조건을 붙인다.");
  lines.push("");
  lines.push("1. 통계로 확인되지 않은 판정은 `stdev_confirmed: false` 로 남긴다 → `WO-SUB-07` 이 KR/US 오분류율을 분리 집계한다.");
  lines.push("2. **DART 확보 후 재검토 대상으로 등재한다.** \"KR 분기 통계 0%\"는 현재 소스(네이버 5분기 상한)의 한계일 뿐이고,");
  lines.push("   국내 상장사는 분기 보고를 한다. DART 가 열리면 KR 도 `stdev_confirmed: true` 로 올라갈 수 있다.");
  lines.push("");

  lines.push("## 5. 임계값 결정 근거");
  lines.push("");
  lines.push("### 5-1. 왜 분기 통계를 쓰지 않는가");
  lines.push("");
  lines.push("지시서 §6-4 는 `operating_stdev_8q`(분기)를 시클리컬 판정 입력으로 지정했다. **실측 결과 쓸 수 없다.**");
  lines.push("");
  lines.push("**분기 통계는 계절성이 경기순환성을 덮어쓴다.** 라벨 40종목 실측에서 INTU(소프트웨어)가 18.7%p 로");
  lines.push("철강 CLF(3.75%p)의 5배였다 — TurboTax 매출이 특정 분기에 몰려 분기 마진이 요동친 것이고 사업이 순환적인 것과 무관하다.");
  if (study?.reference?.cyclical8q) {
    lines.push("");
    lines.push(`- 시클리컬 분기 통계 분포: ${study.reference.cyclical8q}`);
    lines.push(`- 비시클리컬 분기 통계 분포: ${study.reference.nonCyclical8q}`);
  }
  lines.push("");
  lines.push("추가로 `operating_stdev_8q` 는 **KR 에서 항상 `null`** 이다(네이버 분기 5개 상한, WO-SUB-01 실측 0/40).");
  lines.push("그래서 연간 관측 기반 통계(`margin.operating_stdev_annual`)로 교체했다. 연간은 계절성이 상쇄된다.");
  lines.push("");
  lines.push("### 5-2. FP 를 어느 모수로 재는가 (지시서 §6-4 정정)");
  lines.push("");
  lines.push("분류 규칙은 `industry ∈ cyclical` **AND** `stdev > θ` 다. AND 구조에서 소프트웨어·통신·소매는");
  lines.push("**업종 게이트에서 이미 걸러져 stdev 게이트에 도달하지 않는다.** 그런데 1차 측정은 FP 를 라벨 40종목 전체로 셌다 —");
  lines.push("도달하지 않는 종목을 분모에 넣은 것이다.");
  lines.push("");
  if (study?.naiveAllLabels) {
    lines.push(`- 잘못된 모수(전 라벨셋): θ = ${study.naiveAllLabels.threshold} → FP ${study.naiveAllLabels.fp} / FN ${study.naiveAllLabels.fn}`);
  }
  lines.push(`- 업종 게이트를 통과한 비시클리컬 라벨: **${study?.reference?.gatePassedNonCyclicalLabels?.length ?? 0}개** — 즉 비시클리컬은 θ 로 FP 를 만들 수 없다`);
  lines.push("");
  lines.push("그래서 라벨을 세 그룹으로 나눠 다시 쟀다. 진짜 FP 모수는 **사이클 업종에 속하지만 마진이 계약으로 고정된 예외**다.");
  lines.push("");
  if (study?.gateRestricted?.byLabel) {
    lines.push(`업종 게이트 통과 종목만 (n=${study.gateRestricted.n ?? "?"}), 연간 영업이익률 표본표준편차(%p):`);
    lines.push("");
    lines.push("| 라벨 | 분포 |");
    lines.push("|---|---|");
    for (const [label, description] of Object.entries(study.gateRestricted.byLabel)) {
      lines.push(`| \`${label}\` | ${description} |`);
    }
    lines.push("");
  }
  lines.push("### 5-3. θ_cyclical = " + THRESHOLDS.cyclical_operating_stdev_annual_pp + " (%p) 선택 근거와 한계");
  lines.push("");
  lines.push("- 라벨 시클리컬의 **최저 관측값이 3.19** 이므로 3.0 은 전원을 통과시킨다(재현율 100%).");
  if (study?.gateRestricted?.excludedAt3) {
    lines.push(`- θ=3.0 에서 실제로 배제되는 종목: **${study.gateRestricted.excludedAt3.join(", ") || "없음"}**`);
  }
  lines.push("");
  lines.push("**한계를 명시한다.** 이 게이트는 의도한 예외를 다 걸러내지 못한다.");
  lines.push(`사이클 업종이면서 마진이 계약으로 고정된 종목 중 ${KNOWN_CYCLICAL_GATE_MISSES.join("·")} 는 θ=3.0 을 통과해`);
  lines.push("`CYCLICAL_COMMODITY` 로 분류된다. 원인은 **일회성 손상차손이 연간 통계를 부풀리는 것**이다");
  lines.push("(예: 산업용 가스 기업의 대규모 프로젝트 상각). 통계로는 사이클과 일회성 비용을 구분할 수 없다.");
  lines.push("");
  lines.push("이 한계를 감수하는 근거는 §4-3 의 비대칭 비용이다 — 이들에게 PER 경고문이 붙는 것은 오독을 만들지 않는다.");
  lines.push("게이트의 특이도는 **업종 집합이 담당**하고(비시클리컬 라벨 20종목 중 게이트 통과 0개), stdev 게이트는 보조다.");
  lines.push("");
  if (study?.studiedAt) {
    lines.push(`> 실측: \`scripts/archetype-threshold-study.ts\` · ${study.studiedAt} · 원본 \`docs/archetype/threshold_study_raw.json\``);
    lines.push("");
  }

  lines.push("### 5-4. 【정정】 시클리컬 판정이 적자 판정보다 앞선다");
  lines.push("");
  lines.push("지시서 §6-1 의 판정 순서는 손익 상태(적자)를 시클리컬보다 먼저 본다.");
  lines.push("**골든셋 100종목 실측에서 그 순서가 최대 오분류원이었다** — 다운사이클 구간의 화학·철강·정유는");
  lines.push("적자이므로 `TURNAROUND_LOSS` 로 분류됐다(LG화학·롯데케미칼·Cleveland-Cliffs·Alcoa 등 9건).");
  lines.push("");
  lines.push("사이클 업종의 적자는 \"전환에 실패할 수도 있는 구조적 적자\"가 아니라 **사이클의 저점**이다.");
  lines.push("유형을 나누는 사실 자체가 다르고, 두 유형이 제시하는 핵심 변수도 다르다 —");
  lines.push("`TURNAROUND_LOSS` 는 \"흑자 전환 여부\", `CYCLICAL_COMMODITY` 는 \"지금 사이클의 어디인가\".");
  lines.push("");
  lines.push("즉 이 오분류는 **잘못된 프레임을 씌우는 방향**이므로 WO §4 원칙 3 위반이다. 그래서 순서를 바꿨다.");
  lines.push("");
  lines.push("**단 성장 단계의 적자는 사이클 저점이 아니다.** 매출이 급증하면서 적자인 기업은 업종이 사이클 업종이어도");
  lines.push("제품 가격 사이클로 설명되지 않는다 — 실측: Rivian·Lucid 가 \"Auto Manufacturing\" 이라는 이유로");
  lines.push("`CYCLICAL_COMMODITY` 로 갔다. 그래서 시클리컬 판정 앞에 \"적자 + 고성장\" 예외를 둔다(더 구체적인 규칙이 이긴다).");
  lines.push("");
  lines.push("## 6. 히스테리시스 규칙");
  lines.push("");
  lines.push("임계값 근처에서 분기마다 분류가 튀면 사용자 경험과 판단 원장이 함께 망가진다.");
  lines.push("");
  lines.push("- 새 분류가 기존 분류와 다를 때, **2회 연속** 갱신에서 충족해야 확정한다.");
  lines.push("- 확정 전까지 기존 분류를 유지하고 `pending_change` 를 기록한다.");
  lines.push("- **즉시 반영하는 두 경우**: `UNCLASSIFIED` → 특정 유형(데이터가 생김), 특정 유형 → `UNCLASSIFIED`(데이터가 사라짐).");
  lines.push("  진동이 아니라 데이터 상태 변화이므로 지연시키면 거짓을 유지하게 된다.");
  lines.push("- **룰셋 버전이 바뀌면 이력을 무효화**하고 새 분류를 즉시 확정한다. 다른 규칙으로 만든 이력과 연속성을 따지는 것은 의미가 없다.");
  lines.push("");

  lines.push("## 7. 버전 이력");
  lines.push("");
  lines.push("| 버전 | 날짜 | 변경 | 영향 범위 |");
  lines.push("|---|---|---|---|");
  lines.push(
    `| \`archetype-v1.0.0\` | ${DOCTRINE.as_of} | 최초 확정. 유형 10종, 시클리컬 판정 입력을 분기→연간 통계로 교체, θ=${THRESHOLDS.cyclical_operating_stdev_annual_pp} | 전 페이즈(04·05·06)의 유일한 입력 |`
  );
  lines.push("");
  lines.push("> 임계값이 바뀌면 과거 분류의 의미가 달라진다. 판단 원장에 `ruleset_version` 을 함께 기록하고,");
  lines.push("> 버전을 올릴 때 이 표에 영향 범위를 적는다.");
  lines.push("");

  return lines.join("\n");
}

function main(): void {
  const rendered = renderDoctrine();
  if (process.argv.includes("--check")) {
    const current = readFileSync(DOCTRINE_PATH, "utf8");
    if (current === rendered) {
      console.log("[doctrine] 최신 상태");
      return;
    }
    console.error("[doctrine] 커밋된 마크다운이 정본과 어긋난다 — npx tsx scripts/archetype-doctrine-render.ts 실행할 것");
    process.exit(1);
  }
  mkdirSync(join("docs", "archetype"), { recursive: true });
  writeFileSync(DOCTRINE_PATH, rendered);
  console.log(`[doctrine] 생성 — ${DOCTRINE_PATH} (${rendered.length}자)`);
}

if (process.argv[1] && process.argv[1].includes("archetype-doctrine-render")) main();

import {
  DART_MAPPING_VERSION,
  dartUnavailableReason,
  findDartRow,
  parseDartAmount,
  type DartRow,
  type PointObservation,
  type QuarterRecord,
} from "@fomo/core";
import { fetchCorpCodeMap } from "./dart-discovery";

/**
 * DART 펀더멘털 어댑터 (WO-SUB-03.5 PART E-1).
 *
 * 실측 근거는 `docs/fundamentals/DUMP_dart_structure.md` 다. 아래 세 가지는 **덤프 없이는
 * 알 수 없고, 틀리면 조용히 가짜 숫자가 되는** 것들이라 여기 못박아 둔다.
 *
 * ## 1. 기간 표기와 금액이 다르다 (가장 큰 함정)
 *
 * 반기보고서 손익의 `thstrm_dt` 는 `"2025.01.01 ~ 2025.06.30"` 으로 **누적처럼 표기**하는데
 * `thstrm_amount` 는 **그 분기 3개월치**다. 종근당 실측:
 *
 * ```
 * 1분기 매출  400,955,846,488   ← Q1
 * 반기  매출  434,849,104,888   ← Q2 만. 2×Q1 이 아니다
 * 3분기 매출  429,818,748,658   ← Q3
 * 사업  매출 1,692,403,987,134  ← 연간 12개월
 * Q1+Q2+Q3 = 1,265,623억 · FY − 합 = 426,780억 → Q4 로 정합
 * ```
 *
 * 표기를 믿고 누적으로 처리하면 TTM 이 전부 틀린다. 그래서 보고서 → 분기 대응은
 * `11013→Q1 · 11012→Q2 · 11014→Q3` 이고, **Q4 는 연간에서 세 분기를 뺀다**(SEC 와 같은 패턴).
 *
 * ## 2. 연결과 개별이 한 응답에 함께 온다
 *
 * 주요계정 응답에 같은 `매출액` 행이 두 번 나온다(`fs_div: "CFS"` / `"OFS"`). 필터하지 않으면
 * 어느 것을 집는지가 응답 순서에 달린다. 연결 우선, 없으면 개별 — **섞지 않는다.**
 *
 * ## 3. 두 엔드포인트의 역할이 다르다
 *
 * | 엔드포인트 | 주는 것 | 제약 |
 * |---|---|---|
 * | `fnlttSinglAcnt`(주요계정) | 매출·영업이익·순이익·자산/부채/자본 | `account_id` **없음** → 계정명 매칭 |
 * | `fnlttSinglAcntAll`(전체) | + 현금흐름·EPS·매출원가, `account_id` 있음 | 당해 사업보고서가 `013`(미제공)일 수 있음 |
 *
 * 주요계정을 뼈대로, 전체 재무제표로 살을 붙인다. 전체가 013 이면 상세 전용 지표만 `null` 이 되고
 * 분기 자체는 남는다 — **이전 분기 값으로 메우지 않는다**(INV-12).
 *
 * ## look-ahead
 *
 * `filed_at` 은 `rcept_no` 앞 8자리(접수일)로 **추정이 아니라 실측**이다 →
 * `filed_at_source: "disclosed"`. 네이버의 법정기한 추정과 구분해 남긴다.
 */

const DART_BASE = "https://opendart.fss.or.kr/api";
const TIMEOUT_MS = 25_000;

/**
 * 정기보고서 → 분기 대응.
 *
 * `quarter` 는 그 보고서의 금액이 **어느 3개월치인지**다(실측 확인). 반기보고서가 Q2 인 것이
 * 직관과 어긋나 보이지만 금액이 그렇다.
 */
const REPORTS = [
  { code: "11013", label: "1분기보고서", quarter: 1 },
  { code: "11012", label: "반기보고서", quarter: 2 },
  { code: "11014", label: "3분기보고서", quarter: 3 },
  { code: "11011", label: "사업보고서", quarter: null },
] as const;

type ReportSpec = (typeof REPORTS)[number];

function dartKey(): string | undefined {
  return process.env.DART_API_KEY || process.env.DART_CRTFC_KEY;
}

export function isDartConfigured(): boolean {
  return Boolean(dartKey());
}

interface DartResponse {
  status?: string;
  message?: string;
  list?: DartRow[];
}

async function callDart(path: string, params: Record<string, string>): Promise<DartResponse | null> {
  const key = dartKey();
  if (!key) return null;
  const query = new URLSearchParams({ crtfc_key: key, ...params });
  const res = await fetch(`${DART_BASE}/${path}?${query}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as DartResponse | null;
}

/** 접수번호 앞 8자리 = 접수일. `"20251114001538"` → `"2025-11-14"`. */
export function rceptDate(rceptNo: string | null | undefined): string | null {
  if (!rceptNo || rceptNo.length < 8) return null;
  const iso = `${rceptNo.slice(0, 4)}-${rceptNo.slice(4, 6)}-${rceptNo.slice(6, 8)}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** 분기 번호 → 기간말. KR 정기보고서는 분기말이 달력 분기와 일치한다. */
export function quarterEnd(year: number, quarter: number): string {
  return [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`][quarter - 1]!;
}

/** `"2025.09.30 현재"` · `"2025.01.01 ~ 2025.09.30"` → `"2025-09-30"`(마지막 날짜). */
export function parseDartPeriodEnd(raw: string | undefined): string | null {
  const dates = raw?.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/g);
  if (!dates?.length) return null;
  const parts = dates[dates.length - 1]!.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
  return parts ? `${parts[1]}-${parts[2]}-${parts[3]}` : null;
}

interface ReportData {
  spec: ReportSpec;
  bsnsYear: number;
  filedAt: string;
  /** 주요계정 + 전체 재무제표 행 합본. */
  rows: DartRow[];
  /** 이 응답에서 쓸 재무제표 범위. 연결이 있으면 연결. */
  fsDiv: string;
  /** 전체 재무제표가 열렸는가. 닫히면 현금흐름·EPS 는 이 보고서에서 null. */
  detailed: boolean;
  errors: string[];
}

/** 연결이 있으면 연결, 없으면 개별. 섞지 않는다. */
function preferredFsDiv(rows: readonly DartRow[]): string {
  return rows.some((row) => row.fs_div === "CFS") ? "CFS" : "OFS";
}

async function fetchReport(corpCode: string, bsnsYear: number, spec: ReportSpec): Promise<ReportData | null> {
  const main = await callDart("fnlttSinglAcnt.json", { corp_code: corpCode, bsns_year: String(bsnsYear), reprt_code: spec.code });
  // 013 = 그 보고서가 없다. 실패가 아니라 부재이므로 조용히 건너뛴다.
  if (main?.status !== "000" || !Array.isArray(main.list) || main.list.length === 0) return null;

  const filedAt = rceptDate((main.list[0] as { rcept_no?: string }).rcept_no);
  // look-ahead 방지: 공시일 없는 보고서는 레코드를 만들지 않는다.
  if (!filedAt) return null;

  const rows: DartRow[] = [...main.list];
  const fsDiv = preferredFsDiv(rows);
  const errors: string[] = [];

  const all = await callDart("fnlttSinglAcntAll.json", {
    corp_code: corpCode,
    bsns_year: String(bsnsYear),
    reprt_code: spec.code,
    fs_div: fsDiv,
  });
  const detailed = all?.status === "000" && Array.isArray(all.list) && all.list.length > 0;
  if (detailed) rows.push(...all!.list!);
  else errors.push(`dart: 전체 재무제표 미제공(${bsnsYear} ${spec.label}) — 현금흐름·EPS 는 이 보고서에서 null`);

  return { spec, bsnsYear, filedAt, rows, fsDiv, detailed, errors };
}

/** 당기 금액 1개. 못 찾으면 `null` — 0 으로 읽으면 결측이 값이 된다. */
function amountOf(report: ReportData, field: string): { value: number | null; key: string | null } {
  const hit = findDartRow(report.rows, field, report.fsDiv);
  if (!hit) return { value: null, key: null };
  return { value: parseDartAmount(hit.row.thstrm_amount), key: hit.key };
}

/** 전기·전전기 금액 — 사업보고서에서 연간 시계열을 늘리는 데 쓴다. */
function priorAmounts(report: ReportData, field: string): { frmtrm: number | null; bfefrmtrm: number | null } {
  const hit = findDartRow(report.rows, field, report.fsDiv);
  if (!hit) return { frmtrm: null, bfefrmtrm: null };
  return { frmtrm: parseDartAmount(hit.row.frmtrm_amount), bfefrmtrm: parseDartAmount(hit.row.bfefrmtrm_amount) };
}

interface Composed {
  record: QuarterRecord;
  points: Record<string, number | null>;
}

function recordFrom(report: ReportData, periodEnd: string, period: string): Composed | null {
  const revenue = amountOf(report, "revenue");
  const operating = amountOf(report, "operating_income");
  const net = amountOf(report, "net_income");
  const eps = report.detailed ? amountOf(report, "eps_basic") : { value: null, key: null };
  if (revenue.value === null && operating.value === null && net.value === null) return null;

  return {
    record: {
      period,
      period_end: periodEnd,
      filed_at: report.filedAt,
      // 접수일 실측이다. 추정이 아니다.
      filed_at_source: "disclosed",
      revenue: revenue.value,
      operating_income: operating.value,
      net_income: net.value,
      // **희석 EPS 가 아니다.** DART 는 기본(및희석) 주당이익을 준다 — 다른 지표라 옮겨 적지 않는다.
      eps_diluted: null,
      source: `dart:${report.bsnsYear}:${report.spec.label}:${report.fsDiv}`,
      concepts: {
        ...(revenue.key ? { revenue: revenue.key } : {}),
        ...(operating.key ? { operating_income: operating.key } : {}),
        ...(net.key ? { net_income: net.key } : {}),
        ...(eps.key ? { eps_diluted: `${eps.key}(기본EPS — 희석 아님)` } : {}),
      },
    },
    points: {
      equity: amountOf(report, "equity").value,
      liabilities: amountOf(report, "liabilities").value,
      cash: amountOf(report, "cash").value,
      operating_cash_flow: report.detailed ? amountOf(report, "operating_cash_flow").value : null,
      short_term_borrowings: amountOf(report, "short_term_borrowings").value,
      long_term_borrowings: amountOf(report, "long_term_borrowings").value,
      interest_paid: report.detailed ? amountOf(report, "interest_paid").value : null,
    },
  };
}

/**
 * Q4 = 연간 − (Q1+Q2+Q3).
 *
 * **세 분기 중 하나라도 없으면 구성하지 않는다** — 부분 합으로 빼면 Q4 가 과대계상된다.
 * EPS 는 뺄 수 없다(주식수가 분기마다 달라 차감이 성립하지 않는다) → 항상 `null`.
 */
export function composeQ4(annual: QuarterRecord, quarters: readonly QuarterRecord[]): QuarterRecord | null {
  const year = annual.period_end.slice(0, 4);
  const three = [1, 2, 3].map((quarter) => quarters.find((record) => record.period === `${year}Q${quarter}`));
  if (three.some((record) => !record)) return null;

  const subtract = (pick: (record: QuarterRecord) => number | null): number | null => {
    const total = pick(annual);
    if (total === null) return null;
    let sum = 0;
    for (const record of three) {
      const value = pick(record!);
      if (value === null) return null;
      sum += value;
    }
    return total - sum;
  };

  const revenue = subtract((record) => record.revenue);
  const operating = subtract((record) => record.operating_income);
  const net = subtract((record) => record.net_income);
  if (revenue === null && operating === null && net === null) return null;

  return {
    period: `${year}Q4`,
    period_end: `${year}-12-31`,
    filed_at: annual.filed_at,
    filed_at_source: annual.filed_at_source ?? "disclosed",
    revenue,
    operating_income: operating,
    net_income: net,
    // 희석주식수가 분기마다 달라 차감이 성립하지 않는다.
    eps_diluted: null,
    source: `${annual.source}:Q4구성(연간−1~3분기)`,
    concepts: annual.concepts ?? {},
  };
}

export interface DartFundamentals {
  corpCode: string | null;
  quarters: QuarterRecord[];
  annual: QuarterRecord[];
  equity: PointObservation[];
  liabilities: PointObservation[];
  totalDebt: PointObservation[];
  cash: PointObservation[];
  operatingCashFlow: PointObservation[];
  interestExpense: PointObservation[];
  /** DART 표본에 감가상각비 단독 계정이 없다 — 항상 비어 있다(EV/EBITDA null 유지). */
  depreciation: PointObservation[];
  mappingVersion: string;
  /** 전체 재무제표가 열린 보고서 수 / 시도 수 — 현금흐름 확보율의 근거. */
  detailedReports: { opened: number; attempted: number };
  /** Q4 를 구성한 연도 수. 구성 실패는 세 분기 결손이라는 뜻이다. */
  composedQ4: number;
  errors: string[];
  fetchedAt: string;
}

function emptyResult(errors: string[]): DartFundamentals {
  return {
    corpCode: null,
    quarters: [],
    annual: [],
    equity: [],
    liabilities: [],
    totalDebt: [],
    cash: [],
    operatingCashFlow: [],
    interestExpense: [],
    depreciation: [],
    mappingVersion: DART_MAPPING_VERSION,
    detailedReports: { opened: 0, attempted: 0 },
    composedQ4: 0,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 종목코드로 DART 펀더멘털 일체.
 *
 * `years` 는 조회할 사업연도 수다. 한 해가 분기 3개 + Q4 구성 1개 = 4분기를 주므로
 * 8분기에는 2년, 밴드 여유까지 보면 3년이면 충분하다. 기본 3년(보고서 12개 × 2콜).
 */
export async function fetchDartFundamentals(
  naverCode: string,
  options: { years?: number; now?: Date } = {}
): Promise<DartFundamentals> {
  const key = dartKey();
  if (!key) return emptyResult(["dart: DART_API_KEY 미설정"]);

  const map = await fetchCorpCodeMap(key);
  if (map.error) return emptyResult([`dart: corp_code 매핑 실패 — ${map.error}`]);
  const corpCode = map.byStockCode.get(naverCode.trim());
  if (!corpCode) return emptyResult([`dart: corp_code 없음(${naverCode}) — 비상장이거나 매핑에 없다`]);

  const now = options.now ?? new Date();
  const years = options.years ?? 3;
  const errors: string[] = [];
  const quarters: QuarterRecord[] = [];
  const annual: QuarterRecord[] = [];
  const series: Record<string, PointObservation[]> = {
    equity: [],
    liabilities: [],
    cash: [],
    operating_cash_flow: [],
    interest_paid: [],
    total_debt: [],
  };
  let opened = 0;
  let attempted = 0;
  let composedQ4 = 0;

  for (let offset = 0; offset < years; offset += 1) {
    const bsnsYear = now.getUTCFullYear() - offset;
    const annualForYear: QuarterRecord[] = [];

    for (const spec of REPORTS) {
      const report = await fetchReport(corpCode, bsnsYear, spec);
      if (!report) continue;
      attempted += 1;
      if (report.detailed) opened += 1;
      errors.push(...report.errors);

      // 기간말은 재무상태표 행에서 읽는다(손익 행은 누적 기간 표기라 분기말이 아니다).
      const bsRow = report.rows.find(
        (row) => row.sj_div === "BS" && row.fs_div === report.fsDiv && typeof (row as { thstrm_dt?: string }).thstrm_dt === "string"
      ) as { thstrm_dt?: string } | undefined;
      const periodEnd = parseDartPeriodEnd(bsRow?.thstrm_dt) ?? (spec.quarter ? quarterEnd(bsnsYear, spec.quarter) : `${bsnsYear}-12-31`);
      const period = spec.quarter ? `${periodEnd.slice(0, 4)}Q${spec.quarter}` : periodEnd.slice(0, 4);

      const composed = recordFrom(report, periodEnd, period);
      if (!composed) continue;
      if (spec.quarter) quarters.push(composed.record);
      else annualForYear.push(composed.record);

      const at = { period_end: composed.record.period_end, filed_at: composed.record.filed_at };
      for (const field of ["equity", "liabilities", "cash", "operating_cash_flow", "interest_paid"]) {
        const value = composed.points[field] ?? null;
        if (value !== null) series[field]!.push({ ...at, value });
      }
      const shortDebt = composed.points.short_term_borrowings ?? null;
      const longDebt = composed.points.long_term_borrowings ?? null;
      // 둘 다 없으면 0 이 아니라 결측이다 — 무차입으로 보이게 만들면 안 된다.
      if (shortDebt !== null || longDebt !== null) series.total_debt!.push({ ...at, value: (shortDebt ?? 0) + (longDebt ?? 0) });

      // 사업보고서의 전기·전전기로 연간 시계열을 늘린다 — 한 응답이 3개 연도를 준다.
      if (!spec.quarter) {
        const revenuePrior = priorAmounts(report, "revenue");
        const operatingPrior = priorAmounts(report, "operating_income");
        const netPrior = priorAmounts(report, "net_income");
        for (const [back, label] of [
          [1, "전기"],
          [2, "전전기"],
        ] as const) {
          const pickKey = back === 1 ? "frmtrm" : "bfefrmtrm";
          const revenue = revenuePrior[pickKey];
          const operatingIncome = operatingPrior[pickKey];
          const netIncome = netPrior[pickKey];
          if (revenue === null && operatingIncome === null && netIncome === null) continue;
          const priorYear = Number(periodEnd.slice(0, 4)) - back;
          annualForYear.push({
            period: String(priorYear),
            period_end: `${priorYear}-12-31`,
            // 이 값은 당해 보고서에 실려 공시됐다 — 공시일은 그 보고서의 접수일이다.
            filed_at: report.filedAt,
            filed_at_source: "disclosed",
            revenue,
            operating_income: operatingIncome,
            net_income: netIncome,
            eps_diluted: null,
            source: `dart:${report.bsnsYear}:사업보고서:${report.fsDiv}:${label}`,
            concepts: {},
          });
        }
      }
    }

    // Q4 는 연간에서 세 분기를 뺀다. 세 분기가 다 있어야 한다.
    for (const yearly of annualForYear) {
      annual.push(yearly);
      if (yearly.period_end.slice(0, 4) !== String(bsnsYear)) continue;
      const q4 = composeQ4(yearly, quarters);
      if (q4) {
        quarters.push(q4);
        composedQ4 += 1;
      } else {
        errors.push(`dart: ${bsnsYear}Q4 미구성 — 1~3분기 중 결손이 있어 차감하면 과대계상된다`);
      }
    }
  }

  if (quarters.length === 0) errors.push(`dart: 분기 레코드 0개(${naverCode})`);
  const depreciationReason = dartUnavailableReason("depreciation");
  if (depreciationReason) errors.push(`dart: 감가상각비 미확보 — ${depreciationReason}`);

  return {
    corpCode,
    quarters,
    annual,
    equity: series.equity!,
    liabilities: series.liabilities!,
    totalDebt: series.total_debt!,
    cash: series.cash!,
    operatingCashFlow: series.operating_cash_flow!,
    interestExpense: series.interest_paid!,
    depreciation: [],
    mappingVersion: DART_MAPPING_VERSION,
    detailedReports: { opened, attempted },
    composedQ4,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}

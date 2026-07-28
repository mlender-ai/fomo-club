import type { PointObservation, QuarterRecord, SharesPoint } from "@fomo/core";

/**
 * SEC XBRL companyfacts 어댑터 (WO-SUB-01 §7-1, US 재무).
 *
 * **원시 응답 → 정규화 레코드만 한다.** 파생 계산은 `@fomo/core` 의 compose 층에서만 한다.
 *
 * 실측으로 확인한 함정(WO-SUB-00 인계 §4):
 *  · SEC 는 연락처가 담긴 UA 를 요구한다(없으면 403).
 *  · `company_tickers.json` 이 간헐 403 → 백오프 재시도. 실패는 "없음"이 아니라 **미확인**이다.
 *  · 주식수는 `us-gaap` 이 아니라 **`dei` 네임스페이스**에 있다. 전 네임스페이스를 훑는다.
 *  · **Q4 는 분기형 사실로 태깅되지 않는다**(10-K 가 연간을 보고). 실측: CLBK 분기형 37개에
 *    12-31 종료 구간이 하나도 없다. 그래서 Q4 = 연간 − 1~3분기 합으로 **구성**한다.
 *    이것은 추정이 아니라 공시된 값들 사이의 항등식이며, `source` 에 그 사실을 남긴다.
 *  · `filed_at` 은 그 기간을 **처음 공시한 날**을 쓴다(최신 정정일이 아니라). 과거 밴드가
 *    "그때 알 수 있었던 정보"만 쓰도록 하는 것이 §6-2 의 목적이다.
 */

const SEC_UA = process.env.SEC_USER_AGENT?.trim() || "FOMO Club research contact@fomoclub.app";
const TIMEOUT_MS = 20_000;
/** SEC 예의 지연(10 req/s 상한보다 보수적). */
const DELAY_MS = 120;
const CIK_RETRIES = 3;
/** 분기 구간으로 인정할 최대 길이(일). 누적치(YTD)를 배제한다. */
const MAX_QUARTER_DAYS = 115;
const MIN_QUARTER_DAYS = 60;
/** 연간 구간으로 인정할 범위(일). */
const MIN_ANNUAL_DAYS = 330;
const MAX_ANNUAL_DAYS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface XbrlEntry {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  fp?: string;
  fy?: number;
  filed?: string;
  accn?: string;
}

interface CompanyFacts {
  facts?: Record<string, Record<string, { units?: Record<string, XbrlEntry[]> }>>;
}

export interface SecFundamentals {
  quarters: QuarterRecord[];
  annual: QuarterRecord[];
  equity: PointObservation[];
  liabilities: PointObservation[];
  totalDebt: PointObservation[];
  cash: PointObservation[];
  operatingCashFlow: PointObservation[];
  interestExpense: PointObservation[];
  depreciation: PointObservation[];
  sharesSeries: SharesPoint[];
  /** 최신 보고 주식수 — 시가총액·밴드 기준주식수 폴백. */
  sharesOutstanding: number | null;
  sharesOutstandingAsOf: string | null;
  errors: string[];
  fetchedAt: string;
}

/** 개념 후보 — 앞에서부터 찾고, 처음 발견한 것을 쓴다. 은행처럼 `Revenues` 가 없는 업종을 위해 넓게 잡는다. */
const CONCEPTS = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenuesNetOfInterestExpense",
    "InterestAndDividendIncomeOperating",
  ],
  operating_income: ["OperatingIncomeLoss"],
  net_income: ["NetIncomeLoss", "ProfitLoss"],
  eps_diluted: ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  liabilities: ["Liabilities"],
  totalDebt: ["DebtLongtermAndShorttermCombinedAmount", "LongTermDebt", "LongTermDebtNoncurrent"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  interestExpense: ["InterestExpense", "InterestExpenseDebt", "InterestIncomeExpenseNet"],
  depreciation: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
    "DepreciationAmortizationAndImpairment",
    "Depreciation",
  ],
  shares: [
    "EntityCommonStockSharesOutstanding",
    "CommonStockSharesOutstanding",
    "CommonStockSharesIssued",
    // 실측: SHOP·CRWV 는 dei 에 주식수가 없다(EntityPublicFloat 만). 가중평균 희석주식수가 유일한 경로다.
    "WeightedAverageNumberOfDilutedSharesOutstanding",
  ],
} as const;

type ConceptKey = keyof typeof CONCEPTS;

/** 시점값(대차대조표)으로 다루는 개념 — 나머지는 기간값(손익·현금흐름). */
const INSTANT_KEYS = new Set<ConceptKey>(["equity", "liabilities", "totalDebt", "cash"]);

async function getJson<T>(url: string): Promise<{ data: T | null; status: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SEC_UA, Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { data: null, status: String(res.status) };
    return { data: (await res.json()) as T, status: "200" };
  } catch (error) {
    return { data: null, status: error instanceof Error ? error.name : "error" };
  }
}

let cikMapCache: Map<string, string> | null = null;
let cikMapFailed = false;

/** ticker → CIK(10자리). 로드 실패는 "종목 없음"이 아니라 **미확인**이므로 구분해 던진다. */
export async function loadCikMap(): Promise<{ map: Map<string, string>; failed: boolean }> {
  if (cikMapCache) return { map: cikMapCache, failed: cikMapFailed };
  for (let attempt = 0; attempt < CIK_RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(1_500 * attempt);
    const { data } = await getJson<Record<string, { cik_str: number; ticker: string }>>(
      "https://www.sec.gov/files/company_tickers.json"
    );
    const rows = Object.values(data ?? {});
    if (rows.length > 0) {
      cikMapCache = new Map(rows.filter((r) => r?.ticker).map((r) => [r.ticker.toUpperCase(), String(r.cik_str).padStart(10, "0")]));
      cikMapFailed = false;
      return { map: cikMapCache, failed: false };
    }
  }
  cikMapCache = new Map();
  cikMapFailed = true;
  return { map: cikMapCache, failed: true };
}

/** 테스트에서 캐시를 비운다(모듈 캐시가 케이스 간에 새지 않게). */
export function resetCikMapCache(): void {
  cikMapCache = null;
  cikMapFailed = false;
}

interface Series {
  concept: string;
  entries: XbrlEntry[];
}

/** 개념 선택 시 세는 관측 창(년). 우리가 실제로 쓰는 구간(8분기·5회계연도)보다 약간 넓게 잡는다. */
const CONCEPT_SCORE_WINDOW_YEARS = 7;

/**
 * 후보 개념 중 **우리가 쓰는 구간에 관측이 가장 많은 것**을 고른다.
 *
 * 두 번의 실측이 이 규칙을 강제했다.
 *  ① "리스트 순서대로 처음 발견한 것"으로 두면 실데이터를 놓친다 — CLBK 는
 *     `RevenueFromContractWithCustomerExcludingAssessedTax` 가 2건(2019년)뿐인데 먼저 잡혀
 *     매출이 전 분기 `null` 이 됐고, 152건 있는 `InterestAndDividendIncomeOperating`(은행 이자수익)이 무시됐다.
 *  ② **전 기간 관측 수로 세면 폐기된 개념이 이긴다** — NUE(철강)는 2018년 이전에만 태깅된
 *     `SalesRevenueNet` 이 최근 개념보다 관측이 많아 선택됐고, 그 결과 최근 8분기 매출이 전부 `null` 이
 *     되어 영업이익률·시클리컬 판정 입력이 통째로 사라졌다(WO-SUB-02 임계값 실측에서 20종목 중 12종목 결손).
 *
 * 그래서 **최근 7년 안의 관측만** 센다. 동점이면 리스트 앞쪽(더 정확한 개념)을 쓴다.
 */
function findSeries(facts: CompanyFacts, key: ConceptKey, foreignUnits: Set<string>): Series | null {
  const instant = INSTANT_KEYS.has(key);
  const cutoff = new Date(Date.now() - CONCEPT_SCORE_WINDOW_YEARS * 365 * 86_400_000).toISOString().slice(0, 10);
  const recentCount = (map: Map<string, unknown>): number => [...map.keys()].filter((end) => end >= cutoff).length;
  let best: (Series & { score: number }) | null = null;
  for (const concept of CONCEPTS[key]) {
    for (const namespace of Object.values(facts.facts ?? {})) {
      const units = namespace?.[concept]?.units;
      if (!units) continue;
      const entries = units.USD ?? units["USD/shares"] ?? units.shares ?? units.pure;
      if (!entries || entries.length === 0) {
        // 개념은 있는데 통화가 USD 가 아닌 경우(외국 발행사) — "없음"이 아니라 "환산 금지라 쓸 수 없음"이다.
        // 환산은 §4 규칙 3 위반이므로 하지 않고, 사유를 정확히 남긴다.
        for (const unit of Object.keys(units)) if (unit !== "USD" && unit !== "USD/shares") foreignUnits.add(unit);
        continue;
      }
      const score = instant
        ? recentCount(instantByEnd(entries))
        : recentCount(firstDisclosureByEnd(entries, MIN_QUARTER_DAYS, MAX_QUARTER_DAYS)) +
          recentCount(firstDisclosureByEnd(entries, MIN_ANNUAL_DAYS, MAX_ANNUAL_DAYS));
      if (score === 0) continue;
      if (!best || score > best.score) best = { concept, entries, score };
    }
  }
  return best ? { concept: best.concept, entries: best.entries } : null;
}

function periodDays(entry: XbrlEntry): number | null {
  if (!entry.start || !entry.end) return null;
  const days = (Date.parse(entry.end) - Date.parse(entry.start)) / 86_400_000;
  return Number.isFinite(days) ? days : null;
}

/**
 * 정기보고서만 받는다. `20-F`·`40-F` 는 외국 발행사(IFRS)의 연간 정기보고서다 —
 * 이들은 분기보고서를 내지 않으므로 연간 레코드만 생긴다. 8-K 등 수시공시는 받지 않는다.
 */
function isReport(entry: XbrlEntry): boolean {
  return (
    !!entry.form &&
    /^(10-[QK]|20-F|40-F)/.test(entry.form) &&
    !!entry.end &&
    !!entry.filed &&
    typeof entry.val === "number"
  );
}

/** 공시 관측 하나. `fy`·`fp` 는 회계연도·회계분기 라벨의 근거다(달력에서 유추하지 않는다). */
export interface Disclosure {
  val: number;
  filed: string;
  restated: boolean;
  fy?: number;
  fp?: string;
}

/** 기간말 → { 최초 공시일, 최초 공시값, 정정 여부 }. 최초 공시를 정본으로 삼는 이유는 파일 상단 주석 참조. */
function firstDisclosureByEnd(entries: readonly XbrlEntry[], min: number, max: number): Map<string, Disclosure> {
  const out = new Map<string, Disclosure>();
  const sorted = [...entries].filter(isReport).sort((a, b) => a.filed!.localeCompare(b.filed!));
  for (const entry of sorted) {
    const days = periodDays(entry);
    if (days === null || days < min || days > max) continue;
    const existing = out.get(entry.end!);
    if (!existing) {
      out.set(entry.end!, {
        val: entry.val!,
        filed: entry.filed!,
        restated: false,
        ...(typeof entry.fy === "number" ? { fy: entry.fy } : {}),
        ...(entry.fp ? { fp: entry.fp } : {}),
      });
      continue;
    }
    if (existing.val !== entry.val) existing.restated = true;
  }
  return out;
}

/** 시점값(대차대조표) — 기간이 없는 사실. 기간말별 최초 공시. */
function instantByEnd(entries: readonly XbrlEntry[]): Map<string, { val: number; filed: string }> {
  const out = new Map<string, { val: number; filed: string }>();
  const sorted = [...entries].filter((e) => isReport(e) && !e.start).sort((a, b) => a.filed!.localeCompare(b.filed!));
  for (const entry of sorted) {
    if (!out.has(entry.end!)) out.set(entry.end!, { val: entry.val!, filed: entry.filed! });
  }
  return out;
}

/**
 * 회계분기 라벨. **달력 월에서 유추하지 않는다** — 52/53주 회계연도를 쓰는 기업은
 * 분기말이 달력 분기와 어긋난다. 실측: NUE(철강)는 분기말이 04-05·07-05·10-04 이라
 * 월÷3 규칙이 04-05 를 Q2 로, 10-04 를 Q4 로 찍어 **연간에서 구성한 Q4(12-31)와 라벨이 충돌**했다
 * (같은 종목에 `2025Q4` 레코드가 둘). SEC 가 주는 `fy`·`fp` 를 쓰면 그런 충돌이 없다.
 */
export function periodLabel(periodEnd: string, disclosure?: Pick<Disclosure, "fy" | "fp">): string {
  const fy = disclosure?.fy;
  const fp = disclosure?.fp;
  if (typeof fy === "number" && fp && /^Q[1-4]$/.test(fp)) return `${fy}${fp}`;
  const month = Number(periodEnd.slice(5, 7));
  const quarter = Math.min(4, Math.max(1, Math.ceil(month / 3)));
  return `${periodEnd.slice(0, 4)}Q${quarter}`;
}

export function annualLabel(periodEnd: string, disclosure?: Pick<Disclosure, "fy">): string {
  return `${disclosure?.fy ?? periodEnd.slice(0, 4)}FY`;
}

function toPoints(map: Map<string, { val: number; filed: string }>): PointObservation[] {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period_end, v]) => ({ period_end, filed_at: v.filed, value: v.val }));
}

/**
 * Q4 구성 — 연간 값에서 같은 회계연도의 1~3분기를 뺀다.
 * 세 분기가 다 모이지 않으면 만들지 않는다(부분 차감은 가짜 숫자다).
 * EPS 는 분기별 희석주식수가 달라 차감이 정확하지 않으므로 **구성하지 않는다**(null).
 */
export function composeQ4(
  quarterVals: Map<string, Disclosure>,
  annualVals: Map<string, Disclosure>
): Map<string, Disclosure> {
  const out = new Map<string, Disclosure>();
  for (const [annualEnd, annual] of annualVals) {
    const year = Number(annualEnd.slice(0, 4));
    const month = annualEnd.slice(5, 10);
    // 같은 회계연도의 분기 3개 — 연말과 같은 결산월 기준으로 3·6·9개월 앞 기간말을 찾는다.
    const priorEnds = [...quarterVals.keys()].filter((end) => {
      const gap = (Date.parse(annualEnd) - Date.parse(end)) / 86_400_000;
      return gap > 0 && gap < 300;
    });
    if (priorEnds.length !== 3) continue;
    const sum = priorEnds.reduce((acc, end) => acc + quarterVals.get(end)!.val, 0);
    const q4 = annual.val - sum;
    if (!Number.isFinite(q4)) continue;
    out.set(annualEnd, {
      val: q4,
      // 공시일은 연간 보고서(10-K)가 나온 날이다 — 그때 처음 알 수 있었던 값이다.
      filed: annual.filed,
      restated: annual.restated,
      // 회계연도는 연간 보고서의 것을 물려받고, 회계분기는 Q4 로 못박는다(라벨 충돌 방지).
      ...(annual.fy !== undefined ? { fy: annual.fy } : {}),
      fp: "Q4",
    });
    void year;
    void month;
  }
  return out;
}

type FlowKey = "revenue" | "operating_income" | "net_income" | "eps_diluted";
const FLOW_KEYS = ["revenue", "operating_income", "net_income", "eps_diluted"] as const;

function buildRecords(
  ends: readonly string[],
  fields: Record<FlowKey, Map<string, Disclosure> | null>,
  concepts: Partial<Record<FlowKey, string>>,
  label: (end: string, disclosure?: Pick<Disclosure, "fy" | "fp">) => string,
  source: string
): QuarterRecord[] {
  const records: QuarterRecord[] = [];
  for (const end of [...ends].sort()) {
    // filed_at 은 이 기간을 구성하는 사실들 중 **가장 늦은** 공시일이다 — 그 시점에야 이 레코드가 완성된다.
    const filedCandidates = FLOW_KEYS.map((key) => fields[key]?.get(end)?.filed).filter((v): v is string => !!v);
    if (filedCandidates.length === 0) continue; // 공시일 없으면 레코드를 만들지 않는다(§6-2)
    const filed = filedCandidates.sort()[filedCandidates.length - 1]!;
    const pick = (key: FlowKey): number | null => {
      const v = fields[key]?.get(end)?.val;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    // 회계연도·회계분기는 어느 항목에서든 같아야 하므로 먼저 찾은 것을 쓴다.
    const stamped = FLOW_KEYS.map((key) => fields[key]?.get(end)).find((d) => d && (d.fy !== undefined || d.fp !== undefined));
    records.push({
      period: label(end, stamped),
      period_end: end,
      filed_at: filed,
      revenue: pick("revenue"),
      operating_income: pick("operating_income"),
      net_income: pick("net_income"),
      eps_diluted: pick("eps_diluted"),
      source,
      concepts,
    });
  }
  return records;
}

/** 심볼의 SEC 재무 일체. CIK 를 못 찾으면 errors 에 사유를 남기고 빈 결과를 준다. */
export async function fetchSecFundamentals(symbol: string): Promise<SecFundamentals> {
  const fetchedAt = new Date().toISOString();
  const empty = (errors: string[]): SecFundamentals => ({
    quarters: [],
    annual: [],
    equity: [],
    liabilities: [],
    totalDebt: [],
    cash: [],
    operatingCashFlow: [],
    interestExpense: [],
    depreciation: [],
    sharesSeries: [],
    sharesOutstanding: null,
    sharesOutstandingAsOf: null,
    errors,
    fetchedAt,
  });

  const upper = symbol.trim().toUpperCase();
  if (!upper) return empty(["sec: 심볼 없음"]);
  const { map, failed } = await loadCikMap();
  if (failed) return empty(["sec: CIK 매핑 로드 실패 — 미확인(없음이 아님)"]);
  const cik = map.get(upper);
  if (!cik) return empty([`sec: CIK 매핑 없음(${upper})`]);

  await sleep(DELAY_MS);
  const { data: facts, status } = await getJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  if (!facts) return empty([`sec: companyfacts ${status}`]);

  const errors: string[] = [];
  const foreignUnits = new Set<string>();
  const series = {} as Record<ConceptKey, Series | null>;
  const absent: string[] = [];
  for (const key of Object.keys(CONCEPTS) as ConceptKey[]) {
    series[key] = findSeries(facts, key, foreignUnits);
    if (!series[key]) absent.push(key);
  }
  if (absent.length > 0) errors.push(`sec: USD 계열 개념 부재 — ${absent.join(", ")}`);
  if (foreignUnits.size > 0) {
    // 통화 환산 금지(§4 규칙 3) — 원통화 재무를 USD 로 바꿔 저장하지 않는다.
    errors.push(`sec: 재무가 ${[...foreignUnits].sort().join("/")} 로 보고됨 — 통화 환산 금지 원칙상 사용 불가`);
  }

  const flowKeys = ["revenue", "operating_income", "net_income", "eps_diluted"] as const;
  const quarterMaps: Record<string, Map<string, Disclosure>> = {};
  const annualMaps: Record<string, Map<string, Disclosure>> = {};
  const concepts: Partial<Record<(typeof flowKeys)[number], string>> = {};
  for (const key of flowKeys) {
    const s = series[key];
    quarterMaps[key] = s ? firstDisclosureByEnd(s.entries, MIN_QUARTER_DAYS, MAX_QUARTER_DAYS) : new Map();
    annualMaps[key] = s ? firstDisclosureByEnd(s.entries, MIN_ANNUAL_DAYS, MAX_ANNUAL_DAYS) : new Map();
    if (s) concepts[key] = s.concept;
  }

  // Q4 구성 — EPS 는 제외(주석 참조).
  const q4Composed: Record<string, Map<string, Disclosure>> = {};
  for (const key of ["revenue", "operating_income", "net_income"] as const) {
    q4Composed[key] = composeQ4(quarterMaps[key]!, annualMaps[key]!);
  }

  const mergedQuarter: Record<string, Map<string, Disclosure>> = {};
  for (const key of flowKeys) {
    const merged = new Map<string, Disclosure>(quarterMaps[key]!);
    for (const [end, v] of q4Composed[key] ?? []) if (!merged.has(end)) merged.set(end, v);
    mergedQuarter[key] = merged;
  }

  const quarterEnds = new Set<string>();
  for (const key of flowKeys) for (const end of mergedQuarter[key]!.keys()) quarterEnds.add(end);
  const annualEnds = new Set<string>();
  for (const key of flowKeys) for (const end of annualMaps[key]!.keys()) annualEnds.add(end);

  const q4Ends = new Set(Object.values(q4Composed).flatMap((m) => [...m.keys()]));
  const quarters = buildRecords(
    [...quarterEnds],
    {
      revenue: mergedQuarter.revenue!,
      operating_income: mergedQuarter.operating_income!,
      net_income: mergedQuarter.net_income!,
      eps_diluted: mergedQuarter.eps_diluted!,
    },
    concepts,
    periodLabel,
    "sec_xbrl"
  ).map((record) =>
    // Q4 는 구성된 값이므로 소스 문자열로 그 사실을 드러낸다(감사 가능성).
    q4Ends.has(record.period_end) && !quarterMaps.net_income!.has(record.period_end)
      ? { ...record, source: "sec_xbrl:q4_from_fy_minus_9m" }
      : record
  );

  const annual = buildRecords(
    [...annualEnds],
    {
      revenue: annualMaps.revenue!,
      operating_income: annualMaps.operating_income!,
      net_income: annualMaps.net_income!,
      eps_diluted: annualMaps.eps_diluted!,
    },
    concepts,
    annualLabel,
    "sec_xbrl"
  );

  const instants = (key: ConceptKey): PointObservation[] => {
    const s = series[key];
    return s ? toPoints(instantByEnd(s.entries)) : [];
  };
  const flows = (key: ConceptKey): PointObservation[] => {
    const s = series[key];
    if (!s) return [];
    const map = firstDisclosureByEnd(s.entries, MIN_QUARTER_DAYS, MAX_QUARTER_DAYS);
    return toPoints(new Map([...map].map(([k, v]) => [k, { val: v.val, filed: v.filed }])));
  };

  // 주식수는 시점값(dei)일 수도, 기간값(가중평균 희석주식수)일 수도 있다 — 둘 다 받는다.
  const sharesPoints = instants("shares").length > 0 ? instants("shares") : flows("shares");
  const sharesSeries: SharesPoint[] = sharesPoints.map((p) => ({ as_of: p.period_end, shares: p.value }));
  const latestShares = sharesPoints[sharesPoints.length - 1] ?? null;

  return {
    quarters,
    annual,
    equity: instants("equity"),
    liabilities: instants("liabilities"),
    totalDebt: instants("totalDebt"),
    cash: instants("cash"),
    operatingCashFlow: flows("operatingCashFlow"),
    interestExpense: flows("interestExpense"),
    depreciation: flows("depreciation"),
    sharesSeries,
    sharesOutstanding: latestShares?.value ?? null,
    sharesOutstandingAsOf: latestShares?.period_end ?? null,
    errors,
    fetchedAt,
  };
}

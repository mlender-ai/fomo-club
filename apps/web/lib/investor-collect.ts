/**
 * WO-RESET-07 PART A — 유명 투자자 보유 내역 수집.
 *
 * ## 소스별 실측 (2026-08-27, 전부 무료·무인증)
 *
 * | 소스 | 주기 | 확인 |
 * |---|---|---|
 * | ARK 일별 CSV | **매일** | ARKK·ARKW·ARKG·ARKF 200 · 티커와 CUSIP 을 **둘 다** 준다 |
 * | SEC 13F | 분기 | 제출 목록·보유 표 200. **CUSIP 만** 주고 티커가 없다 |
 * | SEC company_tickers | — | 10,388종목 CIK·티커·회사명 |
 *
 * ## 13F 의 진짜 문제는 티커다
 *
 * 13F 보유 표는 **CUSIP 으로만** 종목을 적는다. 우리 화면은 티커로 돈다. 회사명으로 맞추면
 * SEC 약어(`BANK OF AMER CORP`·`ALLY FINL INC`) 때문에 **실측 62%** 만 붙었다.
 *
 * 모자란 38%를 유사 매칭으로 메우지 않는다 — **오인식 한 건이 신뢰를 깬다**(`stocks.ts` 의
 * 오랜 규칙). 대신 두 가지로 채운다:
 *   ① ARK CSV 가 주는 **진짜 CUSIP↔티커 쌍**을 모아 사전으로 쓴다
 *   ② 정규화 후 **정확히 일치**하는 회사명만 받는다
 * 그래도 못 찾은 보유는 **버리고 센다.** 카드가 몇 장 줄어드는 게 틀린 종목을 보여주는 것보다 낫다.
 */

import type { InvestorHolding, InvestorProfile, InvestorSnapshot } from "@fomo/core/keyword-cards/investor-holdings";

const ARK_CSV_BASE = "https://assets.ark-funds.com/fund-documents/funds-etf-csv";
const SEC_SUBMISSIONS = "https://data.sec.gov/submissions";
const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data";
const SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";

/** SEC 은 연락처 포함 평문 UA 만 200 을 준다(§ sec-edgar.ts 의 실측 주석과 같은 규약). */
function secUa(): string {
  return process.env.SEC_EDGAR_USER_AGENT?.trim() || "FomoClub/1.0 fomo-club@example.com";
}

/**
 * 1차 대상 인물 (§A-1).
 *
 * 선정 기준은 WO 가 정했다 — 이름만 봐도 아는 사람 · 무료로 확보 가능 · 변동이 실제로 뉴스가 됨.
 * `cik` 은 13F 제출자 번호다(실측으로 확인한 것만 적는다).
 */
export const INVESTORS: ReadonlyArray<InvestorProfile & { cik?: string; arkFunds?: readonly string[] }> = [
  {
    id: "cathie-wood", name: "캐시 우드", firm: "ARK", source: "ark",
    // 매일 나오는 유일한 소스라 1순위다(WO §A-2).
    arkFunds: [
      "ARK_INNOVATION_ETF_ARKK_HOLDINGS",
      "ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS",
      "ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS",
      "ARK_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS",
    ],
  },
  { id: "warren-buffett", name: "워런 버핏", firm: "버크셔 해서웨이", source: "13f", cik: "0001067983" },
  { id: "bill-ackman", name: "빌 애크먼", firm: "퍼싱 스퀘어", source: "13f", cik: "0001336528" },
  { id: "michael-burry", name: "마이클 버리", firm: "사이언 애셋", source: "13f", cik: "0001649339" },
  { id: "david-tepper", name: "데이비드 테퍼", firm: "아팔루사", source: "13f", cik: "0001656456" },
  { id: "chase-coleman", name: "체이스 콜먼", firm: "타이거 글로벌", source: "13f", cik: "0001167483" },
    /**
   * 코투는 `0001135730` 이다. 처음에 적은 `0001165408` 은 **ADAGE CAPITAL** 이었다
   * (2026-08-27 실측 — 638종목 중 322종목이 티커 미해석이라 이상해서 확인했다).
   * 인물 카드에서 **누가 샀는지 틀리는 것**은 이 기능 전체를 무의미하게 만든다.
   */
  { id: "philippe-laffont", name: "필립 라퐁", firm: "코투", source: "13f", cik: "0001135730" },
  { id: "daniel-loeb", name: "대니얼 로브", firm: "서드포인트", source: "13f", cik: "0001040273" },
  { id: "seth-klarman", name: "세스 클라먼", firm: "바우포스트", source: "13f", cik: "0001061768" },
  { id: "david-einhorn", name: "데이비드 아인혼", firm: "그린라이트", source: "13f", cik: "0001079114" },
  { id: "carl-icahn", name: "칼 아이칸", firm: "아이칸 엔터프라이즈", source: "13f", cik: "0000921669" },
  { id: "stanley-druckenmiller", name: "스탠리 드러켄밀러", firm: "듀케인", source: "13f", cik: "0001536411" },
];

/**
 * SEC 요청 사이 간격(ms).
 *
 * SEC 는 초당 10건을 넘기면 403 을 준다. 인물 11명 × (제출목록 + 디렉터리 + 보유표) 를
 * 쉬지 않고 쏘면 뒤쪽 인물이 통째로 실패한다 — 실측(2026-08-27): 서드포인트·바우포스트가
 * 목록에는 13F 가 멀쩡히 있는데 조회에 실패했다. **없는 게 아니라 막힌 것**이었다.
 */
const SEC_GAP_MS = 150;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** `"1,662,466"` · `"$574,913,992.12"` · `"8.97%"` → 숫자. 못 읽으면 `undefined`. */
function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/["$,%\s]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/** 따옴표를 존중하는 최소 CSV 분해 — 금액에 쉼표가 들어 있어 단순 split 이 안 된다. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** `08/27/2026` → `2026-08-27`. 형식이 아니면 `null`. */
function isoFromUsDate(raw: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((raw ?? "").trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/**
 * 손으로 확인한 CUSIP → 티커 씨앗.
 *
 * ## 왜 손으로 적나
 *
 * 13F 는 CUSIP 으로만 종목을 적는데 회사명 매칭은 SEC 약어 때문에 **실측 36%** 만 붙었다
 * (버크셔 2026-Q2). 나머지를 유사 매칭으로 메우면 오인식이 생기고, 그건 카드 몇 장보다 비싸다.
 *
 * **CUSIP 은 추측이 아니라 식별자다.** 여기 적힌 쌍은 실제 공시에서 그 CUSIP 옆에 적힌
 * 회사명을 사람이 확인한 것이다. 자동으로 늘리지 않는다 — 늘릴 때도 같은 방식으로 확인한다.
 *
 * ARK CSV 가 매일 **진짜 쌍**을 43개 이상 주므로 실제 사전은 이보다 훨씬 크다.
 * 여기 있는 것은 ARK 가 안 들고 있는 대형 가치주들이다.
 */
const CURATED_CUSIP: Record<string, string> = {
  "02005N100": "ALLY", "02079K107": "GOOGL", "02079K305": "GOOG",
  "025816109": "AXP", "037833100": "AAPL", "060505104": "BAC",
  "14040H105": "COF", "166764100": "CVX", "191216100": "KO",
  "23331A109": "DHI", "23918K108": "DVA", "247361702": "DAL",
  "47233W109": "JEF", "500754106": "KHC", "501044101": "KR",
  "526057104": "LEN", "526057302": "LEN.B", "546347105": "LPX",
  "55616P104": "M", "615369105": "MCO", "62944T105": "NVR",
  "650111107": "NYT", "670346105": "NUE", "674599105": "OXY",
  "829933100": "SIRI", "92343E102": "VRSN", "H1467J104": "CB",
  // 다른 인물의 대형 보유 — 같은 방식으로 확인한 것만.
  "594918104": "MSFT", "67066G104": "NVDA", "023135106": "AMZN",
  "30303M102": "META", "88160R101": "TSLA", "459200101": "IBM",
  "742718109": "PG", "478160104": "JNJ", "92826C839": "V",
  "57636Q104": "MA", "46625H100": "JPM", "693475105": "PFE",
};

/** 씨앗 사전 — 부르는 쪽이 여기에 ARK·이름 매칭을 얹어 쓴다. */
export function curatedCusipMap(): Map<string, string> {
  return new Map(Object.entries(CURATED_CUSIP));
}

export interface ArkParseResult {
  asOf: string | null;
  holdings: InvestorHolding[];
  /** CUSIP → 티커. 13F 가 쓸 **진짜 쌍**이다(추측이 아니다). */
  cusipToTicker: Map<string, string>;
}

/**
 * ARK 보유 CSV 한 장을 읽는다.
 *
 * 헤더: `date,fund,company,ticker,cusip,shares,market value ($),weight (%)`
 * 마지막 몇 줄은 면책 문구라 티커가 없다 — 티커 없는 행은 버린다.
 */
export function parseArkCsv(csv: string): ArkParseResult {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name));
  const iDate = col("date"), iCompany = col("company"), iTicker = col("ticker");
  const iCusip = col("cusip"), iShares = col("shares"), iValue = col("market value"), iWeight = col("weight");
  if (iTicker < 0 || iShares < 0) return { asOf: null, holdings: [], cusipToTicker: new Map() };

  let asOf: string | null = null;
  const holdings: InvestorHolding[] = [];
  const cusipToTicker = new Map<string, string>();

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const ticker = (cells[iTicker] ?? "").trim().toUpperCase();
    // 티커가 티커처럼 생기지 않으면 데이터 행이 아니다(면책 문구·빈 줄).
    if (!/^[A-Z][A-Z.\-]{0,6}$/.test(ticker)) continue;
    const shares = parseNumber(cells[iShares]);
    if (!shares || shares <= 0) continue;

    asOf = asOf ?? (iDate >= 0 ? isoFromUsDate(cells[iDate]) : null);
    const cusip = (cells[iCusip] ?? "").trim().toUpperCase();
    if (/^[A-Z0-9]{9}$/.test(cusip)) cusipToTicker.set(cusip, ticker);

    holdings.push({
      ticker,
      name: (cells[iCompany] ?? ticker).trim(),
      shares,
      ...(iValue >= 0 && parseNumber(cells[iValue]) ? { valueUsd: parseNumber(cells[iValue])! } : {}),
      ...(iWeight >= 0 && parseNumber(cells[iWeight]) ? { weightPct: parseNumber(cells[iWeight])! } : {}),
    });
  }
  return { asOf, holdings, cusipToTicker };
}

/** 여러 펀드를 합친다 — 같은 티커는 주식 수·금액을 더하고 비중은 금액으로 다시 낸다. */
export function mergeArkFunds(parts: readonly ArkParseResult[]): ArkParseResult {
  const byTicker = new Map<string, InvestorHolding>();
  const cusipToTicker = new Map<string, string>();
  let asOf: string | null = null;

  for (const part of parts) {
    // 펀드마다 공시일이 하루씩 다를 수 있다 — **가장 최신**을 쓴다.
    const partAsOf: string | null = part.asOf;
    if (partAsOf && (!asOf || partAsOf > asOf)) asOf = partAsOf;
    for (const [cusip, ticker] of part.cusipToTicker) cusipToTicker.set(cusip, ticker);
    for (const h of part.holdings) {
      const prev = byTicker.get(h.ticker);
      if (!prev) { byTicker.set(h.ticker, { ...h }); continue; }
      prev.shares += h.shares;
      if (typeof h.valueUsd === "number") prev.valueUsd = (prev.valueUsd ?? 0) + h.valueUsd;
    }
  }

  // 비중은 **합친 뒤 다시 낸다** — 펀드별 비중을 더하면 합이 100%를 넘는다.
  const holdings = [...byTicker.values()];
  const total = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  if (total > 0) for (const h of holdings) {
    if (typeof h.valueUsd === "number") h.weightPct = (h.valueUsd / total) * 100;
  }
  holdings.sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));
  return { asOf, holdings, cusipToTicker };
}

/** ARK 전 펀드를 받아 한 시점으로 만든다. 한 장도 못 읽으면 `null`. */
export async function fetchArkSnapshot(funds: readonly string[]): Promise<ArkParseResult | null> {
  const ua = { "User-Agent": "Mozilla/5.0 (compatible; FomoClub/1.0; fomo-club@example.com)" };
  const parts: ArkParseResult[] = [];
  for (const fund of funds) {
    const csv = await fetchText(`${ARK_CSV_BASE}/${fund}.csv`, ua);
    if (!csv) continue;
    const parsed = parseArkCsv(csv);
    if (parsed.holdings.length > 0) parts.push(parsed);
  }
  if (parts.length === 0) return null;
  return mergeArkFunds(parts);
}

/**
 * 회사명 정규화 — 법인격 접미를 떼고 영숫자만 남긴다.
 *
 * **정확히 일치할 때만** 티커를 준다. SEC 약어(`FINL`·`AMER`)까지 풀어서 맞추려 들면
 * 오인식이 생기고, 그건 카드 몇 장보다 비싸다.
 */
export function normalizeCompanyName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LLC|PLC|SA|NV|AG|HLDGS|HOLDINGS|GROUP|GRP|THE|CLASS|CL|COM|NEW|DEL|TR|TRUST)\b/g, " ")
    .replace(/[^A-Z0-9]/g, "");
}

/** SEC 회사명 → 티커 사전. 실패하면 빈 맵(수집이 멈추지는 않는다). */
export async function fetchSecNameIndex(): Promise<Map<string, string>> {
  const raw = await fetchText(SEC_TICKERS, { "User-Agent": secUa() });
  const out = new Map<string, string>();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, { ticker?: string; title?: string }>;
    for (const row of Object.values(parsed)) {
      const name = row.title ? normalizeCompanyName(row.title) : "";
      const ticker = row.ticker?.trim().toUpperCase();
      if (name && ticker && !out.has(name)) out.set(name, ticker);
    }
  } catch {
    return out;
  }
  return out;
}

export interface ThirteenFResult {
  asOf: string;
  filedAt: string;
  holdings: InvestorHolding[];
  /** 티커를 못 찾아 **버린** 보유 수. 보고할 것 1번의 재료다. */
  unresolved: number;
}

/** 13F 보유 표 XML → 보유 목록. 티커를 못 찾은 행은 **버린다**(추측하지 않는다). */
export function parseThirteenF(
  xml: string,
  resolve: (cusip: string, name: string) => string | undefined
): { holdings: InvestorHolding[]; unresolved: number } {
  const byTicker = new Map<string, InvestorHolding>();
  let unresolved = 0;
  for (const match of xml.matchAll(/<infoTable>([\s\S]*?)<\/infoTable>/g)) {
    const body = match[1]!;
    const tag = (name: string) => new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`).exec(body)?.[1]?.trim();
    const cusip = (tag("cusip") ?? "").toUpperCase();
    const name = tag("nameOfIssuer") ?? "";
    const value = Number(tag("value") ?? 0);
    const shares = Number(tag("sshPrnamt") ?? 0);
    if (!(shares > 0)) continue;

    const ticker = resolve(cusip, name);
    if (!ticker) { unresolved += 1; continue; }
    const prev = byTicker.get(ticker);
    if (prev) {
      prev.shares += shares;
      prev.valueUsd = (prev.valueUsd ?? 0) + value;
    } else {
      byTicker.set(ticker, { ticker, name, shares, ...(value > 0 ? { valueUsd: value } : {}) });
    }
  }
  const holdings = [...byTicker.values()];
  /**
   * 13F 의 `value` 는 **달러**다(2023년 개정 전에는 천 달러였다 — 옛 파일을 섞지 않도록
   * 최근 것만 읽는다). 비중은 합계로 다시 낸다.
   */
  const total = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  if (total > 0) for (const h of holdings) {
    if (typeof h.valueUsd === "number") h.weightPct = (h.valueUsd / total) * 100;
  }
  holdings.sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));
  return { holdings, unresolved };
}

/** 한 인물의 최근 13F 두 건(최신·직전)을 받는다. 없으면 빈 배열. */
export async function fetchThirteenF(
  cik: string,
  resolve: (cusip: string, name: string) => string | undefined,
  limit = 2
): Promise<ThirteenFResult[]> {
  const headers = { "User-Agent": secUa() };
  await sleep(SEC_GAP_MS);
  const raw = await fetchText(`${SEC_SUBMISSIONS}/CIK${cik}.json`, headers);
  if (!raw) return [];
  let recent: { form?: string[]; filingDate?: string[]; reportDate?: string[]; accessionNumber?: string[] };
  try {
    recent = (JSON.parse(raw) as { filings?: { recent?: typeof recent } }).filings?.recent ?? {};
  } catch {
    return [];
  }
  const forms = recent.form ?? [];
  const picks: number[] = [];
  for (let i = 0; i < forms.length && picks.length < limit; i += 1) {
    if (/^13F-HR(?!\/A)/.test(forms[i] ?? "")) picks.push(i);
  }

  const out: ThirteenFResult[] = [];
  for (const i of picks) {
    const accession = (recent.accessionNumber ?? [])[i];
    if (!accession) continue;
    const dir = `${SEC_ARCHIVES}/${String(Number(cik))}/${accession.replace(/-/g, "")}`;
    await sleep(SEC_GAP_MS);
    const index = await fetchText(`${dir}/`, headers);
    if (!index) continue;
    /**
     * 보유 표 파일 이름은 제출자마다 다르다(`56757.xml` 처럼 번호만인 경우도 있다).
     * `primary_doc.xml` 은 표지라 제외하고, 남은 xml 중 `infoTable` 이 들어 있는 것을 쓴다.
     */
    const candidates = [...index.matchAll(/href="[^"]*\/([^"/]+\.xml)"/g)]
      .map((m) => m[1]!)
      .filter((n) => !/primary_doc/i.test(n));
    for (const file of candidates) {
      await sleep(SEC_GAP_MS);
      const xml = await fetchText(`${dir}/${file}`, headers);
      if (!xml || !xml.includes("infoTable")) continue;
      const parsed = parseThirteenF(xml, resolve);
      if (parsed.holdings.length === 0 && parsed.unresolved === 0) continue;
      out.push({
        asOf: (recent.filingDate ?? [])[i] ?? "",
        filedAt: (recent.filingDate ?? [])[i] ?? "",
        holdings: parsed.holdings,
        unresolved: parsed.unresolved,
      });
      break;
    }
  }
  return out;
}

/** 저장 형태 — 인물별 최신·직전 두 시점. 변화는 읽을 때 계산한다. */
export interface InvestorCollection {
  asOf: string;
  byInvestor: Record<string, { latest: InvestorSnapshot; prior: InvestorSnapshot | null; unresolved?: number }>;
  errors: string[];
}

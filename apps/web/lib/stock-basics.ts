import { assembleStockBasics, parseNaverStockBasic, resolveStock, type StockBasics } from "@fomo/core";

/**
 * 종목 기본 정보(바닥) 수집 — STOCK_SCREEN_REDESIGN §2.
 * 출처: 네이버 금융 종목 API(m.stock.naver.com/api/stock/{code}/*) — 이미 쓰는 무료·무인증 출처.
 *   · basic         → 주가·등락·시장
 *   · integration   → 시총·PER/EPS/PBR/배당/52주
 *   · finance/annual→ 회사개요·연간 매출/영업이익/순이익(추정치 구분)
 * 종목명 → 코드: STOCK_VOCAB(resolveStock).naverCode 재사용. 코드 없으면(미국주 등) 기본만(정직).
 * 파싱·번역은 fomo-core 순수부(assembleStockBasics). 여긴 fetch·조립만.
 */

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn("[stock-basics] non-OK", res.status, url);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[stock-basics] fetch failed", url, (err as Error)?.message);
    return null;
  }
}

function validNaverCode(code: string | undefined | null): string | undefined {
  const c = code?.trim();
  return c && /^\d{6}$/.test(c) ? c : undefined;
}

/** 카드 앞면 lite용 — 주가·등락만 짧게 가져온다. 상세 지표/재무/개요는 depth API가 맡는다. */
export async function fetchStockBasicsLite(stock: string, timeoutMs = 3500, naverCode?: string): Promise<StockBasics> {
  const def = resolveStock(stock);
  const code = validNaverCode(naverCode) ?? def?.naverCode;
  if (!code) return { name: def?.canonical ?? stock, metrics: [] };

  const base = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}`;
  const basic = await getJson(`${base}/basic`, timeoutMs);
  const parsed = parseNaverStockBasic(basic);
  return {
    name: parsed.name || def?.canonical || stock,
    ...(parsed.market ? { market: parsed.market } : {}),
    ...(parsed.priceText ? { priceText: parsed.priceText } : {}),
    ...(parsed.changeText ? { changeText: parsed.changeText } : {}),
    ...(parsed.changeDir ? { changeDir: parsed.changeDir } : {}),
    metrics: [],
  };
}

/** 종목명으로 기본 정보. discovery row 의 naverCode 가 있으면 vocab 미등록 종목도 조회한다. */
export async function fetchStockBasics(stock: string, naverCode?: string, symbol?: string): Promise<StockBasics> {
  const def = resolveStock(stock);
  const code = validNaverCode(naverCode) ?? def?.naverCode;
  if (!code) {
    // 국내 코드 없음 → US 심볼이 있으면 Yahoo quoteSummary(무료·이미 쓰는 소스군)로 재무 바닥을 깐다.
    const usSymbol = symbol?.trim().toUpperCase();
    if (usSymbol && /^[A-Z][A-Z.\-]{0,6}$/.test(usSymbol)) {
      const us = await fetchUsStockBasics(def?.canonical ?? stock, usSymbol);
      if (us) return us;
    }
    // 소스 실패/심볼 없음 → 정직하게 이름만(상위에서 수급/해석으로 보완).
    return { name: def?.canonical ?? stock, metrics: [] };
  }
  const base = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}`;
  const [basic, integration, finance] = await Promise.all([
    getJson(`${base}/basic`),
    getJson(`${base}/integration`),
    getJson(`${base}/finance/annual`),
  ]);
  return assembleStockBasics(def?.canonical ?? stock, basic, integration, finance);
}

// ── US 기본 정보 — api.nasdaq.com (WO Phase 1.5 F). 이미 쓰는 무료 소스(us-market-source 동일 계열).
//    Yahoo quoteSummary 는 crumb 인증이 걸려 사용 불가(확인됨) — Nasdaq summary+financials 로 대체.
//    실데이터만, 실패/결측 시 항목 생략 또는 null(fail-open). ──

const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function getNasdaqJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NASDAQ_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("[stock-basics] nasdaq fetch failed", url, (err as Error)?.message);
    return null;
  }
}

/** "$416,161,000"(천 달러) → "$416.2B" 식 축약. 숫자 없으면 null(가짜 금지). */
function formatUsdThousands(value: string | undefined): string | null {
  const digits = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!/\d/.test(digits)) return null;
  const dollars = Number(digits) * 1000;
  if (!Number.isFinite(dollars)) return null;
  return formatUsdCompact(dollars);
}

function formatUsdCompact(dollars: number): string {
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

interface NasdaqLabelValue {
  label?: string;
  value?: string;
}

/** Nasdaq summary+financials → StockBasics. 시총·52주·배당 + 연간 매출/영업이익. PER 미제공 시 생략(정직). */
export async function fetchUsStockBasics(name: string, symbol: string): Promise<StockBasics | null> {
  const [summaryRaw, financialsRaw] = await Promise.all([
    getNasdaqJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=stocks`),
    getNasdaqJson(`https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/financials?frequency=1`),
  ]);

  const summary = (summaryRaw as { data?: { summaryData?: Record<string, NasdaqLabelValue> } } | null)?.data?.summaryData;
  const metrics: StockBasics["metrics"] = [];
  let marketCap: string | undefined;
  let market: string | undefined;
  let sector: string | undefined;
  if (summary) {
    const capDigits = String(summary.MarketCap?.value ?? "").replace(/[^\d]/g, "");
    if (capDigits) marketCap = formatUsdCompact(Number(capDigits));
    if (summary.Exchange?.value && summary.Exchange.value !== "N/A") market = summary.Exchange.value;
    if (summary.Sector?.value && summary.Sector.value !== "N/A") sector = summary.Sector.value;
    const range52 = summary.FiftTwoWeekHighLow?.value;
    if (range52 && range52 !== "N/A") metrics.push({ label: "52주 고점/저점", value: range52, term: "52주" });
    const divYield = summary.Yield?.value;
    if (divYield && divYield !== "N/A") metrics.push({ label: "배당수익률", value: divYield, term: "배당" });
  }

  let financials: StockBasics["financials"];
  const income = (financialsRaw as {
    data?: { incomeStatementTable?: { headers?: Record<string, string>; rows?: Array<Record<string, string>> } };
  } | null)?.data?.incomeStatementTable;
  if (income?.headers && income.rows?.length) {
    // headers: value2=최신 → value4=과거. 최근 3개 연도를 오래된→최신으로.
    const keys = (["value4", "value3", "value2"] as const).filter((k) => income.headers?.[k]);
    const periods = keys.map((k) => ({ title: income.headers![k]!, estimate: false }));
    const pickRow = (label: RegExp) => income.rows!.find((row) => label.test(row.value1 ?? ""));
    const buildRow = (label: string, source: Record<string, string> | undefined) => {
      if (!source) return null;
      const values = keys.map((k) => formatUsdThousands(source[k]) ?? "—");
      return values.some((v) => v !== "—") ? { label, values } : null;
    };
    const rows = [
      buildRow("벌어들인 돈(매출)", pickRow(/^Total Revenue$/i)),
      buildRow("남긴 돈(영업이익)", pickRow(/^Operating Income$/i)),
      buildRow("최종 이익(순이익)", pickRow(/^Net Income$/i)),
    ].filter((row): row is NonNullable<typeof row> => row !== null);
    if (periods.length >= 2 && rows.length > 0) {
      financials = { periods, rows: rows.slice(0, 2), note: "출처: Nasdaq 연간 실적(단위 축약)" };
    }
  }

  if (!marketCap && metrics.length === 0 && !financials) return null;
  return {
    name,
    ...(market ? { market } : {}),
    ...(marketCap ? { marketCap } : {}),
    ...(sector ? { sector } : {}),
    metrics,
    ...(financials ? { financials } : {}),
  };
}

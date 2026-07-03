import { Prisma } from "@prisma/client";
import type { DailyOhlcv } from "@fomo/core";
import { prisma } from "./prisma";
import { fetchWhale } from "./fomo-market-sources";

/**
 * 코인 시세·캔들 수집 (WO Phase C) — Upbit 공개 API(KRW 마켓, 무키).
 *
 * 크론 프리웜 전용: fetchUpbitCoinSnapshots() 는 크론에서만 호출해 캐시에 쓰고,
 * 요청 경로는 readCoinMarketSnapshots() 로 캐시만 읽는다(요청 경로 외부 fetch 0 — 504 원칙).
 *
 * 잡코인 방어선: 유의 지정(market_event.warning) 제외 + 일 거래대금 하한.
 * 발굴과 잡코인 러시는 다르다 — 유동성 없는 마켓은 유니버스에 넣지 않는다.
 */

const UPBIT_MARKET_ALL_URL = "https://api.upbit.com/v1/market/all?isDetails=true";
const UPBIT_TICKER_URL = "https://api.upbit.com/v1/ticker";
const UPBIT_DAILY_CANDLES_URL = "https://api.upbit.com/v1/candles/days";
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";

/** 잡코인 방어선 — 24h 거래대금 하한(KRW). 미달 마켓은 발굴 유니버스 제외. */
const MIN_TRADE_PRICE_24H_KRW = 3_000_000_000; // 30억
/** 유니버스 상한 — 거래대금 상위 N 마켓만 캔들 수집(비용·집중). */
const COIN_UNIVERSE_LIMIT = 60;
/** 일봉 목표 개수(WO: 260) — Upbit 1회 최대 200이라 2회 페이지네이션. */
const COIN_CANDLE_TARGET = 260;
/** Upbit quotation 그룹 rate limit ~10 req/s — 동시 2 + 요청당 페이스로 ~4 req/s 유지(429 방지). */
const CANDLE_CONCURRENCY = 2;
const CANDLE_PAUSE_MS = 250;
const FETCH_TIMEOUT_MS = 10_000;
const COIN_CACHE_MAX_AGE_HOURS = 26; // 시간당 크론 + 여유

/** 캐시에 저장되는 코인 스냅샷 — 캔들·거래대금 시리즈 포함(요청 경로는 이것만 읽음). */
export interface CoinMarketSnapshot {
  /** Upbit 마켓 코드 — 예 "KRW-BTC". */
  market: string;
  /** 심볼 — 예 "BTC". */
  symbol: string;
  koreanName: string;
  englishName: string;
  /** 현재가(KRW). */
  price: number;
  /** 전일 대비 등락률(%). */
  changePct: number;
  /** 24h 누적 거래대금(KRW). */
  accTradePrice24h: number;
  /** KRW 마켓 내 24h 거래대금 순위(1=최대). 메이저 감점·유동성 참고. */
  tradeValueRank: number;
  /** 일봉(과거→최신). verdict·TA 엔진 공급용. */
  candles: DailyOhlcv[];
  /** 일봉과 정렬된 일별 거래대금(KRW) — 거래대금 이상·진공 신호용. */
  tradeValues: number[];
  /** CoinGecko 전고점 대비(%) — 크론 시점 fetchWhale 로 채움(top 코인만). */
  athChangePct?: number;
  /** 수집 시각(ISO). */
  fetchedAt: string;
}

interface UpbitMarketInfo {
  market: string;
  korean_name: string;
  english_name: string;
  market_event?: { warning?: boolean };
  market_warning?: string;
}

interface UpbitTicker {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
}

interface UpbitDayCandle {
  candle_date_time_utc: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
}

async function fetchJson<T>(url: string, retryOn429 = true): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: controller.signal });
    if (res.status === 429 && retryOn429) {
      clearTimeout(timer);
      await sleep(700); // rate limit — 한 번 물러났다 재시도
      return fetchJson<T>(url, false);
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size) as T[]);
  return out;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/** KRW 마켓 목록 — 유의 지정(warning) 제외. */
async function fetchKrwMarkets(): Promise<UpbitMarketInfo[]> {
  const all = await fetchJson<UpbitMarketInfo[]>(UPBIT_MARKET_ALL_URL);
  if (!Array.isArray(all)) return [];
  return all.filter(
    (m) =>
      m.market?.startsWith("KRW-") &&
      m.market_event?.warning !== true &&
      m.market_warning !== "CAUTION"
  );
}

async function fetchTickers(markets: readonly string[]): Promise<Map<string, UpbitTicker>> {
  const out = new Map<string, UpbitTicker>();
  for (const batch of chunks(markets, 100)) {
    const url = `${UPBIT_TICKER_URL}?markets=${encodeURIComponent(batch.join(","))}`;
    const tickers = await fetchJson<UpbitTicker[]>(url);
    if (Array.isArray(tickers)) for (const t of tickers) out.set(t.market, t);
    await sleep(CANDLE_PAUSE_MS);
  }
  return out;
}

/** 일봉 260개 — count 최대 200이라 to 파라미터로 2회 페이지네이션(최신→과거 응답을 과거→최신으로 뒤집음). */
async function fetchDailyCandles(market: string, target = COIN_CANDLE_TARGET): Promise<UpbitDayCandle[]> {
  const first = await fetchJson<UpbitDayCandle[]>(`${UPBIT_DAILY_CANDLES_URL}?market=${encodeURIComponent(market)}&count=200`);
  await sleep(CANDLE_PAUSE_MS); // rate limit 페이스 유지(요청당)
  if (!Array.isArray(first) || first.length === 0) return [];
  let rows = [...first];
  const remaining = target - rows.length;
  if (remaining > 0 && rows.length === 200) {
    const oldest = rows[rows.length - 1]!.candle_date_time_utc;
    const more = await fetchJson<UpbitDayCandle[]>(
      `${UPBIT_DAILY_CANDLES_URL}?market=${encodeURIComponent(market)}&count=${Math.min(200, remaining)}&to=${encodeURIComponent(`${oldest}Z`)}`
    );
    await sleep(CANDLE_PAUSE_MS);
    if (Array.isArray(more)) rows = [...rows, ...more];
  }
  return rows.reverse(); // 과거→최신
}

function toOhlcv(candle: UpbitDayCandle): DailyOhlcv {
  return {
    date: candle.candle_date_time_utc.slice(0, 10),
    open: candle.opening_price,
    high: candle.high_price,
    low: candle.low_price,
    close: candle.trade_price,
    volume: candle.candle_acc_trade_volume,
  };
}

/**
 * 크론 전용 — Upbit 유니버스 수집(유의 제외·거래대금 하한·상위 N) + 캔들 260 + CoinGecko 전고점 보강.
 * 요청 경로에서 절대 호출 금지.
 */
export async function fetchUpbitCoinSnapshots(): Promise<CoinMarketSnapshot[]> {
  const markets = await fetchKrwMarkets();
  if (markets.length === 0) return [];
  const tickers = await fetchTickers(markets.map((m) => m.market));

  const liquid = markets
    .map((m) => ({ info: m, ticker: tickers.get(m.market) }))
    .filter((x): x is { info: UpbitMarketInfo; ticker: UpbitTicker } => !!x.ticker)
    .filter((x) => x.ticker.acc_trade_price_24h >= MIN_TRADE_PRICE_24H_KRW)
    .sort((a, b) => b.ticker.acc_trade_price_24h - a.ticker.acc_trade_price_24h)
    .slice(0, COIN_UNIVERSE_LIMIT);

  // 전고점 대비(CoinGecko fetchWhale) — 크론 시점에 한 번만. 실패해도 파이프라인 정상(fail-open).
  const whale = await fetchWhale().catch(() => ({ marketCapChange24h: null, coins: [] }));
  const athBySymbol = new Map<string, number>();
  for (const coin of whale.coins ?? []) {
    if (coin.symbol && typeof coin.athChange === "number") athBySymbol.set(coin.symbol.toUpperCase(), coin.athChange);
  }

  const fetchedAt = new Date().toISOString();
  const snapshots = await mapLimit(liquid, CANDLE_CONCURRENCY, async (entry): Promise<CoinMarketSnapshot | null> => {
    const raw = await fetchDailyCandles(entry.info.market).catch((): UpbitDayCandle[] => []);
    if (raw.length < 30) return null; // verdict 최소 캔들 미달 마켓 제외
    const symbol = entry.info.market.replace(/^KRW-/, "");
    const ath = athBySymbol.get(symbol.toUpperCase());
    return {
      market: entry.info.market,
      symbol,
      koreanName: entry.info.korean_name,
      englishName: entry.info.english_name,
      price: entry.ticker.trade_price,
      changePct: entry.ticker.signed_change_rate * 100,
      accTradePrice24h: entry.ticker.acc_trade_price_24h,
      tradeValueRank: 0, // 아래에서 채움
      candles: raw.map(toOhlcv),
      tradeValues: raw.map((c) => c.candle_acc_trade_price),
      ...(typeof ath === "number" ? { athChangePct: ath } : {}),
      fetchedAt,
    };
  });

  const valid = snapshots.filter((s): s is CoinMarketSnapshot => s !== null);
  valid.sort((a, b) => b.accTradePrice24h - a.accTradePrice24h);
  valid.forEach((s, i) => {
    s.tradeValueRank = i + 1;
  });
  return valid;
}

// ── 캐시 (UsMarketQuoteCache 패턴 미러) ─────────────────────────────────────

let ensured = false;

async function ensureCoinMarketCacheTable(): Promise<void> {
  if (ensured) return;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "CoinMarketCache" (
      "market" TEXT PRIMARY KEY,
      "row" JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CoinMarketCache_updatedAt_idx"
    ON "CoinMarketCache" ("updatedAt" DESC)
  `;
  ensured = true;
}

function isCoinSnapshot(value: unknown): value is CoinMarketSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CoinMarketSnapshot>;
  return (
    typeof row.market === "string" &&
    row.market.startsWith("KRW-") &&
    typeof row.price === "number" &&
    Array.isArray(row.candles) &&
    row.candles.length >= 30
  );
}

export interface CoinMarketCacheStats {
  rows: number;
  rowsWithCandles: number;
}

export async function writeCoinMarketSnapshots(snapshots: readonly CoinMarketSnapshot[]): Promise<CoinMarketCacheStats> {
  await ensureCoinMarketCacheTable();
  let written = 0;
  for (const snapshot of snapshots) {
    if (!isCoinSnapshot(snapshot)) continue;
    await prisma.$executeRaw`
      INSERT INTO "CoinMarketCache" ("market", "row", "updatedAt")
      VALUES (${snapshot.market}, ${JSON.stringify(snapshot)}::jsonb, NOW())
      ON CONFLICT ("market") DO UPDATE
      SET "row" = EXCLUDED."row", "updatedAt" = NOW()
    `;
    written += 1;
  }
  return { rows: written, rowsWithCandles: snapshots.filter((s) => s.candles.length >= 30).length };
}

/** 요청 경로 전용 — 캐시만 읽는다(외부 fetch 0). 캐시 없음/만료 시 빈 배열(fail-open). */
export async function readCoinMarketSnapshots(maxAgeHours = COIN_CACHE_MAX_AGE_HOURS): Promise<CoinMarketSnapshot[]> {
  const since = new Date(Date.now() - Math.max(1, Math.min(72, maxAgeHours)) * 60 * 60 * 1000);
  try {
    const records = await prisma.$queryRaw<Array<{ market: string; row: unknown }>>`
      SELECT "market", "row"
      FROM "CoinMarketCache"
      WHERE "updatedAt" >= ${since}
      ORDER BY COALESCE(("row"->>'tradeValueRank')::int, 9999) ASC
    `;
    return records.map((record) => record.row).filter(isCoinSnapshot);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return [];
    return [];
  }
}

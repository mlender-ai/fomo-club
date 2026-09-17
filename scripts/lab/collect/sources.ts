/**
 * LAB-03 — 외부 소스 어댑터. 여기만 네트워크를 안다.
 *
 * 규칙 둘:
 *  1. **시각은 전부 UTC `Date` 로 돌려준다**(하지 말 것 4 — 로컬 기준 저장 금지).
 *  2. 응답 모양이 예상과 다르면 **던진다.** 조용히 빈 배열을 돌려주면
 *     "수집했는데 0건" 과 "소스가 바뀌었다" 를 구분할 수 없다.
 */
import { BINANCE_INTERVAL, type IntervalKey } from "./config";

const BINANCE_SPOT = "https://api.binance.com";
const BINANCE_FAPI = "https://fapi.binance.com";
const HYPERLIQUID_INFO = "https://api.hyperliquid.xyz/info";
const HYPERLIQUID_LEADERBOARD = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";

/** Binance klines 한 번 호출 상한. */
const KLINE_PAGE = 1000;

export interface RawCandle {
  at: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} → ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

function num(value: unknown, where: string): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) throw new Error(`${where}: 숫자가 아니다 — ${JSON.stringify(value)}`);
  return n;
}

/**
 * 봉을 오래된 것 → 최신 순으로 가져온다. `from` 이상 `to` 이하.
 *
 * Binance 는 한 번에 1000개까지라 앞으로 전진하며 페이지를 넘긴다.
 * **마지막 봉은 아직 닫히지 않았을 수 있다** — 호출자가 잘라낸다.
 */
export async function fetchBinanceCandles(
  pair: string,
  interval: IntervalKey,
  from: Date,
  to: Date
): Promise<RawCandle[]> {
  const out: RawCandle[] = [];
  let cursor = from.getTime();
  const end = to.getTime();

  while (cursor <= end) {
    const url =
      `${BINANCE_SPOT}/api/v3/klines?symbol=${pair}` +
      `&interval=${BINANCE_INTERVAL[interval]}&startTime=${cursor}&endTime=${end}&limit=${KLINE_PAGE}`;
    const rows = await getJson(url);
    if (!Array.isArray(rows)) throw new Error(`binance klines ${pair}: 배열이 아니다`);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!Array.isArray(row)) throw new Error(`binance klines ${pair}: 봉이 배열이 아니다`);
      out.push({
        at: new Date(num(row[0], `${pair} openTime`)),
        open: num(row[1], `${pair} open`),
        high: num(row[2], `${pair} high`),
        low: num(row[3], `${pair} low`),
        close: num(row[4], `${pair} close`),
        volume: num(row[5], `${pair} volume`),
      });
    }

    const last = out[out.length - 1];
    if (!last) break;
    const next = last.at.getTime() + 1;
    if (next <= cursor) break; // 전진하지 않으면 무한 루프다
    cursor = next;
    if (rows.length < KLINE_PAGE) break;
  }

  return out;
}

/** 현재가. PART B-1 "최신 가격만". */
export async function fetchBinancePrices(
  pairs: readonly string[]
): Promise<Map<string, { price: number; at: Date }>> {
  const symbols = encodeURIComponent(JSON.stringify([...pairs]));
  const rows = await getJson(`${BINANCE_SPOT}/api/v3/ticker/price?symbols=${symbols}`);
  if (!Array.isArray(rows)) throw new Error("binance ticker: 배열이 아니다");
  const at = new Date();
  const out = new Map<string, { price: number; at: Date }>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const symbol = typeof r.symbol === "string" ? r.symbol : null;
    if (!symbol) continue;
    out.set(symbol, { price: num(r.price, `${symbol} price`), at });
  }
  if (out.size !== pairs.length) {
    throw new Error(`binance ticker: ${pairs.length}개 요청했는데 ${out.size}개 왔다`);
  }
  return out;
}

export interface RawFunding {
  at: Date;
  rate: number;
}

/** 펀딩비 이력. 8시간 주기. 무기한 선물이면 필수 — 빼면 수익률이 부풀려진다. */
export async function fetchBinanceFunding(
  perp: string,
  from: Date,
  to: Date
): Promise<RawFunding[]> {
  const out: RawFunding[] = [];
  let cursor = from.getTime();
  const end = to.getTime();

  while (cursor <= end) {
    const url =
      `${BINANCE_FAPI}/fapi/v1/fundingRate?symbol=${perp}` +
      `&startTime=${cursor}&endTime=${end}&limit=1000`;
    const rows = await getJson(url);
    if (!Array.isArray(rows)) throw new Error(`binance funding ${perp}: 배열이 아니다`);
    if (rows.length === 0) break;

    for (const row of rows) {
      const r = row as Record<string, unknown>;
      out.push({
        at: new Date(num(r.fundingTime, `${perp} fundingTime`)),
        rate: num(r.fundingRate, `${perp} fundingRate`),
      });
    }

    const last = out[out.length - 1];
    if (!last) break;
    const next = last.at.getTime() + 1;
    if (next <= cursor) break;
    cursor = next;
    if (rows.length < 1000) break;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hyperliquid — 고래 (PART C · FCE 이식)
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaderboardRow {
  address: string;
  accountValue: number;
}

/**
 * 리더보드에서 지갑 후보를 읽는다.
 *
 * **성과(pnl·roi)로 고르지 않는다.** FCE `c0e4805` 가 고친 결함이다 — 성과로 뽑으면
 * 생존 편향이 들어가 고래 신호가 "이미 이긴 사람" 쪽으로 기운다. 계좌 규모(`accountValue`)만 본다.
 */
export async function fetchHyperliquidLeaderboard(): Promise<LeaderboardRow[]> {
  const payload = await getJson(HYPERLIQUID_LEADERBOARD, {
    headers: { Accept: "application/json" },
  });
  if (typeof payload !== "object" || payload === null) {
    throw new Error("hyperliquid leaderboard: 객체가 아니다");
  }
  const rows = (payload as Record<string, unknown>).leaderboardRows;
  if (!Array.isArray(rows)) throw new Error("hyperliquid leaderboard: leaderboardRows 가 없다");

  const out: LeaderboardRow[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const address = typeof r.ethAddress === "string" ? r.ethAddress.toLowerCase() : null;
    if (!address || !/^0x[0-9a-f]{40}$/.test(address)) continue;
    out.push({ address, accountValue: num(r.accountValue, `${address} accountValue`) });
  }
  if (out.length === 0) throw new Error("hyperliquid leaderboard: 쓸 수 있는 행이 0개다");
  return out;
}

export interface WhaleSnapshot {
  address: string;
  symbol: string;
  side: "LONG" | "SHORT";
  /** 명목 규모(USD). 절대값이다 — 방향은 `side` 가 진다. */
  sizeUsd: number;
}

/** 한 지갑의 현재 포지션. `clearinghouseState` — 읽기 전용, 키 없음. */
export async function fetchHyperliquidPositions(address: string): Promise<WhaleSnapshot[]> {
  const payload = await getJson(HYPERLIQUID_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "clearinghouseState", user: address }),
  });
  if (typeof payload !== "object" || payload === null) return [];
  const positions = (payload as Record<string, unknown>).assetPositions;
  if (!Array.isArray(positions)) return [];

  const out: WhaleSnapshot[] = [];
  for (const entry of positions) {
    if (typeof entry !== "object" || entry === null) continue;
    const position = (entry as Record<string, unknown>).position;
    if (typeof position !== "object" || position === null) continue;
    const p = position as Record<string, unknown>;
    const coin = typeof p.coin === "string" ? p.coin.toUpperCase() : null;
    if (!coin) continue;
    // szi 는 부호 있는 수량 — 음수면 숏이다.
    const szi = num(p.szi, `${address} ${coin} szi`);
    if (szi === 0) continue;
    const notional = Math.abs(num(p.positionValue ?? 0, `${address} ${coin} positionValue`));
    out.push({
      address: address.toLowerCase(),
      symbol: coin,
      side: szi > 0 ? "LONG" : "SHORT",
      sizeUsd: notional,
    });
  }
  return out;
}

// ── 주식 (LAB-09 PART C) ────────────────────────────────────────────────────

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

/**
 * 야후 일봉. **액면분할은 이미 반영돼 있다** — 2018-05-04 삼성전자 50:1 을 실측으로 확인했다
 * (분할 전 종가가 52,140 으로 돌아온다. 당시 실제 호가는 260만원대였다).
 *
 * ## 배당은 반영하지 않는다
 *
 * `adjclose`(배당까지 반영)가 같이 오지만 **쓰지 않는다.** 손절선과 갭은 **실제로 거래된
 * 가격**에서 판정해야 한다 — 배당 보정가는 그 시점에 아무도 못 본 가격이다.
 *
 * 대신 수익률이 배당수익률만큼 **낮게** 나온다(코스피 약 2%/년). 틀리는 방향이 보수적이라
 * 이쪽을 골랐다. 지수 벤치마크도 배당이 빠진 가격지수라 **같은 기준**이다.
 *
 * 시각은 거래일 00:00 UTC 로 정규화한다 — 야후가 주는 타임스탬프는 장 시작 시각(KST 09:00)
 * 이라 그대로 두면 한국 거래일이 UTC 로 하루 당겨지거나 밀린다.
 */
export async function fetchYahooDaily(symbol: string, from: Date, to: Date): Promise<RawCandle[]> {
  const url =
    `${YAHOO_CHART}/${encodeURIComponent(symbol)}` +
    `?interval=1d&period1=${Math.floor(from.getTime() / 1000)}&period2=${Math.floor(to.getTime() / 1000)}`;
  const body = (await getJson(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; strategy-lab/1.0)" },
  })) as {
    chart?: { result?: unknown[]; error?: { description?: string } | null };
  };

  if (body.chart?.error) {
    throw new Error(`yahoo ${symbol}: ${body.chart.error.description ?? "error"}`);
  }
  const result = body.chart?.result?.[0] as
    | {
        timestamp?: number[];
        meta?: { exchangeTimezoneName?: string };
        indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
      }
    | undefined;
  if (!result) throw new Error(`yahoo ${symbol}: result 가 없다 — 응답 모양이 바뀌었다`);

  const stamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) {
    // 상장 전 구간을 요청하면 timestamp 자체가 없다. 그건 오류가 아니라 **없는 것**이다.
    if (stamps.length === 0) return [];
    throw new Error(`yahoo ${symbol}: quote 가 없다`);
  }

  const out: RawCandle[] = [];
  for (let i = 0; i < stamps.length; i += 1) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const stamp = stamps[i];
    // **빠진 봉을 앞 값으로 메우지 않는다.** 야후는 거래정지일에 null 을 준다 —
    // 그 자리는 봉이 없는 것이고, 없는 채로 둬야 `DataGap` 이 보인다.
    if (stamp === undefined || o == null || h == null || l == null || c == null) continue;
    out.push({
      at: tradingDayUtc(stamp),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: quote.volume?.[i] ?? 0,
    });
  }
  return out;
}

/**
 * 거래일을 **그 거래소의 달력 날짜 00:00 UTC** 로 만든다.
 *
 * 야후 타임스탬프는 장 시작 시각이다(한국 09:00 KST = 00:00 UTC, 미국 09:30 ET = 13:30/14:30 UTC).
 * UTC 로 그냥 자르면 미국 장은 같은 날로 떨어지지만 한국 장은 **경계에 걸린다** —
 * 서머타임·거래일 변경 때 하루가 밀린다. 그래서 정오를 기준으로 반올림한다.
 */
function tradingDayUtc(epochSeconds: number): Date {
  const ms = epochSeconds * 1000;
  // 장 시작 이후 12시간 안쪽은 같은 거래일이다. 그 시각을 UTC 날짜로 잘라낸다.
  const shifted = new Date(ms + 6 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

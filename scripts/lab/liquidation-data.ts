/**
 * 청산 재채점 재료 (ENG-01 PART D) — Bitget 공개 API · 파일 캐시.
 *
 * | 무엇 | 어디 | 캐시 |
 * |---|---|---|
 * | 거래 기간 봉 | `/api/v2/mix/market/history-candles` (거래 timeframe) | 거래마다 영구 — 닫힌 거래는 안 바뀐다 |
 * | 펀딩 이력 | `/api/v2/mix/market/history-fund-rate` | 심볼마다 6시간 |
 * | 유지증거금 단계 | `/api/v2/mix/market/query-position-lever` | 심볼마다 24시간 |
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Bar, FundingPoint, MarginTier, RescoreTrade } from "../../apps/web/lib/lab/liquidation";

const API = "https://api.bitget.com/api/v2/mix/market";
const CACHE = join(process.env.FCE_CACHE_DIR ?? "/tmp/fce-upload-cache", "rescore");
const HOUR = 3_600_000;
const GRANULARITY: Record<string, string> = { "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };
const STEP: Record<string, number> = { "15m": 15 * 60_000, "1h": HOUR, "4h": 4 * HOUR, "1d": 24 * HOUR };

function cached<T>(name: string, maxAgeMs: number | null): T | null {
  try {
    const saved = JSON.parse(readFileSync(join(CACHE, name), "utf8")) as { at: number; value: T };
    if (maxAgeMs === null || Date.now() - saved.at < maxAgeMs) return saved.value;
  } catch {
    // 없음
  }
  return null;
}
function save<T>(name: string, value: T): T {
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, name), JSON.stringify({ at: Date.now(), value }));
  return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

/**
 * Bitget 공개 API — **초당 몇 번으로 줄여 부르고, 한도(429)면 기다렸다 다시.** 처음엔 그냥 불렀다가 45건이
 * `Too Many Requests` 로 빠졌다 — 데이터가 없는 게 아니었다.
 */
async function get(path: string): Promise<unknown[]> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const wait = last + 120 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(15_000) });
    const body = (await res.json().catch(() => ({}))) as { code?: string; data?: unknown[]; msg?: string };
    if (body.code === "00000") return body.data ?? [];
    if (res.status === 429 || /too many/i.test(body.msg ?? "")) {
      await sleep(1_000 * 2 ** attempt);
      continue;
    }
    throw new Error(`Bitget ${path.split("?")[0]} ${body.msg ?? res.status}`);
  }
  throw new Error(`Bitget ${path.split("?")[0]} 한도 — 6번 기다려도 안 풀렸다`);
}

export async function tradeBars(t: RescoreTrade, timeframe: string): Promise<Bar[]> {
  const name = `bars-${t.id}.json`;
  const hit = cached<Bar[]>(name, null);
  if (hit) return hit;
  const step = STEP[timeframe] ?? 4 * HOUR;
  const from = t.entryAt - step;
  const to = t.exitAt + step;
  const out: Bar[] = [];
  // 200개씩 뒤에서 앞으로 — 거래 대부분은 한 번에 들어온다.
  let end = to;
  for (let i = 0; i < 10 && end > from; i += 1) {
    const rows = await get(
      `/history-candles?symbol=${t.symbol}&productType=USDT-FUTURES&granularity=${GRANULARITY[timeframe] ?? "4H"}&startTime=${from}&endTime=${end}&limit=200`
    );
    const bars = rows.map((r) => (r as string[]).slice(0, 5).map(Number) as Bar).filter((b) => b.every(Number.isFinite));
    if (bars.length === 0) break;
    out.push(...bars);
    const oldest = Math.min(...bars.map((b) => b[0]));
    if (oldest <= from) break;
    end = oldest - 1;
  }
  const uniq = [...new Map(out.map((b) => [b[0], b])).values()].sort((a, b) => a[0] - b[0]);
  // 비어 있으면 저장하지 않는다 — 다음에 다시 받는다(일시 장애일 수 있다).
  return uniq.length ? save(name, uniq) : uniq;
}

export async function fundingHistory(symbol: string, since: number): Promise<FundingPoint[]> {
  const name = `funding-${symbol}.json`;
  const hit = cached<FundingPoint[]>(name, 6 * HOUR);
  if (hit && (hit[0]?.at ?? Infinity) <= since) return hit;
  const out: FundingPoint[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const rows = (await get(`/history-fund-rate?symbol=${symbol}&productType=USDT-FUTURES&pageSize=100&pageNo=${page}`)) as {
      fundingRate: string;
      fundingTime: string;
    }[];
    if (rows.length === 0) break;
    out.push(...rows.map((r) => ({ at: Number(r.fundingTime), rate: Number(r.fundingRate) })).filter((f) => Number.isFinite(f.at) && Number.isFinite(f.rate)));
    if (Math.min(...rows.map((r) => Number(r.fundingTime))) <= since) break;
  }
  return save(name, [...new Map(out.map((f) => [f.at, f])).values()].sort((a, b) => a.at - b.at));
}

export async function marginTiers(symbol: string): Promise<MarginTier[]> {
  const name = `tiers-${symbol}.json`;
  const hit = cached<MarginTier[]>(name, 24 * HOUR);
  if (hit) return hit;
  const rows = (await get(`/query-position-lever?symbol=${symbol}&productType=USDT-FUTURES`)) as Record<string, string>[];
  return save(
    name,
    rows.map((r) => ({ startUnit: Number(r.startUnit), endUnit: Number(r.endUnit), keepMarginRate: Number(r.keepMarginRate) }))
  );
}

/** FCE 거래 한 건(`/api/paper/trades` · `/api/onchain/follow/trades`) → 재채점 입력. 닫힌 거래만. */
export function toRescoreTrade(raw: Record<string, unknown>, trackKey: string): (RescoreTrade & { timeframe: string }) | null {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const ts = (v: unknown) => (typeof v === "string" ? Date.parse(v) : NaN);
  const entryAt = ts(raw.entry_at);
  const exitAt = ts(raw.exit_at);
  const entry = n(raw.entry_price);
  const exit = n(raw.exit_price);
  const qty = n(raw.quantity);
  const margin = n(raw.margin_usdt);
  if (!Number.isFinite(entryAt) || !Number.isFinite(exitAt) || entry === null || exit === null || qty === null || margin === null) return null;
  return {
    id: String(raw.id),
    trackKey,
    symbol: String(raw.symbol ?? "").toUpperCase(),
    direction: String(raw.direction ?? "long"),
    leverage: n(raw.leverage) ?? 3,
    marginUsdt: margin,
    quantity: qty,
    entryPrice: entry,
    entryAt,
    exitAt,
    exitPrice: exit,
    exitReason: typeof raw.exit_reason === "string" ? raw.exit_reason : null,
    invalidationPrice: n(raw.invalidation_price),
    partialExitAt: typeof raw.partial_exit_at === "string" ? Date.parse(raw.partial_exit_at) : null,
    partialExitPrice: n(raw.partial_exit_price),
    partialExitQuantity: n(raw.partial_exit_quantity) ?? 0,
    costsUsdt: n(raw.costs_usdt) ?? 0,
    netPnlUsdt: n(raw.net_pnl_usdt) ?? 0,
    timeframe: typeof raw.timeframe === "string" ? raw.timeframe : "4h",
  };
}

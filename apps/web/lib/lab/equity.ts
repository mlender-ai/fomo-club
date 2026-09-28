/**
 * 평가 자산 (OPS-03 PART D) — 순수 함수.
 *
 * ```
 * 실현 자산 = 시작 자본 + 실현 손익              ← FCE 규칙 · Hero · 수익률 (바꾸지 않는다)
 * 평가 자산 = 시작 자본 + 실현 손익 + 미실현 손익   ← 지금 청산하면 얼마
 * ```
 *
 * **둘을 섞지 않는다.** 실현은 확정이고 평가는 가정이다. Hero 는 실현 그대로 두고, 평가는 그 아래 한 줄과
 * 차트의 옅은 선으로만 낸다.
 *
 * ## 미실현은 어디서
 *
 * - 크립토 · 고래 포지션 — FCE 가 업로드 때 낸 `unrealizedUsdt`(비용 반영) 에 **그 뒤 가격 움직임만** 더한다:
 *   `+ 수량 × (지금가 − FCE 표시가) × 방향`. 비용 계산을 랩이 다시 하지 않는다
 * - 그 밖의 트랙(주식 등) — FCE 가 낸 트랙 `unrealized` 그대로(15분 주기)
 *
 * 환산은 Overview 와 같다 — 트랙당 $10,000 × (자산 ÷ 시작 자본).
 */
import { TRACK_BASE_USD } from "./portfolio";

export interface EquityTrack {
  key: string;
  startingCapital: number;
  currentCapital: number | null;
  unrealized: number | null;
}

export interface EquityPosition {
  trackKey: string;
  symbol: string;
  direction: string;
  quantity: number | null;
  markPrice: number | null;
  unrealizedUsdt: number | null;
}

export interface EquityTrackValue {
  key: string;
  realized: number;
  marked: number;
  /** 원래 통화의 미실현. */
  unrealizedNative: number;
  /** 원래 통화의 평가 자산(실현 + 미실현). 포지션 탭 `오늘` 이 이걸 뺀다 — 환산값과 섞지 않으려고. */
  markedNative: number;
}

export interface Equity {
  /** 환산 합 — Hero 와 같은 값. */
  realized: number;
  /** 환산 합 — 미실현 포함. */
  marked: number;
  tracks: EquityTrackValue[];
  /** 지금가를 못 받아 FCE 표시가로 둔 포지션 수. */
  stalePrices: number;
}

const side = (d: string) => (d === "short" || d === "SHORT" ? -1 : 1);

export function equityOf(tracks: EquityTrack[], positions: EquityPosition[], prices: Map<string, number>): Equity {
  let stalePrices = 0;
  const livePnl = new Map<string, number>();
  for (const p of positions) {
    const live = prices.get(p.symbol.toUpperCase());
    let pnl = p.unrealizedUsdt ?? 0;
    if (live !== undefined && p.quantity !== null && p.markPrice !== null) pnl += p.quantity * (live - p.markPrice) * side(p.direction);
    else stalePrices += 1;
    livePnl.set(p.trackKey, (livePnl.get(p.trackKey) ?? 0) + pnl);
  }
  const out: EquityTrackValue[] = [];
  for (const t of tracks) {
    if (t.currentCapital === null || !Number.isFinite(t.currentCapital) || !(t.startingCapital > 0)) continue;
    const unrealized = livePnl.has(t.key) ? (livePnl.get(t.key) as number) : t.unrealized ?? 0;
    out.push({
      key: t.key,
      realized: (TRACK_BASE_USD * t.currentCapital) / t.startingCapital,
      marked: (TRACK_BASE_USD * (t.currentCapital + unrealized)) / t.startingCapital,
      unrealizedNative: unrealized,
      markedNative: t.currentCapital + unrealized,
    });
  }
  return {
    realized: out.reduce((s, t) => s + t.realized, 0),
    marked: out.reduce((s, t) => s + t.marked, 0),
    tracks: out,
    stalePrices,
  };
}

/** Bitget USDT 선물 전 종목 시세 — 한 번 호출. 못 받으면 빈 맵(FCE 표시가로 둔다). */
export async function bitgetPrices(fetcher: typeof fetch = fetch): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const res = await fetcher("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return out;
    const body = (await res.json()) as { data?: { symbol?: string; lastPr?: string }[] };
    for (const row of body.data ?? []) {
      const price = Number(row.lastPr);
      if (row.symbol && Number.isFinite(price) && price > 0) out.set(row.symbol.toUpperCase(), price);
    }
  } catch {
    // 시세를 못 받으면 FCE 표시가로 — 지어내지 않는다.
  }
  return out;
}

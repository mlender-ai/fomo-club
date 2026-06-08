/**
 * Whale Heat 입력 매퍼 — 실측 크립토 신호(CoinGecko)를 WhaleEvent[] 로 변환(순수).
 *
 * docs/FOMO_INDEX.md Whale Heat = 대형 청산/급등/Short Squeeze 등 이벤트 가중.
 * CoinGecko 24h 변동률을 "이벤트"로 정직하게 환산한다(가짜 이벤트 생성 금지 — 실제 변동만).
 */

import type { WhaleEvent } from "./types";

export interface CryptoMover {
  /** 심볼/이름 (예: "BTC"). */
  symbol: string;
  /** 24시간 변동률(%). */
  change24h: number;
}

export interface CryptoSignals {
  coins: CryptoMover[];
  /** 글로벌 시총 24h 변동률(%). */
  marketCapChangePct?: number;
}

/** 변동 크기 → 이벤트 가중치(정직: 실제 변동률 기반). |Δ|<8% 는 이벤트 아님. */
function weightFor(absChange: number): number {
  if (absChange >= 15) return 3;
  if (absChange >= 8) return 2;
  return 0;
}

/**
 * 실측 크립토 변동 → WhaleEvent[]. 큰 변동(±8%↑)만 이벤트로 잡는다.
 * BTC 는 대표성으로 +1 가중. 글로벌 시총 급변(±5%↑)도 1건.
 */
export function whaleEventsFromCrypto(signals: CryptoSignals): WhaleEvent[] {
  const events: WhaleEvent[] = [];
  for (const c of signals.coins ?? []) {
    if (!Number.isFinite(c.change24h)) continue;
    const abs = Math.abs(c.change24h);
    let w = weightFor(abs);
    if (w === 0) continue;
    if (c.symbol.toUpperCase() === "BTC") w += 1; // 대표 자산 가중
    const dir = c.change24h > 0 ? "급등" : "급락";
    events.push({ weight: w, label: `${c.symbol} 24h ${dir} ${c.change24h.toFixed(1)}%` });
  }
  const mc = signals.marketCapChangePct;
  if (typeof mc === "number" && Number.isFinite(mc) && Math.abs(mc) >= 5) {
    events.push({ weight: 2, label: `크립토 시총 24h ${mc > 0 ? "급등" : "급락"} ${mc.toFixed(1)}%` });
  }
  return events;
}

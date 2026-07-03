import { computeCardVerdict, computeFomoScore, isFrontHookSafe } from "@fomo/core";
import type { CardFrontSignals } from "@fomo/core";
import { kstDate } from "./fomo";
import { readCoinMarketSnapshots, type CoinMarketSnapshot } from "./coin-market-source";
import type { DiscoveryFrontSeed, DiscoveryResponse, DiscoveryStockPayload } from "./discovery-supply";

/**
 * 코인 발굴 (WO Phase C) — 캐시된 Upbit 스냅샷에서 신호 계산 → 표준 카드(바이오비쥬 포맷).
 *
 * 요청 경로 외부 fetch 0 (캐시만 읽음). 신호 없으면 0장(쿼터 강제 금지 — 정직).
 * 발굴 정체성: BTC·ETH 등 메이저는 marquee 감점으로 자연 탈락, 신호 강한 조용한 알트 우선.
 * 관측 서술만 — 매수·매도 판단/예측 없음(verdict 는 결정론 엔진의 관측 요약).
 */

/** 메이저(누구나 아는 대장) — marquee 지정 → daily-30 화제성 감점(+28). 발굴 대상 아님. */
const MAJOR_COIN_SYMBOLS = new Set([
  "BTC", "ETH", "XRP", "SOL", "DOGE", "ADA", "TRX", "USDT", "USDC", "BCH", "LINK", "AVAX", "XLM", "DOT",
]);

/** 발굴 신호 임계 — 24h 거래대금 / 직전 20일(완결 일봉) 평균. */
const VOLUME_ANOMALY_RATIO = 2.0;
/** 진공 후 유입: 직전 5일 평균이 30일 평균의 55% 미만(진공)이었는데 오늘 유입. */
const VACUUM_RATIO = 0.55;
const VACUUM_INFLOW_RATIO = 1.6;
/** 조용한 구간 — 등락률 절대값. */
const QUIET_CHANGE_PCT = 3;
/** 이미 달린 코인 제외 — 발굴은 "신호는 강한데 조용한" 자리. 급등 중 잡코인 러시는 발굴이 아니다. */
const ALREADY_MOVED_CHANGE_PCT = 12;
/** 카드 상한(신호 있어도 최대 N — quietScore 경쟁은 daily-30 이 함) */
const COIN_CARD_LIMIT = 8;

export interface CoinSignal {
  /** 24h 거래대금 / 직전 20일 평균. */
  volumeRatio: number;
  /** 진공(직전 5일 저조) 후 첫 유입 여부. */
  vacuumInflow: boolean;
  quiet: boolean;
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 마지막 캔들은 진행 중(부분 일봉)이라 신호 계산에서 제외 — 완결 일봉만 비교. */
export function computeCoinSignal(snapshot: CoinMarketSnapshot): CoinSignal | null {
  const full = snapshot.tradeValues.slice(0, -1); // 완결 일봉 거래대금
  if (full.length < 25) return null;
  const avg20 = average(full.slice(-20));
  if (!avg20 || avg20 <= 0) return null;
  const volumeRatio = snapshot.accTradePrice24h / avg20;
  const avg30 = average(full.slice(-30)) ?? avg20;
  const recent5 = average(full.slice(-6, -1)) ?? avg20;
  const vacuumInflow = recent5 < avg30 * VACUUM_RATIO && volumeRatio >= VACUUM_INFLOW_RATIO;
  return {
    volumeRatio,
    vacuumInflow,
    quiet: Math.abs(snapshot.changePct) < QUIET_CHANGE_PCT,
  };
}

export function hasDiscoverySignal(snapshot: CoinMarketSnapshot, signal: CoinSignal): boolean {
  if (Math.abs(snapshot.changePct) >= ALREADY_MOVED_CHANGE_PCT) return false; // 이미 달림 — 발굴 아님
  return signal.volumeRatio >= VOLUME_ANOMALY_RATIO || signal.vacuumInflow;
}

function krw(price: number): string {
  if (price >= 1000) return `${Math.round(price).toLocaleString("ko-KR")}원`;
  if (price >= 1) return `${price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
  return `${price.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}원`;
}

function eok(valueKrw: number): string {
  const eokValue = valueKrw / 1e8;
  if (eokValue >= 10_000) return `${(eokValue / 10_000).toFixed(1)}조`;
  return `${Math.round(eokValue).toLocaleString("ko-KR")}억`;
}

function ratioText(ratio: number): string {
  return ratio >= 10 ? `${Math.round(ratio)}배` : `${ratio.toFixed(1)}배`;
}

/** 관측 서술 헤드라인 — 사실+수치만. 예측·판단 없음. */
export function coinHeadline(snapshot: CoinMarketSnapshot, signal: CoinSignal): string {
  const parts: string[] = [];
  if (signal.vacuumInflow) {
    parts.push(`거래 진공 뒤 첫 유입 · 24시간 거래대금 평소 ${ratioText(signal.volumeRatio)}`);
  } else {
    parts.push(`24시간 거래대금 평소 ${ratioText(signal.volumeRatio)}`);
  }
  if (typeof snapshot.athChangePct === "number" && snapshot.athChangePct <= -30) {
    parts.push(`전고점 대비 ${Math.round(Math.abs(snapshot.athChangePct))}% 아래`);
  }
  if (signal.quiet) parts.push("아직 조용한 구간");
  return parts.join(" · ");
}

function coinFrontSeed(snapshot: CoinMarketSnapshot, signal: CoinSignal): DiscoveryFrontSeed {
  const changePct = Number(snapshot.changePct.toFixed(2));
  const volumeRatio = Number(signal.volumeRatio.toFixed(2));
  const signals: CardFrontSignals = { changePct, volumeRatio };
  const closes = snapshot.candles.map((c) => c.close);
  const changeDir: "up" | "down" | "flat" = snapshot.changePct > 0 ? "up" : snapshot.changePct < 0 ? "down" : "flat";
  return {
    signals,
    fomo: computeFomoScore({ changePct, volumeRatio, asOf: kstDate() }),
    sparkline: closes.slice(-30),
    priceText: krw(snapshot.price),
    changeText: `${snapshot.changePct > 0 ? "+" : ""}${snapshot.changePct.toFixed(2)}%`,
    changeDir,
    verdict: computeCardVerdict({
      candles: snapshot.candles,
      volumeRatio: signal.volumeRatio,
      currency: "KRW",
    }),
  };
}

function coinStockPayload(snapshot: CoinMarketSnapshot, signal: CoinSignal, headline: string): DiscoveryStockPayload {
  const marquee = MAJOR_COIN_SYMBOLS.has(snapshot.symbol.toUpperCase()) || snapshot.tradeValueRank <= 3;
  // 뎁스 보조(재무 블록 미해당) — 거래소·거래대금·순위 사실 표기. 시총은 소스에 없어 표기하지 않는다(지어내기 금지).
  const reason = `Upbit 원화마켓 · 24시간 거래대금 ${eok(snapshot.accTradePrice24h)} · 거래대금 ${snapshot.tradeValueRank}위`;
  return {
    canonical: snapshot.koreanName,
    market: "COIN",
    country: "GLOBAL",
    marquee,
    sector: "코인",
    symbol: snapshot.market,
    headline,
    whyShown: headline,
    reason,
    insightTag: signal.vacuumInflow ? "₿ 진공 후 유입" : "₿ 거래대금 이상",
    sourceLabel: "Upbit 일봉 · CoinGecko",
    sourceUrl: `https://upbit.com/exchange?code=CRIX.UPBIT.${snapshot.market}`,
  };
}

/**
 * 코인 발굴 응답 — daily-30 의 addStockCandidates 에 그대로 합류하는 DiscoveryResponse 형.
 * 캐시 비었거나 신호 없으면 stocks 0(정직) — 파이프라인은 정상.
 */
export async function buildCoinDiscoveryResponse(): Promise<DiscoveryResponse> {
  const snapshots = await readCoinMarketSnapshots().catch((): CoinMarketSnapshot[] => []);
  const stocks: DiscoveryStockPayload[] = [];
  const fronts: Record<string, DiscoveryFrontSeed> = {};

  const scored = snapshots
    .map((snapshot) => ({ snapshot, signal: computeCoinSignal(snapshot) }))
    .filter((x): x is { snapshot: CoinMarketSnapshot; signal: CoinSignal } => x.signal !== null && hasDiscoverySignal(x.snapshot, x.signal))
    .sort((a, b) => b.signal.volumeRatio - a.signal.volumeRatio)
    .slice(0, COIN_CARD_LIMIT);

  for (const { snapshot, signal } of scored) {
    const headline = coinHeadline(snapshot, signal);
    if (!isFrontHookSafe(headline)) continue; // 카피 가드 — 발굴 문구도 예외 없음
    const payload = coinStockPayload(snapshot, signal, headline);
    stocks.push(payload);
    fronts[payload.canonical] = coinFrontSeed(snapshot, signal);
  }

  return {
    asOf: kstDate(),
    stocks,
    fronts,
    confidence: stocks.length > 0 ? "H" : "L",
    source: "Upbit 일봉·거래대금 캐시 · CoinGecko",
  };
}

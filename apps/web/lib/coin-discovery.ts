import { computeCardVerdict, computeFomoScore, isFrontHookSafe } from "@fomo/core";
import type { CardFrontSignals } from "@fomo/core";
import { kstDate } from "./fomo";
import { readCoinMarketSnapshots, type CoinMarketSnapshot } from "./coin-market-source";
import type { DiscoveryFrontSeed, DiscoveryResponse, DiscoveryStockPayload } from "./discovery-supply";
import { buildChartSeries } from "./stock-front";

/**
 * 코인 카드 (WO 미장·코인 확충 — Phase C 알트 발굴 폐기, User Zero 결정) —
 * 코인은 발굴이 아니라 **커버리지**다. 유니버스 = 시총 상위 30 고정(소스에서 선정),
 * BTC·ETH 등 메이저도 신호 있으면 카드 OK(화제성 감점 없음). 그중 오늘 신호 있는 3~5장.
 *
 * 요청 경로 외부 fetch 0 (캐시만 읽음). 신호 없으면 0장(쿼터 강제 금지 — 정직).
 * 관측 서술만 — 매수·매도 판단/예측 없음(verdict 는 결정론 엔진의 관측 요약).
 */

/** 신호 임계 — 24h 거래대금 / 직전 20일(완결 일봉) 평균. 커버리지 모드라 발굴(2.0)보다 완화. */
const VOLUME_ANOMALY_RATIO = 1.5;
/** 진공 후 유입: 직전 5일 평균이 30일 평균의 55% 미만(진공)이었는데 오늘 유입. */
const VACUUM_RATIO = 0.55;
const VACUUM_INFLOW_RATIO = 1.4;
/** 급등락 재료 — 하루 등락 절대값(시총 상위 30에선 그 자체가 사건). */
const BIG_MOVE_PCT = 5;
/** 조용한 구간 — 등락률 절대값. */
const QUIET_CHANGE_PCT = 3;
/** 카드 상한(WO: 3~5장) — quietScore 경쟁은 daily-30 이 함. */
const COIN_CARD_LIMIT = 5;

export interface CoinSignal {
  /** 24h 거래대금 / 직전 20일 평균. */
  volumeRatio: number;
  /** 진공(직전 5일 저조) 후 첫 유입 여부. */
  vacuumInflow: boolean;
  /** 급등락 재료(±5%+) — 시총 상위 30에선 그 자체가 오늘의 사건. */
  bigMove: boolean;
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
    bigMove: Math.abs(snapshot.changePct) >= BIG_MOVE_PCT,
    quiet: Math.abs(snapshot.changePct) < QUIET_CHANGE_PCT,
  };
}

/** 커버리지 신호 — 거래량 이상 / 진공 후 유입 / 급등락. 메이저 제외·급등 제외 없음(WO: Phase C 폐기). */
export function hasDiscoverySignal(_snapshot: CoinMarketSnapshot, signal: CoinSignal): boolean {
  return signal.volumeRatio >= VOLUME_ANOMALY_RATIO || signal.vacuumInflow || signal.bigMove;
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
  if (signal.bigMove) {
    parts.push(`하루 ${snapshot.changePct > 0 ? "+" : ""}${snapshot.changePct.toFixed(1)}%`);
  }
  if (signal.vacuumInflow) {
    parts.push(`거래 진공 뒤 첫 유입 · 24시간 거래대금 평소 ${ratioText(signal.volumeRatio)}`);
  } else if (signal.volumeRatio >= VOLUME_ANOMALY_RATIO || signal.bigMove) {
    parts.push(`24시간 거래대금 평소 ${ratioText(signal.volumeRatio)}`);
  }
  if (typeof snapshot.athChangePct === "number" && snapshot.athChangePct <= -30) {
    parts.push(`전고점 대비 ${Math.round(Math.abs(snapshot.athChangePct))}% 아래`);
  }
  if (signal.quiet) parts.push("아직 조용한 구간");
  return parts.join(" · ");
}

/** 커버리지(무신호) 헤드라인 — 시총 순위·거래대금 사실만. 신호 문구를 흉내내지 않는다. */
export function coinCoverageHeadline(snapshot: CoinMarketSnapshot, signal: CoinSignal): string {
  const parts: string[] = [];
  if (typeof snapshot.marketCapRank === "number") parts.push(`시총 ${snapshot.marketCapRank}위`);
  parts.push(`24시간 거래대금 평소 ${ratioText(signal.volumeRatio)}`);
  if (typeof snapshot.athChangePct === "number" && snapshot.athChangePct <= -30) {
    parts.push(`전고점 대비 ${Math.round(Math.abs(snapshot.athChangePct))}% 아래`);
  }
  if (signal.quiet) parts.push("아직 조용한 구간");
  return parts.join(" · ");
}

export function coinFrontSeed(snapshot: CoinMarketSnapshot, signal: CoinSignal): DiscoveryFrontSeed {
  const changePct = Number(snapshot.changePct.toFixed(2));
  const volumeRatio = Number(signal.volumeRatio.toFixed(2));
  const signals: CardFrontSignals = { changePct, volumeRatio };
  const closes = snapshot.candles.map((c) => c.close);
  const changeDir: "up" | "down" | "flat" = snapshot.changePct > 0 ? "up" : snapshot.changePct < 0 ? "down" : "flat";
  const candles = snapshot.candles.slice(-120);
  const chartSeries = buildChartSeries(candles);
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
    candles,
    ...(chartSeries ? { chartSeries } : {}),
  };
}

function coinStockPayload(snapshot: CoinMarketSnapshot, signal: CoinSignal, headline: string): DiscoveryStockPayload {
  // 뎁스 보조(재무 블록 미해당) — 거래소·거래대금·시총 순위(CoinGecko) 사실 표기.
  const capText = typeof snapshot.marketCapRank === "number" ? ` · 시총 ${snapshot.marketCapRank}위` : "";
  const reason = `Upbit 원화마켓 · 24시간 거래대금 ${eok(snapshot.accTradePrice24h)}${capText}`;
  return {
    canonical: snapshot.koreanName,
    market: "COIN",
    country: "GLOBAL",
    // 커버리지 모드(WO) — 메이저 화제성 감점 없음. BTC·ETH도 신호 있으면 카드.
    marquee: false,
    sector: "코인",
    symbol: snapshot.market,
    headline,
    whyShown: headline,
    reason,
    insightTag: signal.vacuumInflow
      ? "₿ 진공 후 유입"
      : signal.bigMove
        ? "₿ 급등락"
        : signal.volumeRatio >= VOLUME_ANOMALY_RATIO
          ? "₿ 거래대금 이상"
          : "₿ 시총 상위",
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

  const strength = (x: { snapshot: CoinMarketSnapshot; signal: CoinSignal }): number =>
    x.signal.volumeRatio + (x.signal.bigMove ? Math.abs(x.snapshot.changePct) / 2 : 0);
  const scored = snapshots
    .map((snapshot) => ({ snapshot, signal: computeCoinSignal(snapshot) }))
    .filter((x): x is { snapshot: CoinMarketSnapshot; signal: CoinSignal } => x.signal !== null && hasDiscoverySignal(x.snapshot, x.signal))
    .sort((a, b) => strength(b) - strength(a))
    .slice(0, COIN_CARD_LIMIT);

  for (const { snapshot, signal } of scored) {
    const headline = coinHeadline(snapshot, signal);
    if (!isFrontHookSafe(headline)) continue; // 카피 가드 — 발굴 문구도 예외 없음
    const payload = coinStockPayload(snapshot, signal, headline);
    stocks.push(payload);
    fronts[payload.canonical] = coinFrontSeed(snapshot, signal);
  }

  // 2026-07-11 User Zero: 코인은 발굴이 아니라 커버리지(#820) — 시총 10위권 유니버스에서
  // 신호 코인이 쿼터 미달이면 시총순으로 채운다(조용한 날 코인 탭 공백 방지). 카피는 사실만.
  if (stocks.length < COIN_CARD_LIMIT) {
    const usedMarkets = new Set(stocks.map((s) => s.symbol));
    const fillers = snapshots
      .map((snapshot) => ({ snapshot, signal: computeCoinSignal(snapshot) }))
      .filter((x): x is { snapshot: CoinMarketSnapshot; signal: CoinSignal } => x.signal !== null)
      .filter((x) => !usedMarkets.has(x.snapshot.market))
      .sort((a, b) => (a.snapshot.marketCapRank ?? 999) - (b.snapshot.marketCapRank ?? 999))
      .slice(0, COIN_CARD_LIMIT - stocks.length);
    for (const { snapshot, signal } of fillers) {
      const headline = coinCoverageHeadline(snapshot, signal);
      if (!isFrontHookSafe(headline)) continue;
      const payload = coinStockPayload(snapshot, signal, headline);
      stocks.push(payload);
      fronts[payload.canonical] = coinFrontSeed(snapshot, signal);
    }
  }

  return {
    asOf: kstDate(),
    stocks,
    fronts,
    confidence: stocks.length > 0 ? "H" : "L",
    source: "Upbit 일봉·거래대금 캐시 · CoinGecko",
  };
}

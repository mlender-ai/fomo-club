// 카드 앞면 FOMO 신호 서버 조립 — PHASE0 rev2 후속(스파크라인·시총순위·라이브 수급).
// baseline(가격·52주)·라이브 수급 streak·시총 순위·3개월 종가를 한 번에 모아 CardFrontSignals 로.
// 외부소스는 네이버 금융(이미 쓰는 무료·무인증) — 새 비용·DDL 없음. 실패는 조용히 폴백(부분만 채움).
import {
  resolveStock,
  signalsFromBasics,
  investorNetStreak,
  computeFomoScore,
  buildAxisSignals,
  selectMultiAxisHook,
  computeTechnicalAnalysis,
  selectTaFact,
  computeCardVerdict,
  computeWyckoffAnalysis,
  computeCompanyScore,
  companyFinancialsFromBasics,
  type CardVerdict,
  type CardFrontSignals,
  type FomoScoreResult,
  type DailyOhlcv,
  type TaFact,
  type TechnicalAnalysisSnapshot,
  type WyckoffAnalysis,
  type CompanyScoreResult,
  type AxisSignal,
  type MultiAxisHookSelection,
} from "@fomo/core";
import { fetchStockBasics, fetchStockBasicsLite, fetchUsStockBasics } from "./stock-basics";
import { fetchNasdaqDailyCandles, fetchUsDailyCandles } from "./us-market-source";
import type { DiscoveryMarketRow } from "./market-source-types";
import { readUsMarketQuoteRows } from "./us-market-cache";
import { readCoinMarketSnapshots } from "./coin-market-source";
import {
  buildCoinCause,
  composeCoinVerdict,
  issuesForSymbol,
  readLatestCoinMaterials,
  type CoinCause,
  type CoinMaterialItem,
} from "./coin-materials";
import { usSymbolForStock } from "./us-symbols";
import { readSupplyDemandHistory } from "./supply-demand-store";
import type { StockAttentionSignal, ThemeRelativeSignal } from "./stock-signal-coverage";

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/**
 * 네이버 siseJson(일봉) → 최근 N거래일 종가(오름차순, 오래된→최신). 스파크라인용.
 * 응답은 작은따옴표 의사 JSON + 헤더행(한글, EUC-KR) — 숫자 행만 정규식으로 안전 추출(인코딩 무관).
 */
/** 네이버 siseJson 일봉 → 최근 거래일 OHLCV(오름차순). 스파크라인 + 거래량 회전 + TA 사실층 공용. */
export async function fetchStockDaily(
  code: string,
  calendarDays = 420
): Promise<{ candles: DailyOhlcv[]; closes: number[]; volumes: number[] }> {
  try {
    const ymd = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const end = new Date();
    const start = new Date(end.getTime() - calendarDays * 86_400_000); // ~100일 ≈ 3개월 거래일
    const url = `https://api.finance.naver.com/siseJson.naver?symbol=${encodeURIComponent(code)}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=day`;
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { candles: [], closes: [], volumes: [] };
    const text = await res.text();
    // 데이터 행: ["20260320", 시, 고, 저, 종, 거래량, ...] — 날짜(따옴표)·OHLC·거래량(idx5).
    const rows: DailyOhlcv[] = [];
    const re = /\[\s*"?(\d{8})"?\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const open = Number(m[2]);
      const high = Number(m[3]);
      const low = Number(m[4]);
      const close = Number(m[5]);
      const volume = Number(m[6]);
      if ([open, high, low, close].every(Number.isFinite)) {
        rows.push({
          date: m[1]!,
          open,
          high,
          low,
          close,
          volume: Number.isFinite(volume) ? volume : 0,
        });
      }
    }
    rows.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : 1)); // 오래된→최신
    return { candles: rows, closes: rows.map((r) => r.close), volumes: rows.map((r) => r.volume) };
  } catch (err) {
    console.warn("[stock-front] daily failed", code, (err as Error)?.message);
    return { candles: [], closes: [], volumes: [] };
  }
}

/** 차트분석 탭용 시리즈(WO 1.6 D) — 종가·거래량 + MA20/60/120 정렬 배열(창 이전 구간은 null). */
export interface StockChartSeries {
  closes: number[];
  volumes: number[];
  ma20: Array<number | null>;
  ma60: Array<number | null>;
  ma120: Array<number | null>;
}

export function buildChartSeries(candles: readonly DailyOhlcv[], window = 120): StockChartSeries | undefined {
  const clean = candles.filter((c) => Number.isFinite(c.close) && c.close > 0);
  if (clean.length < 20) return undefined;
  const closes = clean.map((c) => c.close);
  const volumes = clean.map((c) => (Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0));
  const maAt = (i: number, n: number): number | null =>
    i + 1 >= n ? closes.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n : null;
  const start = Math.max(0, closes.length - window);
  const idx = Array.from({ length: closes.length - start }, (_, k) => start + k);
  return {
    closes: idx.map((i) => closes[i]!),
    volumes: idx.map((i) => volumes[i]!),
    ma20: idx.map((i) => maAt(i, 20)),
    ma60: idx.map((i) => maAt(i, 60)),
    ma120: idx.map((i) => maAt(i, 120)),
  };
}

/** 평소 대비 거래량 배수(거래량 회전) — 최신일 / 직전 ~20거래일 평균. 데이터 부족이면 undefined(가짜숫자 금지). */
function volumeTurnover(volumes: number[]): number | undefined {
  if (volumes.length < 6) return undefined;
  const today = volumes[volumes.length - 1]!;
  const prev = volumes.slice(-21, -1).filter((v) => v > 0);
  if (prev.length < 5 || today <= 0) return undefined;
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return avg > 0 ? today / avg : undefined;
}

/** 추세 강도 0~1 — *최근 ~1개월* 종가 변화폭(상·하 무관)을 15% 밴드로 정규화(현재 추세 세기).
 *  3개월 누적은 강세장에서 거의 다 saturate 라 최근 창으로 차별화. 데이터 부족이면 undefined. */
function trendStrength(closes: number[]): number | undefined {
  if (closes.length < 2) return undefined;
  const win = Math.min(closes.length, 21); // 최근 ~1개월 거래일
  const start = closes[closes.length - win]!;
  const last = closes[closes.length - 1]!;
  if (start <= 0) return undefined;
  const mag = Math.abs(last / start - 1) / 0.15;
  return mag < 0 ? 0 : mag > 1 ? 1 : mag;
}

interface RankEntry {
  market: string;
  rank: number;
}

async function fetchMarketRanks(naverMarket: "KOSPI" | "KOSDAQ", label: string, pages = 3, pageSize = 100): Promise<Record<string, RankEntry>> {
  const out: Record<string, RankEntry> = {};
  for (let page = 1; page <= pages; page++) {
    try {
      const d = (await getJson(
        `https://m.stock.naver.com/api/stocks/marketValue/${naverMarket}?page=${page}&pageSize=${pageSize}`
      )) as { stocks?: { itemCode?: string }[] };
      const stocks = d.stocks ?? [];
      if (stocks.length === 0) break;
      stocks.forEach((s, i) => {
        if (s.itemCode) out[s.itemCode] = { market: label, rank: (page - 1) * pageSize + i + 1 };
      });
      if (stocks.length < pageSize) break;
    } catch (err) {
      console.warn("[stock-front] rank page failed", naverMarket, page, (err as Error)?.message);
      break;
    }
  }
  return out;
}

/** 시총 순위 맵(코스피+코스닥 상위) — itemCode → {시장, 순위}. 호출부에서 일 단위 캐시. */
export async function fetchMarketCapRankMap(): Promise<Record<string, RankEntry>> {
  const [kospi, kosdaq] = await Promise.all([
    fetchMarketRanks("KOSPI", "코스피", 3),
    fetchMarketRanks("KOSDAQ", "코스닥", 3),
  ]);
  return { ...kospi, ...kosdaq };
}

export interface StockFrontData {
  /** 엔진에 넣을 신호(가격·52주·수급 streak·시총순위·정체성). */
  signals: CardFrontSignals;
  /** 포모 점수(척추) — C·L·라벨. 카드 점수/라벨/헤드라인의 단일 출처. */
  fomo: FomoScoreResult;
  /** 실데이터가 있는 축만 동일 가중치로 재정규화한 종합 기업 점수. */
  companyScore?: CompanyScoreResult;
  /** TA 셀렉터가 고른 사실 1개 — 점수/진열이 아니라 카드·상세 보조 문맥. */
  taFact?: TaFact;
  /** 차트분석(TA) 전체 스냅샷 — 뎁스 '차트분석' 탭용. 관측 서술 facts 배열(non-lite에서만). */
  ta?: TechnicalAnalysisSnapshot;
  /** 캔들차트용 실제 일봉 OHLCV. non-lite 에서 최대 260거래일만 내려준다. */
  candles?: DailyOhlcv[];
  /** 최근 3개월 종가(스파크라인) — 없으면 빈 배열. */
  sparkline: number[];
  /** 현재가 — 예 "354,000원"(카드 1행 표기용). */
  priceText?: string;
  /** 등락 — 예 "2,000 (0.55%)". */
  changeText?: string;
  /** 등락 방향(색). */
  changeDir?: "up" | "down" | "flat";
  /** 피드 카드용 강세 쪽 균형 사실 1줄. 원문/숫자가 있을 때만 채운다. */
  feedBull?: FeedSignalPoint;
  /** 피드 카드용 약세·주의 쪽 균형 사실 1줄. 원문/숫자가 있을 때만 채운다. */
  feedBear?: FeedSignalPoint;
  /** 다축 후킹 후보. 단일 종목 응답에서는 rarity=0, 피드 batch 에서 후보군 기준으로 재계산한다. */
  axisSignals?: AxisSignal[];
  /** 다축 후킹 대표 문장. 카드/상세 헤드라인의 우선 출처. */
  axisHook?: MultiAxisHookSelection;
  /** 판단 층(WO Phase 1) — 결정론 verdict 엔진. 캔들 부족 시 최소 verdict(관망·신호 축적). */
  verdict?: CardVerdict;
  /** 와이코프 구간·스프링/업스러스트·임펄스/눌림목 결정론 분석. non-lite에서만. */
  wyckoff?: WyckoffAnalysis;
  /** 차트분석 탭 시리즈(WO 1.6 D) — 종가+MA20/60/120+거래량. non-lite 에서만. */
  chartSeries?: StockChartSeries;
  /** 코인 전용 최근 재료. 크론 캐시에서만 읽는다. */
  coinIssues?: CoinMaterialItem[];
  /** 코인 가격 변동과 기사 발행 시각의 결정론적 연결. */
  coinCause?: CoinCause;
}

export interface StockFrontOptions {
  /** 카드 앞면용 경량 경로. 시총순위·TA·상세 지표를 빼고 가격/수급/언급/짧은 차트만 쓴다. */
  lite?: boolean;
  /** 동적 발견 종목(STOCK_VOCAB 미등재)용 네이버 코드. 있으면 vocab 없이도 캔들·TA 조회. */
  naverCode?: string;
  /** US 종목은 네이버 코드가 없으므로 symbol 기반 quote cache를 쓰고, non-lite에서는 US 일봉 TA도 보강한다. */
  symbol?: string;
}

export interface FeedSignalPoint {
  text: string;
  source: "뉴스" | "수급" | "테마" | "가격" | "주목" | "위치" | "거래";
}

function pushUnique(out: FeedSignalPoint[], point: FeedSignalPoint): void {
  if (out.some((p) => p.text.replace(/\s+/g, "") === point.text.replace(/\s+/g, ""))) return;
  out.push(point);
}

function buildFeedPoints(
  signals: CardFrontSignals,
  changeDir: "up" | "down" | "flat" | undefined,
  changeText: string | undefined
): { bull?: FeedSignalPoint; bear?: FeedSignalPoint } {
  const bull: FeedSignalPoint[] = [];
  const bear: FeedSignalPoint[] = [];
  const { foreignNetStreak, institutionNetStreak } = signals;

  if (signals.newsEventLabel) {
    pushUnique(bull, { text: `오늘 이 종목을 직접 언급한 뉴스가 있어요.`, source: "뉴스" });
  }
  if (typeof foreignNetStreak === "number" && foreignNetStreak >= 3) {
    pushUnique(bull, { text: `외국인이 ${foreignNetStreak}일째 사는 중이에요.`, source: "수급" });
  }
  if (typeof institutionNetStreak === "number" && institutionNetStreak >= 3) {
    pushUnique(bull, { text: `기관이 ${institutionNetStreak}일째 사는 중이에요.`, source: "수급" });
  }
  if (typeof signals.themeRelativeRank === "number" && signals.themeRelativeRank === 1 && typeof signals.changePct === "number" && signals.changePct > 0) {
    pushUnique(bull, {
      text: `같은 ${signals.themeLabel ?? "테마"} 종목들 중 오늘 변동성이 가장 컸어요.`,
      source: "테마",
    });
  }
  if (typeof signals.mentionScore === "number" && signals.mentionScore >= 60) {
    pushUnique(bull, { text: "뉴스·커뮤니티 언급이 늘어난 상태예요.", source: "주목" });
  }
  if (signals.near52WeekHigh) {
    pushUnique(bull, { text: "최근 1년 중 높은 가격대에 가까워요.", source: "위치" });
  }
  if (changeDir === "up" && changeText) {
    pushUnique(bull, { text: `오늘 가격은 ${changeText} 상승으로 움직였어요.`, source: "가격" });
  }

  if (typeof foreignNetStreak === "number" && foreignNetStreak <= -3) {
    pushUnique(bear, { text: `외국인이 ${Math.abs(foreignNetStreak)}일째 파는 중이에요.`, source: "수급" });
  }
  if (typeof institutionNetStreak === "number" && institutionNetStreak <= -3) {
    pushUnique(bear, { text: `기관이 ${Math.abs(institutionNetStreak)}일째 파는 중이에요.`, source: "수급" });
  }
  if (
    typeof signals.themeAverageChangePct === "number" &&
    typeof signals.themeRelativeChangePct === "number" &&
    typeof signals.changePct === "number" &&
    signals.themeAverageChangePct >= 2 &&
    signals.themeRelativeChangePct <= -3
  ) {
    pushUnique(bear, {
      text: `${signals.themeLabel ?? "같은 테마"} 평균보다 덜 움직였어요.`,
      source: "테마",
    });
  }
  if (typeof signals.volumeRatio === "number" && signals.volumeRatio >= 1.8 && changeDir === "down") {
    pushUnique(bear, { text: "빠지는 중인데 거래량은 늘었어요.", source: "거래" });
  }
  if (signals.near52WeekLow) {
    pushUnique(bear, { text: "최근 1년 낮은 가격대에 가까워요.", source: "위치" });
  }
  if (changeDir === "down" && changeText) {
    pushUnique(bear, { text: `오늘 가격은 ${changeText} 하락으로 움직였어요.`, source: "가격" });
  }

  return {
    ...(bull[0] ? { bull: bull[0] } : {}),
    ...(bear[0] ? { bear: bear[0] } : {}),
  };
}

function mergeCoverageSignals(signals: CardFrontSignals, coverage: { attention?: StockAttentionSignal; themeRelative?: ThemeRelativeSignal }): void {
  if (coverage.attention) {
    signals.mentionCount = coverage.attention.mentionCount;
    signals.mentionScore = coverage.attention.mentionScore;
    if (coverage.attention.newsEventLabel) signals.newsEventLabel = coverage.attention.newsEventLabel;
    if (coverage.attention.newsEventSource) signals.newsEventSource = coverage.attention.newsEventSource;
  }
  if (coverage.themeRelative) {
    signals.themeLabel = coverage.themeRelative.themeLabel;
    signals.themeRelativeRank = coverage.themeRelative.themeRelativeRank;
    signals.themePeerCount = coverage.themeRelative.themePeerCount;
    signals.themeAverageChangePct = coverage.themeRelative.themeAverageChangePct;
    signals.themeRelativeChangePct = coverage.themeRelative.themeRelativeChangePct;
  }
}

function usRowMatches(row: DiscoveryMarketRow, stock: string, symbol: string | undefined): boolean {
  const requested = stock.trim().toUpperCase();
  const rowSymbol = row.symbol.trim().toUpperCase();
  return (
    (symbol ? rowSymbol === symbol.trim().toUpperCase() : false) ||
    rowSymbol === requested ||
    row.canonical.trim() === stock.trim()
  );
}

async function assembleUsCachedStockFront(
  stock: string,
  coverage: { attention?: StockAttentionSignal; themeRelative?: ThemeRelativeSignal },
  options: StockFrontOptions
): Promise<StockFrontData | null> {
  const symbol = options.symbol?.trim().toUpperCase() ?? usSymbolForStock(stock);
  const rows = await readUsMarketQuoteRows({ maxAgeHours: 24 });
  const row = rows.find((item) => usRowMatches(item, stock, symbol));
  if (!row) return null;

  const signals: CardFrontSignals = {};
  if (typeof row.changePct === "number") signals.changePct = row.changePct;
  if (typeof row.marketCapRank === "number") {
    signals.marketCapRank = { scope: "market", market: row.market, rank: row.marketCapRank };
  }
  if (row.sectorHint) signals.themeLabel = row.sectorHint;
  mergeCoverageSignals(signals, coverage);

  const sparkline = row.sparkline?.filter((value) => typeof value === "number" && Number.isFinite(value)).slice(-42) ?? [];
  const trend = trendStrength(sparkline);
  const fomo = computeFomoScore({
    ...(typeof signals.changePct === "number" ? { changePct: signals.changePct } : {}),
    ...(typeof trend === "number" ? { trendStrength: trend } : {}),
    ...(typeof signals.mentionScore === "number" ? { mentionScore: signals.mentionScore } : {}),
  });
  const feedPoints = buildFeedPoints(signals, row.changeDir, row.changeText);
  const axisSignals = buildAxisSignals({ signals });
  const axisHook = selectMultiAxisHook(axisSignals);

  return {
    signals,
    fomo,
    sparkline,
    ...(row.priceText ? { priceText: row.priceText } : {}),
    ...(row.changeText ? { changeText: row.changeText } : {}),
    ...(row.changeDir ? { changeDir: row.changeDir } : {}),
    ...(feedPoints.bull ? { feedBull: feedPoints.bull } : {}),
    ...(feedPoints.bear ? { feedBear: feedPoints.bear } : {}),
    axisSignals,
    axisHook,
  };
}

/**
 * 코인 카드 앞면·뎁스(WO Phase C) — Upbit 프리웜 캐시만 읽어 조립(요청 경로 외부 fetch 0).
 * 주식과 같은 표준: TA·verdict·chartSeries 전부 같은 엔진에 캔들만 공급. 재무는 코인 미해당.
 */
async function assembleCoinStockFront(market: string, lite: boolean): Promise<StockFrontData> {
  const [snapshots, materialCache] = await Promise.all([
    readCoinMarketSnapshots().catch(() => []),
    readLatestCoinMaterials().catch(() => null),
  ]);
  const snapshot = snapshots.find((s) => s.market.toUpperCase() === market);
  if (!snapshot) return { signals: {}, fomo: computeFomoScore({}), sparkline: [] };

  const coinIssues = issuesForSymbol(materialCache, snapshot.symbol);
  const coinCause = buildCoinCause(snapshot, coinIssues);
  const primaryIssue = coinIssues.find((issue) => issue.scope === "coin");

  const fullValues = snapshot.tradeValues.slice(0, -1);
  const avg20 = fullValues.length >= 5 ? fullValues.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, fullValues.length) : 0;
  const volRatio = avg20 > 0 ? snapshot.accTradePrice24h / avg20 : undefined;
  const signals: CardFrontSignals = {
    changePct: Number(snapshot.changePct.toFixed(2)),
    ...(typeof volRatio === "number" ? { volumeRatio: Number(volRatio.toFixed(2)) } : {}),
    ...(primaryIssue ? { newsEventLabel: primaryIssue.title, newsEventSource: primaryIssue.source } : {}),
  };
  const closes = snapshot.candles.map((c) => c.close);
  const sparkline = closes.slice(-66);
  const priceText =
    snapshot.price >= 1000
      ? `${Math.round(snapshot.price).toLocaleString("ko-KR")}원`
      : `${snapshot.price.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}원`;
  const changeText = `${snapshot.changePct > 0 ? "+" : ""}${snapshot.changePct.toFixed(2)}%`;
  const changeDir: "up" | "down" | "flat" = snapshot.changePct > 0 ? "up" : snapshot.changePct < 0 ? "down" : "flat";
  const base = {
    signals,
    sparkline,
    priceText,
    changeText,
    changeDir,
    ...(coinIssues.length ? { coinIssues } : {}),
    ...(coinCause ? { coinCause } : {}),
  };
  if (lite) {
    return { ...base, fomo: computeFomoScore({ ...signals }) };
  }
  const ta = computeTechnicalAnalysis(snapshot.candles);
  const trend = ta.inputs.trendStrength ?? trendStrength(sparkline);
  const fomo = computeFomoScore({
    ...signals,
    ...(typeof trend === "number" ? { trendStrength: trend } : {}),
    ...(ta.inputs.accumulationDivergence ? { accumulationDivergence: true } : {}),
    ...(ta.inputs.bollingerSqueeze ? { bollingerSqueeze: true } : {}),
  });
  const taFact = selectTaFact(fomo, ta);
  const verdict = composeCoinVerdict(computeCardVerdict({
    candles: snapshot.candles,
    ...(typeof volRatio === "number" ? { volumeRatio: volRatio } : {}),
    currency: "KRW",
  }), coinIssues);
  const wyckoff = computeWyckoffAnalysis({
    candles: snapshot.candles,
    ...(typeof verdict?.invalidationLevel === "number" ? { invalidationLevel: verdict.invalidationLevel } : {}),
    currency: "KRW",
  });
  const chartSeries = buildChartSeries(snapshot.candles);
  const companyScore = computeCompanyScore({
    signals,
    verdict,
    wyckoff,
    currentPrice: snapshot.price,
    asOf: snapshot.fetchedAt,
  });
  return {
    ...base,
    fomo,
    ...(taFact ? { taFact } : {}),
    ta,
    verdict,
    wyckoff,
    companyScore,
    ...(chartSeries ? { chartSeries } : {}),
    // 캔들차트(Phase A) — 국·미와 동일하게 non-lite 에서 실제 일봉 제공.
    ...(snapshot.candles.length > 0 ? { candles: snapshot.candles.slice(-260) } : {}),
  };
}

/**
 * 한 종목의 카드 앞면 데이터 조립 + 포모 점수 산출(척추 단일 출처).
 * baseline(가격·52주) + 라이브 수급 streak + 거래량 회전·추세 + 시총순위 + 스파크라인 → computeFomoScore.
 * rankMap 은 비싸므로 호출부에서 받아 재사용(없으면 순위 생략).
 */
export async function assembleStockFront(
  stock: string,
  rankMap?: Record<string, RankEntry>,
  coverage: { attention?: StockAttentionSignal; themeRelative?: ThemeRelativeSignal } = {},
  options: StockFrontOptions = {}
): Promise<StockFrontData> {
  // 코인(WO Phase C) — symbol 이 Upbit 마켓 코드("KRW-*")면 코인 캐시 경로(요청 경로 외부 fetch 0).
  const coinMarket = options.symbol?.trim().toUpperCase();
  if (coinMarket?.startsWith("KRW-")) {
    return assembleCoinStockFront(coinMarket, options.lite === true);
  }
  const def = resolveStock(stock);
  const code = options.naverCode ?? def?.naverCode;
  if (!code) {
    const usSymbol = options.symbol?.trim().toUpperCase() ?? usSymbolForStock(stock);
    if (!usSymbol) return { signals: {}, fomo: computeFomoScore({}), sparkline: [] };
    const cachedFront = await assembleUsCachedStockFront(stock, coverage, { ...options, symbol: usSymbol }).catch(() => null);
    if (options.lite === true) return cachedFront ?? { signals: {}, fomo: computeFomoScore({}), sparkline: [] };

    const basicsPromise = fetchUsStockBasics(stock, usSymbol, false).catch(() => null);
    let daily = await fetchUsDailyCandles(usSymbol, 260).catch(() => ({ candles: [], closes: [], volumes: [] }));
    if (daily.candles.length === 0) {
      daily = await fetchNasdaqDailyCandles(usSymbol, 365).catch(() => ({ candles: [], closes: [], volumes: [] }));
    }
    if (!cachedFront && daily.closes.length === 0) return { signals: {}, fomo: computeFomoScore({}), sparkline: [] };

    const signals: CardFrontSignals = { ...(cachedFront?.signals ?? {}) };
    mergeCoverageSignals(signals, coverage);
    const volRatio = volumeTurnover(daily.volumes);
    if (typeof volRatio === "number") signals.volumeRatio = volRatio;
    const ta = computeTechnicalAnalysis(daily.candles);
    const sparkline = (daily.closes.length > 0 ? daily.closes : cachedFront?.sparkline ?? []).slice(-66);
    const trend = ta.inputs.trendStrength ?? trendStrength(sparkline);
    const fomo = computeFomoScore({
      ...(typeof volRatio === "number" ? { volumeRatio: volRatio } : {}),
      ...(typeof signals.changePct === "number" ? { changePct: signals.changePct } : {}),
      ...(typeof trend === "number" ? { trendStrength: trend } : {}),
      ...(typeof signals.mentionScore === "number" ? { mentionScore: signals.mentionScore } : {}),
      ...(ta.inputs.accumulationDivergence ? { accumulationDivergence: true } : {}),
      ...(ta.inputs.bollingerSqueeze ? { bollingerSqueeze: true } : {}),
    });
    const taFact = selectTaFact(fomo, ta);
    const feedPoints = buildFeedPoints(signals, cachedFront?.changeDir, cachedFront?.changeText);
    const axisSignals = buildAxisSignals({ signals });
    const axisHook = selectMultiAxisHook(axisSignals);
    const verdict = computeCardVerdict({
      candles: daily.candles,
      ...(typeof volRatio === "number" ? { volumeRatio: volRatio } : {}),
      ...(signals.newsEventLabel && typeof signals.mentionScore === "number"
        ? { materialStrength: signals.mentionScore / 100 }
        : {}),
      currency: "USD",
    });
    const wyckoff = computeWyckoffAnalysis({
      candles: daily.candles,
      ...(typeof verdict?.invalidationLevel === "number" ? { invalidationLevel: verdict.invalidationLevel } : {}),
      currency: "USD",
    });
    const basics = await basicsPromise;
    const financials = companyFinancialsFromBasics(basics);
    const latestPrice = daily.closes.at(-1);
    const companyScore = computeCompanyScore({
      ...(financials ? { financials } : {}),
      signals,
      verdict,
      wyckoff,
      ...(typeof latestPrice === "number" ? { currentPrice: latestPrice } : {}),
      ...(signals.asOf ? { asOf: signals.asOf } : {}),
    });
    const chartSeries = buildChartSeries(daily.candles);
    return {
      signals,
      fomo,
      ...(taFact ? { taFact } : {}),
      ta,
      verdict,
      wyckoff,
      companyScore,
      ...(daily.candles.length > 0 ? { candles: daily.candles.slice(-260) } : {}),
      ...(chartSeries ? { chartSeries } : {}),
      sparkline,
      ...(cachedFront?.priceText ? { priceText: cachedFront.priceText } : {}),
      ...(cachedFront?.changeText ? { changeText: cachedFront.changeText } : {}),
      ...(cachedFront?.changeDir ? { changeDir: cachedFront.changeDir } : {}),
      ...(feedPoints.bull ? { feedBull: feedPoints.bull } : {}),
      ...(feedPoints.bear ? { feedBear: feedPoints.bear } : {}),
      axisSignals,
      axisHook,
    };
  }
  const lite = options.lite === true;

  const [basics, history, daily] = await Promise.all([
    (lite ? fetchStockBasicsLite(stock) : fetchStockBasics(stock)).catch(() => null),
    readSupplyDemandHistory(code).catch(() => []),
    fetchStockDaily(code, lite ? 110 : 420),
  ]);

  const signals: CardFrontSignals = basics ? signalsFromBasics(basics) : {};
  mergeCoverageSignals(signals, coverage);

  if (history.length > 0) {
    const streak = investorNetStreak(history);
    if (streak.foreign !== 0) signals.foreignNetStreak = streak.foreign;
    if (streak.institution !== 0) signals.institutionNetStreak = streak.institution;
  }

  const rank = lite || !code ? undefined : rankMap?.[code];
  if (rank) signals.marketCapRank = { scope: "market", market: rank.market, rank: rank.rank };

  // ── 포모 점수(척추) — 거래량 회전·가격(등락·추세)·수급. 언급량·prevScore 는 후속(없으면 제외). ──
  const volRatio = volumeTurnover(daily.volumes);
  if (typeof volRatio === "number") signals.volumeRatio = volRatio;
  const ta = lite ? null : computeTechnicalAnalysis(daily.candles);
  const trend = ta?.inputs.trendStrength ?? trendStrength(daily.closes);
  const fomo = computeFomoScore({
    ...(typeof volRatio === "number" ? { volumeRatio: volRatio } : {}),
    ...(typeof signals.changePct === "number" ? { changePct: signals.changePct } : {}),
    ...(typeof trend === "number" ? { trendStrength: trend } : {}),
    ...(typeof signals.mentionScore === "number" ? { mentionScore: signals.mentionScore } : {}),
    ...(ta?.inputs.accumulationDivergence ? { accumulationDivergence: true } : {}),
    ...(ta?.inputs.bollingerSqueeze ? { bollingerSqueeze: true } : {}),
    ...(typeof signals.foreignNetStreak === "number" ? { foreignNetStreak: signals.foreignNetStreak } : {}),
    ...(typeof signals.institutionNetStreak === "number" ? { institutionNetStreak: signals.institutionNetStreak } : {}),
  });
  const taFact = ta ? selectTaFact(fomo, ta) : undefined;
  const feedPoints = buildFeedPoints(signals, basics?.changeDir, basics?.changeText);
  const axisSignals = buildAxisSignals({ signals });
  const axisHook = selectMultiAxisHook(axisSignals);
  const verdict = computeCardVerdict({
    candles: daily.candles,
    ...(typeof signals.foreignNetStreak === "number" ? { foreignNetStreak: signals.foreignNetStreak } : {}),
    ...(typeof signals.institutionNetStreak === "number" ? { institutionNetStreak: signals.institutionNetStreak } : {}),
    ...(typeof volRatio === "number" ? { volumeRatio: volRatio } : {}),
    ...(signals.newsEventLabel && typeof signals.mentionScore === "number"
      ? { materialStrength: signals.mentionScore / 100 }
      : {}),
    currency: "KRW",
  });
  const wyckoff = computeWyckoffAnalysis({
    candles: daily.candles,
    ...(typeof signals.foreignNetStreak === "number" ? { foreignNetStreak: signals.foreignNetStreak } : {}),
    ...(typeof signals.institutionNetStreak === "number" ? { institutionNetStreak: signals.institutionNetStreak } : {}),
    ...(typeof verdict?.invalidationLevel === "number" ? { invalidationLevel: verdict.invalidationLevel } : {}),
    currency: "KRW",
  });
  const financials = companyFinancialsFromBasics(basics);
  const latestPrice = daily.closes.at(-1);
  const companyScore = computeCompanyScore({
    ...(financials ? { financials } : {}),
    signals,
    verdict,
    wyckoff,
    ...(typeof latestPrice === "number" ? { currentPrice: latestPrice } : {}),
    ...(signals.asOf ? { asOf: signals.asOf } : {}),
  });
  const chartSeries = lite ? undefined : buildChartSeries(daily.candles);

  return {
    signals,
    fomo,
    ...(taFact ? { taFact } : {}),
    ...(ta ? { ta } : {}),
    verdict,
    companyScore,
    ...(!lite ? { wyckoff } : {}),
    ...(!lite && daily.candles.length > 0 ? { candles: daily.candles.slice(-260) } : {}),
    ...(chartSeries ? { chartSeries } : {}),
    sparkline: daily.closes.slice(lite ? -42 : -66),
    ...(basics?.priceText ? { priceText: basics.priceText } : {}),
    ...(basics?.changeText ? { changeText: basics.changeText } : {}),
    ...(basics?.changeDir ? { changeDir: basics.changeDir } : {}),
    ...(feedPoints.bull ? { feedBull: feedPoints.bull } : {}),
    ...(feedPoints.bear ? { feedBear: feedPoints.bear } : {}),
    axisSignals,
    axisHook,
  };
}

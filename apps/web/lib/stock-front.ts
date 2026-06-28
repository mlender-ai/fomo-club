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
  type CardFrontSignals,
  type FomoScoreResult,
  type DailyOhlcv,
  type TaFact,
  type AxisSignal,
  type MultiAxisHookSelection,
} from "@fomo/core";
import { fetchStockBasics, fetchStockBasicsLite } from "./stock-basics";
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
  /** TA 셀렉터가 고른 사실 1개 — 점수/진열이 아니라 카드·상세 보조 문맥. */
  taFact?: TaFact;
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
}

export interface StockFrontOptions {
  /** 카드 앞면용 경량 경로. 시총순위·TA·상세 지표를 빼고 가격/수급/언급/짧은 차트만 쓴다. */
  lite?: boolean;
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
  const def = resolveStock(stock);
  const code = def?.naverCode;
  if (!code) return { signals: {}, fomo: computeFomoScore({}), sparkline: [] };
  const lite = options.lite === true;

  const [basics, history, daily] = await Promise.all([
    (lite ? fetchStockBasicsLite(stock) : fetchStockBasics(stock)).catch(() => null),
    readSupplyDemandHistory(code).catch(() => []),
    fetchStockDaily(code, lite ? 110 : 420),
  ]);

  const signals: CardFrontSignals = basics ? signalsFromBasics(basics) : {};
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

  if (history.length > 0) {
    const streak = investorNetStreak(history);
    if (streak.foreign !== 0) signals.foreignNetStreak = streak.foreign;
    if (streak.institution !== 0) signals.institutionNetStreak = streak.institution;
  }

  const rank = lite ? undefined : rankMap?.[code];
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

  return {
    signals,
    fomo,
    ...(taFact ? { taFact } : {}),
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

// 카드 앞면 FOMO 신호 서버 조립 — PHASE0 rev2 후속(스파크라인·시총순위·라이브 수급).
// baseline(가격·52주)·라이브 수급 streak·시총 순위·3개월 종가를 한 번에 모아 CardFrontSignals 로.
// 외부소스는 네이버 금융(이미 쓰는 무료·무인증) — 새 비용·DDL 없음. 실패는 조용히 폴백(부분만 채움).
import { resolveStock, signalsFromBasics, investorNetStreak, type CardFrontSignals } from "@fomo/core";
import { fetchStockBasics } from "./stock-basics";
import { readSupplyDemandHistory } from "./supply-demand-store";

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
export async function fetchStockSparkline(code: string, calendarDays = 100): Promise<number[]> {
  try {
    const ymd = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const end = new Date();
    const start = new Date(end.getTime() - calendarDays * 86_400_000); // ~100일 ≈ 3개월 거래일
    const url = `https://api.finance.naver.com/siseJson.naver?symbol=${encodeURIComponent(code)}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=day`;
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const text = await res.text();
    // 데이터 행: ["20260320", 350000, 355000, 348000, 352000, ...] — 날짜(따옴표),시,고,저,종,거래량,...
    const rows: { date: string; close: number }[] = [];
    const re = /\[\s*"?(\d{8})"?\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const close = Number(m[5]);
      if (Number.isFinite(close)) rows.push({ date: m[1]!, close });
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : 1)); // 오래된→최신
    return rows.map((r) => r.close).slice(-66); // 최근 ~3개월
  } catch (err) {
    console.warn("[stock-front] sparkline failed", code, (err as Error)?.message);
    return [];
  }
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
  /** 엔진(buildCardFrontHook)에 넣을 신호(가격·52주·수급 streak·시총순위·정체성). */
  signals: CardFrontSignals;
  /** 최근 3개월 종가(스파크라인) — 없으면 빈 배열. */
  sparkline: number[];
}

/**
 * 한 종목의 카드 앞면 데이터 조립. baseline(가격·52주) + 라이브 수급 streak + 시총순위 + 스파크라인.
 * rankMap 은 비싸므로 호출부에서 받아 재사용(없으면 순위 생략).
 */
export async function assembleStockFront(
  stock: string,
  rankMap?: Record<string, RankEntry>
): Promise<StockFrontData> {
  const def = resolveStock(stock);
  const code = def?.naverCode;
  if (!code) return { signals: {}, sparkline: [] };

  const [basics, history, sparkline] = await Promise.all([
    fetchStockBasics(stock).catch(() => null),
    readSupplyDemandHistory(code).catch(() => []),
    fetchStockSparkline(code),
  ]);

  const signals: CardFrontSignals = basics ? signalsFromBasics(basics) : {};

  if (history.length > 0) {
    const streak = investorNetStreak(history);
    if (streak.foreign !== 0) signals.foreignNetStreak = streak.foreign;
    if (streak.institution !== 0) signals.institutionNetStreak = streak.institution;
  }

  const rank = rankMap?.[code];
  if (rank) signals.marketCapRank = { scope: "market", market: rank.market, rank: rank.rank };

  return { signals, sparkline };
}

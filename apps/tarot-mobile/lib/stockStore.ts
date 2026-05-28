import { create } from "zustand";
import { apiFetch } from "./api";
import { decideSwrAction } from "@trading/shared/src/swrPolicy";
import type { StockQuote, StockChartBar, StockChartResponse } from "@trading/shared/src/stockTypes";

export type ChartRange = "1d" | "5d" | "1mo" | "3mo" | "1y";

export interface QuarterlyEarning {
  date: string;
  revenue: number | null;
  earnings: number | null;
}

export interface AnnualFinancial {
  year: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  grossProfit: number | null;
  ebitda: number | null;
}

export interface CompanyProfile {
  sector: string;
  industry: string;
  employees: number | null;
  summary: string;
  website: string;
}

export interface KeyMetrics {
  eps: number | null;
  bookValue: number | null;
  freeCashflow: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  returnOnAssets: number | null;
  profitMargins: number | null;
  grossMargins: number | null;
  priceToSalesTrailing12Months: number | null;
  pegRatio: number | null;
}

interface FinancialsResponse {
  profile: CompanyProfile;
  quarterlyEarnings: QuarterlyEarning[];
  annualFinancials: AnnualFinancial[];
  keyMetrics: KeyMetrics;
}

interface FinancialsBundle {
  profile: CompanyProfile;
  quarterlyEarnings: QuarterlyEarning[];
  annualFinancials: AnnualFinancial[];
  keyMetrics: KeyMetrics;
  cachedAt: number; // for staleness
}

interface ChartBundle {
  bars: StockChartBar[];
  range: ChartRange;
  cachedAt: number;
}

// Stale-while-revalidate: data 60초 이내 → fresh (fetch 스킵), 5분 이내 → stale (즉시 표시 + 백그라운드 fetch), 그 외 → expired (정상 fetch)
const FRESH_TTL_MS = 60 * 1000;
const STALE_TTL_MS = 5 * 60 * 1000;

interface StockState {
  // 현재 화면 표시용 (셀렉터)
  quote: StockQuote | null;
  chartBars: StockChartBar[];
  chartRange: ChartRange;
  quoteLoading: boolean;
  chartLoading: boolean;
  error: string | null;

  // Financials (현재 표시)
  profile: CompanyProfile | null;
  quarterlyEarnings: QuarterlyEarning[];
  annualFinancials: AnnualFinancial[];
  keyMetrics: KeyMetrics | null;
  financialsLoading: boolean;

  // per-symbol 캐시 (stale-while-revalidate 지원)
  quoteCache: Record<string, StockQuote>;
  chartCache: Record<string, ChartBundle>;
  financialsCache: Record<string, FinancialsBundle>;

  fetchQuote: (symbol: string, opts?: { force?: boolean }) => Promise<void>;
  fetchChart: (symbol: string, range?: ChartRange, opts?: { force?: boolean }) => Promise<void>;
  fetchFinancials: (symbol: string, opts?: { force?: boolean }) => Promise<void>;
  /** quote + financials를 단일 API 호출로 가져온다 (N+1 제거). */
  fetchBundle: (symbol: string, opts?: { force?: boolean }) => Promise<void>;
  setChartRange: (range: ChartRange) => void;
  /** 현재 표시 상태만 비움 — 캐시는 유지 (다른 종목 진입 시 호출). */
  clearActive: () => void;
}

export const useStockStore = create<StockState>((set, get) => ({
  quote: null,
  chartBars: [],
  chartRange: "3mo",
  quoteLoading: false,
  chartLoading: false,
  error: null,
  profile: null,
  quarterlyEarnings: [],
  annualFinancials: [],
  keyMetrics: null,
  financialsLoading: false,
  quoteCache: {},
  chartCache: {},
  financialsCache: {},

  fetchQuote: async (symbol, opts) => {
    const force = opts?.force === true;
    const cached = get().quoteCache[symbol];
    const now = Date.now();
    const action = decideSwrAction({
      cachedDataAt: cached?.dataAt,
      force,
      now,
      freshTtlMs: FRESH_TTL_MS,
      staleTtlMs: STALE_TTL_MS,
    });

    // 캐시 hit: 즉시 표시 (fresh든 stale이든)
    if (cached) {
      set({ quote: cached, quoteLoading: false, error: null });
    } else {
      set({ quote: null, quoteLoading: true, error: null });
    }

    if (action === "skip") return;

    // background-revalidate 또는 fetch-blocking → 동일 fetch 코드 (UX 차이는 위에서 set로 처리됨)
    try {
      const data = await apiFetch<StockQuote>(
        `/api/tarot/quote?symbol=${encodeURIComponent(symbol)}`
      );
      set((s) => ({
        quote: get().quote?.symbol === symbol || !get().quote ? data : s.quote,
        quoteLoading: false,
        quoteCache: { ...s.quoteCache, [symbol]: data },
      }));
    } catch (err) {
      // 캐시 hit이었으면 에러 무시하고 stale 데이터 유지 (백그라운드 재검증 실패)
      const hadCache = !!cached;
      set({
        quoteLoading: false,
        error: hadCache ? null : err instanceof Error ? err.message : "시세 조회 실패",
      });
    }
  },

  fetchChart: async (symbol, range, opts) => {
    const force = opts?.force === true;
    const r = range ?? get().chartRange;
    const cacheKey = `${symbol}:${r}`;
    const cached = get().chartCache[cacheKey];
    const now = Date.now();
    const cachedAtIso = cached ? new Date(cached.cachedAt).toISOString() : null;
    const action = decideSwrAction({
      cachedDataAt: cachedAtIso,
      force,
      now,
      freshTtlMs: FRESH_TTL_MS,
      staleTtlMs: STALE_TTL_MS,
    });

    if (cached) {
      set({ chartBars: cached.bars, chartRange: r, chartLoading: false });
    } else {
      set({ chartBars: [], chartRange: r, chartLoading: true });
    }

    if (action === "skip") return;

    try {
      const data = await apiFetch<StockChartResponse>(
        `/api/tarot/chart?symbol=${encodeURIComponent(symbol)}&range=${r}`
      );
      set((s) => ({
        chartBars: get().chartRange === r ? data.bars : s.chartBars,
        chartLoading: false,
        chartCache: {
          ...s.chartCache,
          [cacheKey]: { bars: data.bars, range: r, cachedAt: Date.now() },
        },
      }));
    } catch {
      set({ chartLoading: false });
    }
  },

  fetchFinancials: async (symbol, opts) => {
    const force = opts?.force === true;
    const cached = get().financialsCache[symbol];
    const now = Date.now();
    const cachedAtIso = cached ? new Date(cached.cachedAt).toISOString() : null;
    const action = decideSwrAction({
      cachedDataAt: cachedAtIso,
      force,
      now,
      freshTtlMs: FRESH_TTL_MS,
      staleTtlMs: STALE_TTL_MS,
    });

    if (cached) {
      set({
        profile: cached.profile,
        quarterlyEarnings: cached.quarterlyEarnings,
        annualFinancials: cached.annualFinancials,
        keyMetrics: cached.keyMetrics,
        financialsLoading: false,
      });
    } else {
      set({ financialsLoading: true });
    }

    if (action === "skip") return;

    try {
      const data = await apiFetch<FinancialsResponse>(
        `/api/tarot/financials?symbol=${encodeURIComponent(symbol)}`
      );
      set((s) => ({
        profile: data.profile,
        quarterlyEarnings: data.quarterlyEarnings,
        annualFinancials: data.annualFinancials,
        keyMetrics: data.keyMetrics,
        financialsLoading: false,
        financialsCache: {
          ...s.financialsCache,
          [symbol]: {
            profile: data.profile,
            quarterlyEarnings: data.quarterlyEarnings,
            annualFinancials: data.annualFinancials,
            keyMetrics: data.keyMetrics,
            cachedAt: Date.now(),
          },
        },
      }));
    } catch {
      set({ financialsLoading: false });
    }
  },

  fetchBundle: async (symbol, opts) => {
    const force = opts?.force === true;
    const cachedQuote = get().quoteCache[symbol];
    const cachedFinancials = get().financialsCache[symbol];
    const now = Date.now();

    const quoteAction = decideSwrAction({
      cachedDataAt: cachedQuote?.dataAt,
      force,
      now,
      freshTtlMs: FRESH_TTL_MS,
      staleTtlMs: STALE_TTL_MS,
    });
    const finAction = decideSwrAction({
      cachedDataAt: cachedFinancials ? new Date(cachedFinancials.cachedAt).toISOString() : null,
      force,
      now,
      freshTtlMs: FRESH_TTL_MS,
      staleTtlMs: STALE_TTL_MS,
    });

    if (cachedQuote) {
      set({ quote: cachedQuote, quoteLoading: false });
    } else {
      set({ quote: null, quoteLoading: true });
    }

    if (cachedFinancials) {
      set({
        profile: cachedFinancials.profile,
        quarterlyEarnings: cachedFinancials.quarterlyEarnings,
        annualFinancials: cachedFinancials.annualFinancials,
        keyMetrics: cachedFinancials.keyMetrics,
        financialsLoading: false,
      });
    } else {
      set({ financialsLoading: true });
    }

    if (quoteAction === "skip" && finAction === "skip") return;

    try {
      const data = await apiFetch<{ quote: StockQuote; financials: FinancialsResponse | null }>(
        `/api/tarot/stock-bundle?symbol=${encodeURIComponent(symbol)}`
      );

      set((s) => ({
        quote: data.quote,
        quoteLoading: false,
        quoteCache: { ...s.quoteCache, [symbol]: data.quote },
        ...(data.financials
          ? {
              profile: data.financials.profile,
              quarterlyEarnings: data.financials.quarterlyEarnings,
              annualFinancials: data.financials.annualFinancials,
              keyMetrics: data.financials.keyMetrics,
              financialsLoading: false,
              financialsCache: {
                ...s.financialsCache,
                [symbol]: {
                  profile: data.financials.profile,
                  quarterlyEarnings: data.financials.quarterlyEarnings,
                  annualFinancials: data.financials.annualFinancials,
                  keyMetrics: data.financials.keyMetrics,
                  cachedAt: Date.now(),
                },
              },
            }
          : { financialsLoading: false }),
      }));
    } catch (err) {
      const hadQuoteCache = !!cachedQuote;
      set({
        quoteLoading: false,
        financialsLoading: false,
        error: hadQuoteCache ? null : err instanceof Error ? err.message : "조회 실패",
      });
    }
  },

  setChartRange: (range) => set({ chartRange: range }),

  clearActive: () =>
    set({
      quote: null,
      chartBars: [],
      chartRange: "3mo",
      quoteLoading: false,
      chartLoading: false,
      error: null,
      profile: null,
      quarterlyEarnings: [],
      annualFinancials: [],
      keyMetrics: null,
      financialsLoading: false,
    }),
}));

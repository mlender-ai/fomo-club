import { create } from "zustand";

export type SpreadType = "single" | "three-card";

export interface DrawnCard {
  id: string;
  name: string;
  nameKo: string;
  symbol: string;
  isReversed: boolean;
  headline: string;
  summary: string;
  detail: string;
  slot?: string | null;
}

export interface DrawResult {
  id: string;
  ticker: string;
  tickerName: string;
  spread: SpreadType;
  cards: DrawnCard[];
  interpretation: string;
  drawnAt: string;
}

interface DrawStore {
  spread: SpreadType;
  ticker: string;
  tickerName: string;
  isDrawing: boolean;
  result: DrawResult | null;
  recentSearches: string[];
  setSpread: (s: SpreadType) => void;
  setTicker: (ticker: string, name: string) => void;
  setDrawing: (v: boolean) => void;
  setResult: (r: DrawResult) => void;
  addRecentSearch: (ticker: string) => void;
  reset: () => void;
}

export const useDrawStore = create<DrawStore>((set) => ({
  spread: "single",
  ticker: "",
  tickerName: "",
  isDrawing: false,
  result: null,
  recentSearches: [],
  setSpread: (spread) => set({ spread }),
  setTicker: (ticker, tickerName) => set({ ticker, tickerName }),
  setDrawing: (isDrawing) => set({ isDrawing }),
  setResult: (result) => set({ result }),
  addRecentSearch: (ticker) =>
    set((s) => ({
      recentSearches: [ticker, ...s.recentSearches.filter((t) => t !== ticker)].slice(0, 8),
    })),
  reset: () => set({ ticker: "", tickerName: "", result: null, isDrawing: false }),
}));

// 목업 카드 데이터 (API 연결 전)
export const MOCK_CARDS: DrawnCard[] = [
  {
    id: "fool",
    name: "The Fool",
    nameKo: "광대",
    symbol: "0",
    isReversed: false,
    headline: "새로운 시작의 기운",
    summary: "불확실성 속에서도 첫 걸음을 내딛을 용기가 필요한 시점입니다.",
    detail: "시장은 지금 예측 불가능한 국면에 들어서고 있습니다. 광대 카드는 무한한 가능성을 상징하지만, 동시에 주의가 필요함을 경고합니다. 기존의 분석 틀을 내려놓고 새로운 시각으로 접근하는 것이 유효할 수 있습니다.",
  },
  {
    id: "tower",
    name: "The Tower",
    nameKo: "탑",
    symbol: "XVI",
    isReversed: true,
    headline: "급격한 변화, 재편의 시기",
    summary: "기존 구조의 붕괴와 함께 새로운 질서가 형성되고 있습니다.",
    detail: "역방향 탑은 파국을 피한 변화를 암시합니다. 시장에서 큰 충격이 예상되었으나 그 강도는 제한적일 수 있습니다. 변동성이 높은 구간이니 포지션을 점검하세요.",
  },
  {
    id: "star",
    name: "The Star",
    nameKo: "별",
    symbol: "XVII",
    isReversed: false,
    headline: "회복과 희망의 신호",
    summary: "어둠 이후 빛이 찾아옵니다. 장기적 관점을 유지하세요.",
    detail: "별 카드는 폭풍 이후의 고요함을 상징합니다. 현재의 혼란은 일시적이며, 펀더멘탈이 견고한 종목은 이 시기를 견뎌낼 것입니다. 인내와 신뢰가 열쇠입니다.",
  },
];

export function getMockResult(ticker: string, tickerName: string, spread: SpreadType): DrawResult {
  const count = spread === "single" ? 1 : 3;
  const cards = MOCK_CARDS.slice(0, count);
  return {
    id: `mock-${Date.now()}`,
    ticker,
    tickerName,
    spread,
    cards,
    interpretation: cards[0].summary,
    drawnAt: new Date().toISOString(),
  };
}

import type { CardFrontSignals, FomoLabel, StockSector } from "@fomo/core";
import { stocksBySector } from "@fomo/core";
import { getWatchlist } from "./watchlist";
import { stockInterestScore } from "./stockInterest";
import type { DeckStock } from "./discoveryDeck";

const HIGH_INTEREST_SCORE = 18;

interface WhyShownInput {
  stock: DeckStock;
  fomoLabel?: FomoLabel | undefined;
  signals?: CardFrontSignals | undefined;
  nowMs?: number | undefined;
}

function hasWatchedPeer(sector: StockSector, stockName: string): boolean {
  const watch = getWatchlist();
  if (watch.length === 0) return false;
  const sectorStocks = stocksBySector(sector);
  const names = new Set(sectorStocks.map((s) => s.canonical));
  names.delete(stockName);
  return watch.some((w) => names.has(w.stock));
}

export function whyShown({ stock, fomoLabel, signals, nowMs = Date.now() }: WhyShownInput): string {
  if (stock.whyShown) return stock.whyShown;
  if (stock.reason) {
    return `대장주 말고 ‘${stock.sector}’ 흐름에서 같이 움직인 종목이에요.`;
  }
  if (hasWatchedPeer(stock.sector, stock.canonical)) {
    return "네가 관심 둔 종목들과 같은 섹터에 있어요.";
  }
  if (stockInterestScore(stock.canonical, nowMs) >= HIGH_INTEREST_SCORE) {
    return "네가 자주 멈춘 종목 흐름과 닮았어요.";
  }
  if (fomoLabel === "incoming") {
    return "아직 조용한데 수급이 먼저 들어오는 중이에요.";
  }
  if (
    (typeof signals?.mentionScore === "number" && signals.mentionScore >= 60) ||
    (typeof signals?.mentionCount === "number" && signals.mentionCount >= 3)
  ) {
    return "오늘 이 종목을 언급한 뉴스·글이 늘었어요.";
  }
  return "오늘 발견 풀에서 보여주는 종목이에요.";
}

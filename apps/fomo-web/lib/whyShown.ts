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
  const changePct = signals?.changePct;
  const isDown = typeof changePct === "number" && changePct < -1;
  const mentionStrong =
    (typeof signals?.mentionScore === "number" && signals.mentionScore >= 60) ||
    (typeof signals?.mentionCount === "number" && signals.mentionCount >= 3);
  const volumeStrong = typeof signals?.volumeRatio === "number" && signals.volumeRatio >= 1.8;
  const foreign = signals?.foreignNetStreak ?? 0;
  const institution = signals?.institutionNetStreak ?? 0;
  const hasSupplyBuy = foreign >= 3 || institution >= 3;
  const hasSupplySell = foreign <= -3 || institution <= -3;

  if (stock.reason) {
    return `‘${stock.sector}’ 흐름에서 같이 잡힌 원문 근거가 있어요: ${stock.reason}`;
  }
  if (signals?.newsEventLabel) {
    return `오늘 이 종목을 직접 언급한 뉴스가 있어요: ${signals.newsEventLabel}`;
  }
  if (isDown && hasSupplyBuy) {
    const actor = foreign >= 3 && institution >= 3 ? "외국인·기관" : foreign >= 3 ? "외국인" : "기관";
    return `가격은 빠졌지만 ${actor} 수급이 이어져서 확인 대상으로 보여줘요.`;
  }
  if (isDown && (mentionStrong || volumeStrong)) {
    return "강세 카드가 아니라, 하락 중에도 거래·언급이 몰린 이유를 확인하는 카드예요.";
  }
  if (hasSupplySell && (mentionStrong || volumeStrong)) {
    return "약세·주의 신호가 커져서 시장이 어디에 반응하는지 보여줘요.";
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
    mentionStrong
  ) {
    return "오늘 이 종목을 언급한 뉴스·글이 늘었어요.";
  }
  if (stock.marquee) {
    return `강한 재료가 확인된 카드는 아니에요. ${stock.sector} 흐름을 비교할 기준 종목으로 보여줘요.`;
  }
  return `아직 강한 재료는 적어요. ${stock.sector} 발견 풀에서 흐름 확인용으로 보여줘요.`;
}

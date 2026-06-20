import type { CandleDto } from "@fomo/shared";

export interface GetCandlesInput {
  symbol: string;
  timeframe: string;
  limit: number;
}

export interface PlaceOrderInput {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  reduceOnly?: boolean;
}

export interface OrderResult {
  orderId: string;
  executedPrice: number;
  executedQuantity: number;
  status: "FILLED";
}

export interface ExchangeAdapter {
  readonly name: string;
  readonly mode: "paper" | "real";
  readonly supportsOrderExecution: boolean;
  getRecentCandles(input: GetCandlesInput): Promise<CandleDto[]>;
  getLatestPrice(symbol: string): Promise<number>;
  placeOrder?(input: PlaceOrderInput): Promise<OrderResult>;
}


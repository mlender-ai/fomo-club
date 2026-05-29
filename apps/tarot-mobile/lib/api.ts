import axios from "axios";

const API_BASE_URL = "https://api.trading-taro.com";

interface TarotInsightRequest {
  ticker: string;
  cardId: string;
  orientation: string;
  marketCondition: string;
}

interface TarotInsightResponse {
  title: string;
  content: string;
}

export async function fetchTarotInsight({ ticker, cardId, orientation, marketCondition }: TarotInsightRequest): Promise<TarotInsightResponse> {
  const response = await axios.post(`${API_BASE_URL}/tarot-insight`, {
    ticker,
    cardId,
    orientation,
    marketCondition,
  });
  return response.data;
}

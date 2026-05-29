import type { TarotCardId, TarotCardOrientation } from "../types";

export function buildTarotInsightPrompt(
  ticker: string,
  cardId: TarotCardId,
  orientation: TarotCardOrientation,
  marketCondition: string
): string {
  return `
    Given the current market condition (${marketCondition}) and the stock with the ticker symbol "${ticker}", 
    interpret the tarot card "${cardId}" (${orientation}) in the context of potential investment insights.
    
    Provide your response in the following format:
    - Title: A short, engaging title for the insight.
    - Content: A detailed yet concise explanation (2-3 sentences) on what the card suggests for the stock's investment potential.
  `;
}

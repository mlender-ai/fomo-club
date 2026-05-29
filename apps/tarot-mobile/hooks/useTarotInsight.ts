import { useState, useEffect } from "react";
import { fetchTarotInsight } from "../lib/api";

export function useTarotInsight(ticker: string, cardId: string, orientation: string, marketCondition: string) {
  const [insight, setInsight] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsight = async () => {
      try {
        const data = await fetchTarotInsight({ ticker, cardId, orientation, marketCondition });
        setInsight(data);
      } catch (error) {
        console.error("Failed to fetch tarot insight:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInsight();
  }, [ticker, cardId, orientation, marketCondition]);

  return { insight, loading };
}

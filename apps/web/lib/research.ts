import { type UserResearchPreferences } from "@fomo/shared/src/research";

function parseCsv(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseResearchPreferences(searchParams: URLSearchParams): Partial<UserResearchPreferences> {
  return {
    sectors: parseCsv(searchParams.get("sectors")) as UserResearchPreferences["sectors"],
    tickers: parseCsv(searchParams.get("tickers"))
  };
}

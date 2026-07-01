import { secCikForSymbol } from "./us-symbols";

export interface SecFilingHit {
  symbol: string;
  label: string;
  source: string;
  asOf: string;
  url?: string;
}

const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data";
const SEC_SUBMISSIONS = "https://data.sec.gov/submissions";

function secUserAgent(): string | undefined {
  return process.env.SEC_EDGAR_USER_AGENT?.trim();
}

function accessionPath(cik: string, accession: string): string {
  return `${SEC_ARCHIVES}/${String(Number(cik))}/${accession.replace(/-/g, "")}/${accession}-index.html`;
}

export async function fetchRecentSecFilings(symbol: string, limit = 4): Promise<SecFilingHit[]> {
  const cik = secCikForSymbol(symbol);
  const userAgent = secUserAgent();
  if (!cik || !userAgent) return [];
  try {
    const res = await fetch(`${SEC_SUBMISSIONS}/CIK${cik}.json`, {
      headers: { accept: "application/json", "user-agent": userAgent },
      signal: AbortSignal.timeout(3_500),
      next: { revalidate: 3_600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      filings?: { recent?: { form?: string[]; filingDate?: string[]; primaryDocument?: string[]; accessionNumber?: string[] } };
    };
    const recent = data.filings?.recent;
    if (!recent?.form?.length) return [];
    const out: SecFilingHit[] = [];
    for (let i = 0; i < recent.form.length && out.length < limit; i += 1) {
      const form = recent.form[i];
      if (form !== "8-K" && form !== "10-Q" && form !== "10-K") continue;
      const asOf = recent.filingDate?.[i];
      const accession = recent.accessionNumber?.[i];
      if (!asOf || !accession) continue;
      out.push({
        symbol: symbol.toUpperCase(),
        label: `${form} 공시가 확인됐어요.`,
        source: "SEC EDGAR",
        asOf,
        url: accessionPath(cik, accession),
      });
    }
    return out;
  } catch (err) {
    console.warn("[sec-edgar] fetch failed", symbol, (err as Error)?.message);
    return [];
  }
}

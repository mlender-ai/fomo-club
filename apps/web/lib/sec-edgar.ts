import { secCikForSymbol } from "./us-symbols";

export interface SecFilingHit {
  symbol: string;
  label: string;
  source: string;
  asOf: string;
  url?: string;
  insiderPurchase?: {
    ownerName: string;
    ownerRole: string;
    shares: number;
    price: number;
    value: number;
    transactionDate: string;
  };
}

const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data";
const SEC_SUBMISSIONS = "https://data.sec.gov/submissions";
const SEC_INSIDER_PURCHASE_MIN_VALUE = 100_000;
const SEC_RECENT_FORM_SCAN_LIMIT = 80;
const SEC_FORM4_XML_SCAN_LIMIT = 8;

function secUserAgent(): string | undefined {
  return process.env.SEC_EDGAR_USER_AGENT?.trim();
}

function accessionPath(cik: string, accession: string): string {
  return `${SEC_ARCHIVES}/${String(Number(cik))}/${accession.replace(/-/g, "")}/${accession}-index.html`;
}

function documentPath(cik: string, accession: string, document: string | undefined): string | undefined {
  const doc = document?.trim();
  if (!doc) return undefined;
  const encodedDocPath = doc.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${SEC_ARCHIVES}/${String(Number(cik))}/${accession.replace(/-/g, "")}/${encodedDocPath}`;
}

function form4DocumentPaths(cik: string, accession: string, document: string | undefined): string[] {
  const primary = documentPath(cik, accession, document);
  const basename = document?.split("/").filter(Boolean).at(-1);
  const raw = basename && basename !== document ? documentPath(cik, accession, basename) : undefined;
  return [primary, raw].filter((url): url is string => Boolean(url));
}

function xmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? xmlText(match[1] ?? "") : undefined;
}

function tagBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((match) => match[1] ?? "");
}

function numberTag(xml: string, tag: string): number | undefined {
  const raw = tagValue(xml, tag);
  if (!raw) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function ownerRoleFromRelationship(xml: string): string {
  const officerTitle = tagValue(xml, "officerTitle");
  if (officerTitle) return officerTitle;
  if (tagValue(xml, "isOfficer") === "1") return "임원";
  if (tagValue(xml, "isDirector") === "1") return "이사";
  if (tagValue(xml, "isTenPercentOwner") === "1") return "10% 대주주";
  return "내부자";
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatCompactShares(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M주`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K주`;
  return `${Math.round(value).toLocaleString("en-US")}주`;
}

function mmdd(date: string): string {
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : date;
}

function parseForm4InsiderPurchase(symbol: string, xml: string): SecFilingHit["insiderPurchase"] | undefined {
  const ownerBlock = tagBlocks(xml, "reportingOwner")[0] ?? "";
  const ownerName = tagValue(ownerBlock, "rptOwnerName") ?? tagValue(xml, "rptOwnerName");
  if (!ownerName) return undefined;
  const ownerRole = ownerRoleFromRelationship(ownerBlock || xml);
  const purchases = tagBlocks(xml, "nonDerivativeTransaction")
    .filter((block) => tagValue(block, "transactionCode") === "P")
    .map((block) => {
      const shares = numberTag(tagBlocks(block, "transactionShares")[0] ?? block, "value");
      const price = numberTag(tagBlocks(block, "transactionPricePerShare")[0] ?? block, "value");
      const transactionDate = tagValue(tagBlocks(block, "transactionDate")[0] ?? block, "value");
      if (typeof shares !== "number" || typeof price !== "number" || !transactionDate) return null;
      return { shares, price, value: shares * price, transactionDate };
    })
    .filter((purchase): purchase is { shares: number; price: number; value: number; transactionDate: string } => purchase !== null);
  if (purchases.length === 0) return undefined;
  const total = purchases.reduce(
    (acc, purchase) => ({
      shares: acc.shares + purchase.shares,
      value: acc.value + purchase.value,
      transactionDate: acc.transactionDate > purchase.transactionDate ? acc.transactionDate : purchase.transactionDate,
    }),
    { shares: 0, value: 0, transactionDate: purchases[0]?.transactionDate ?? "" },
  );
  if (total.value < SEC_INSIDER_PURCHASE_MIN_VALUE) return undefined;
  return {
    ownerName: xmlText(ownerName),
    ownerRole,
    shares: total.shares,
    price: total.value / total.shares,
    value: total.value,
    transactionDate: total.transactionDate,
  };
}

async function fetchForm4InsiderPurchase(
  symbol: string,
  cik: string,
  accession: string,
  primaryDocument: string | undefined,
  userAgent: string,
): Promise<SecFilingHit | null> {
  let xml: string | undefined;
  for (const url of form4DocumentPaths(cik, accession, primaryDocument)) {
    const res = await fetch(url, {
      headers: { accept: "application/xml,text/xml,text/plain", "user-agent": userAgent },
      signal: AbortSignal.timeout(4_500),
      next: { revalidate: 3_600 },
    });
    if (!res.ok) continue;
    const text = await res.text();
    if (/<ownershipDocument[\s>]/i.test(text)) {
      xml = text;
      break;
    }
  }
  if (!xml) return null;
  const purchase = parseForm4InsiderPurchase(symbol, xml);
  if (!purchase) return null;
  const label = `${purchase.ownerRole} ${purchase.ownerName}이 ${formatUsd(purchase.value)} 규모 자사주 매수 · ${mmdd(purchase.transactionDate)}`;
  return {
    symbol: symbol.toUpperCase(),
    label,
    source: "SEC Form 4",
    asOf: purchase.transactionDate,
    url: accessionPath(cik, accession),
    insiderPurchase: purchase,
  };
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
    let form4XmlScans = 0;
    for (let i = 0; i < recent.form.length && i < SEC_RECENT_FORM_SCAN_LIMIT && out.length < limit; i += 1) {
      const form = recent.form[i];
      const accession = recent.accessionNumber?.[i];
      if (form !== "4" || !accession) continue;
      if (form4XmlScans >= SEC_FORM4_XML_SCAN_LIMIT) break;
      form4XmlScans += 1;
      const hit = await fetchForm4InsiderPurchase(symbol, cik, accession, recent.primaryDocument?.[i], userAgent).catch(() => null);
      if (hit) out.push(hit);
    }
    for (let i = 0; i < recent.form.length && i < SEC_RECENT_FORM_SCAN_LIMIT && out.length < limit; i += 1) {
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

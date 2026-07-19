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
  // SEC 은 연락처 포함 UA 를 요구 — env 미설정이면 기본 UA 폴백(피드 종목이슈가 env 없이도 동작).
  // ⚠️ UA 형식 주의(2026-07-15 실측): "이름/버전 email@domain" 평문만 200.
  // 괄호 "(contact: …)" 형식·users.noreply.github.com 주소는 SEC WAF가 403 — 프로덕션에서
  // fetchRecentSecFilings가 전부 []로 죽어 US 브리핑 '왜'·stock-issue가 통째로 사라졌던 원인.
  return process.env.SEC_EDGAR_USER_AGENT?.trim() || "FomoClub/1.0 fomo-club@example.com";
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

/**
 * 8-K Item 코드 → 한국어 사유(2026-07-15 User Zero: "IBM 실적 부진 8-K가 왜 그냥 '공시 확인'이냐").
 * SEC submissions.json 의 items 필드(예: "2.02,9.01")를 그대로 쓴다 — 본문 파싱·수치 추정 없음(사실만).
 */
/**
 * 쉬운말 라벨(WO 뎁스 재건 B — "8-K가 뭔지 모르겠다"): 규제 용어 원문 노출 금지.
 * 원문 링크·출처(SEC EDGAR)는 유지하고 표기만 쉬운말로.
 */
const SEC_8K_ITEM_LABELS: Record<string, string> = {
  "1.01": "대형 계약 체결 공시",
  "1.02": "계약 종료 공시",
  "2.01": "자산 인수·처분 공시",
  "2.02": "분기 실적 발표 (공식 공시)",
  "2.05": "구조조정 계획 공시",
  "2.06": "자산 손상 공시",
  "3.01": "상장 요건 미달 공시",
  "4.01": "감사인 변경 공시",
  "5.02": "임원·이사 변경 공시",
  "5.03": "정관 변경 공시",
  "7.01": "투자자 대상 자료 공개 (공식 공시)",
  "8.01": "기타 중요사항 공시",
};
// 급변동 원인으로서의 정보 가치 순 — 실적(2.02)이 최우선(가장 흔한 급변동 원인).
const SEC_8K_ITEM_PRIORITY = ["2.02", "2.05", "2.06", "1.01", "1.02", "3.01", "5.02", "4.01", "7.01", "8.01"];

/** 8-K 외 폼 → 쉬운말(원문 노출 금지). 미등록 폼은 일반어 폴백. */
const SEC_FORM_LABELS: Record<string, string> = {
  "10-Q": "분기 보고서 공시",
  "10-K": "연간 보고서 공시",
};

/**
 * ⚠️ 문구 제약: "공시가 확인됐어요" 류는 copy-guards의 추상 슬롭 블록리스트(공시…확인됐)에 걸려
 * 브리핑 detail(safeWhy→hasForbiddenCopy)에서 통째로 폐기된다 — 사실 명사구 형태를 유지할 것.
 */
function eightKLabel(items: string | undefined, asOf: string): string {
  const codes = (items ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const hit = SEC_8K_ITEM_PRIORITY.find((code) => codes.includes(code));
  return hit ? `${SEC_8K_ITEM_LABELS[hit]} · ${mmdd(asOf)}` : `주요 공시 제출 · ${mmdd(asOf)}`;
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
      filings?: {
        recent?: {
          form?: string[];
          filingDate?: string[];
          primaryDocument?: string[];
          accessionNumber?: string[];
          items?: string[];
        };
      };
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
        label: form === "8-K" ? eightKLabel(recent.items?.[i], asOf) : `${SEC_FORM_LABELS[form] ?? "공식 공시 제출"} · ${mmdd(asOf)}`,
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fomoCardView,
  selectFomoHook,
  selectMultiAxisHook,
  type AxisSignal,
  type MultiAxisHookSelection,
} from "@fomo/core";
import {
  buildDiscoveryResponse,
  type DiscoveryFrontSeed,
  type DiscoveryResponse,
  type DiscoveryStockPayload,
} from "../apps/web/lib/discovery-supply";
import type { DiscoveryCountryScope } from "../apps/web/lib/market-source-types";
import { compactDiscoveryCardHeadline } from "../apps/fomo-web/lib/discoveryHeadline";

type HeadlinePath = "raw_title" | "abstract_template" | "why_synthesis" | "fallback_no_event";
type HeadlineMethod = "ai" | "rule" | "fallback" | "none";
type ProvenanceEventKind = "news_mention" | "disclosure" | "volume_spike" | "none";

interface Args {
  country: DiscoveryCountryScope;
  limit: number;
  output: string;
}

interface HeadlineProvenanceRow {
  index: number;
  ticker: string;
  country: DiscoveryCountryScope | string;
  headline: string;
  path: HeadlinePath;
  method: HeadlineMethod;
  hasEvent: boolean;
  eventKind: ProvenanceEventKind;
  insightTag?: string;
  sourceLabel?: string;
}

interface HeadlineProvenanceReport {
  generatedAt: string;
  asOf: string;
  country: DiscoveryCountryScope | string;
  limit: number;
  total: number;
  distributions: {
    path: Record<HeadlinePath, number>;
    method: Record<HeadlineMethod, number>;
    eventKind: Record<ProvenanceEventKind, number>;
  };
  cards: HeadlineProvenanceRow[];
}

const PRICE_ONLY_REASON_PATTERN = /^오늘 가격이 [+-]?\d+(?:\.\d+)?% 움직였어요/;
const SURFACE_FILLER_HOOK_PATTERN =
  /(?:더\s*(?:살펴볼|확인할)|발견\s*풀|조용한\s*자리|신호를\s*확인하는\s*중|오늘은\s*뚜렷한\s*신호\s*없음|근거는\s*얇|이유\s*얇|흐름\s*(?:이|도)?\s*붙|확인되는\s*화면|눈에\s*띄었어요|한\s*가지\s*숫자만)/;
const SURFACE_PRICE_HOOK_PATTERN = /(?:^오늘 가격이|^가격 먼저 움직임$|^가격은 .*거래량|^가격은 .*뉴스)/;

const FALLBACK_PATTERN =
  /아직\s*공개된\s*계기\s*없음|뚜렷한\s*이유|아직\s*안\s*보여|확인되지\s*않았|재료\s*확인\s*안|원문\s*근거/;
const ABSTRACT_TEMPLATE_PATTERN =
  /^(?:뉴스|공시|계약|수주|실적|제품|파트너십|공급계약|해외\s*수주)에\s+(?:직접\s*)?재료가\s*붙었어요$|(?:외국인|기관)?\s*수급이\s*먼저\s*들어온\s*종목이에요|직접\s*재료가\s*붙었어요|뉴스\s*재료|공시\s*먼저|계약\s*재료|수주\s*재료/;
const DISCLOSURE_PATTERN = /공시|DART|SEC|8-K|10-Q|filing/i;
const NEWS_PATTERN = /뉴스|외신|리서치|기사|소식|Reuters|Bloomberg|연합뉴스|뉴시스|매일경제|한국경제|뉴스1/i;
const VOLUME_PATTERN = /거래량|거래가|평소\s*\d+(?:\.\d+)?배/;

function cleanInline(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function nonPriceOnlyHeadline(text: string | undefined): string | undefined {
  const clean = cleanInline(text);
  if (!clean || PRICE_ONLY_REASON_PATTERN.test(clean) || SURFACE_PRICE_HOOK_PATTERN.test(clean) || SURFACE_FILLER_HOOK_PATTERN.test(clean)) {
    return undefined;
  }
  return clean;
}

function compactReasonHeadlineSeed(text: string | undefined): string | undefined {
  const clean = cleanInline(text)
    .replace(
      /^(?:오늘|최근)\s+(?:이 종목을 직접 언급한 뉴스가 있어요|이 종목을 직접 다룬 리서치가 있어요|이 종목 뉴스 탭에 함께 묶인 흐름이 있어요|공시가 확인됐어요):\s*/,
      ""
    )
    .trim();
  if (!clean) return undefined;
  if (!/오늘|최근|공시|뉴스|리서치|수급|외국인|기관|거래량|가격|테마|흐름|순매수|신고가|계약|공급|실적|가이던스|revenue|guidance|earnings|contract|supply|partnership|SEC|filing/i.test(clean)) return undefined;
  if (/전문\s?기업|플랫폼\s?리더|도약\s?중|안정화\s?예상|사업\s?영역|서비스\s?제공/.test(clean)) return undefined;
  return clean.length > 56 ? `${clean.slice(0, 55)}…` : clean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const rawCountry = (get("country") ?? process.env.DISCOVERY_COUNTRY ?? "KR").toUpperCase();
  const country: DiscoveryCountryScope = rawCountry === "US" ? "US" : rawCountry === "ALL" ? "all" : "KR";
  const limit = Math.max(1, Number(get("limit") ?? process.env.DISCOVERY_HEADLINE_LIMIT ?? 50) || 50);
  const output = get("output") ?? process.env.DISCOVERY_HEADLINE_OUTPUT ?? "generated/headline-provenance-baseline.json";
  return { country, limit, output };
}

function finalVisibleHeadline(stock: DiscoveryStockPayload, front: DiscoveryFrontSeed | undefined): string {
  const rawReasonHeadline = nonPriceOnlyHeadline(stock.reason);
  const surfaceReasonHeadline =
    rawReasonHeadline ??
    compactDiscoveryCardHeadline({
      reason: stock.reason,
      sector: stock.sector,
      ticker: stock.canonical,
      marketCapRank: front?.signals.marketCapRank?.rank,
    });
  const reasonHeadlineSeed = surfaceReasonHeadline ?? compactReasonHeadlineSeed(stock.reason);
  const discoveryHeadline = nonPriceOnlyHeadline(reasonHeadlineSeed);
  if (discoveryHeadline) return discoveryHeadline;

  const axisHook: MultiAxisHookSelection | undefined =
    stock.axisHook ?? front?.axisHook ?? (front?.axisSignals ? selectMultiAxisHook(front.axisSignals as AxisSignal[]) : undefined);
  const axisHeadline = nonPriceOnlyHeadline(axisHook?.hookText);
  if (axisHeadline) return axisHeadline;

  if (front) {
    const legacyHook = selectFomoHook({
      fomo: front.fomo,
      signals: front.signals,
    });
    const legacyHeadline = nonPriceOnlyHeadline(legacyHook.headline);
    if (legacyHeadline) return legacyHeadline;

    const baseView = fomoCardView(front.fomo, {
      sector: stock.sector,
      ...(stock.reason ? { reason: stock.reason } : {}),
      ...(typeof front.signals.changePct === "number" ? { changePct: front.signals.changePct } : {}),
      ...(typeof front.signals.marketCapRank?.rank === "number" ? { marketCapRank: front.signals.marketCapRank.rank } : {}),
    });
    const baseHeadline = nonPriceOnlyHeadline(baseView.headline);
    if (baseHeadline) return baseHeadline;
  }

  return nonPriceOnlyHeadline(stock.reason) ?? "아직 공개된 계기 없음";
}

function sourceTitleFrom(stock: DiscoveryStockPayload): string | undefined {
  const label = cleanInline(stock.sourceLabel);
  if (!label) return undefined;
  return label.split(/\s+·\s+/)[0]?.trim();
}

function classifyEventKind(stock: DiscoveryStockPayload, front: DiscoveryFrontSeed | undefined, headline: string): ProvenanceEventKind {
  const haystack = [headline, stock.reason, stock.whyShown, stock.insightTag, stock.sourceLabel, stock.sourceUrl, front?.signals.newsEventLabel, front?.signals.newsEventSource]
    .map(cleanInline)
    .filter(Boolean)
    .join(" ");
  if (DISCLOSURE_PATTERN.test(haystack)) return "disclosure";
  if (NEWS_PATTERN.test(haystack) || !!stock.sourceUrl || !!stock.sourceLabel || !!front?.signals.newsEventLabel) return "news_mention";
  if (VOLUME_PATTERN.test(haystack)) return "volume_spike";
  return "none";
}

function classifyPath(stock: DiscoveryStockPayload, headline: string, eventKind: ProvenanceEventKind): HeadlinePath {
  if (!headline || FALLBACK_PATTERN.test(headline) || eventKind === "none") return "fallback_no_event";
  const title = sourceTitleFrom(stock);
  if (title) {
    const normalizedTitle = cleanInline(title).replace(/[.。]+$/g, "");
    const normalizedHeadline = cleanInline(headline).replace(/[.。]+$/g, "");
    if (
      normalizedTitle.length >= 8 &&
      normalizedHeadline.length >= 8 &&
      (normalizedTitle.includes(normalizedHeadline) || normalizedHeadline.includes(normalizedTitle.slice(0, Math.min(24, normalizedTitle.length))))
    ) {
      return "raw_title";
    }
  }
  if (ABSTRACT_TEMPLATE_PATTERN.test(headline)) return "abstract_template";
  return "why_synthesis";
}

function classifyMethod(path: HeadlinePath, headline: string): HeadlineMethod {
  if (!headline) return "none";
  if (path === "fallback_no_event") return "fallback";
  // The production response does not expose the ai/fallback method yet. Phase 0
  // intentionally avoids changing product payloads, so visible non-fallback text
  // is conservatively marked as rule-derived.
  return "rule";
}

function increment<T extends string>(bucket: Record<T, number>, key: T): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function buildReport(payload: DiscoveryResponse, args: Args): HeadlineProvenanceReport {
  const stocks = payload.stocks.slice(0, args.limit);
  const rows = stocks.map((stock, index): HeadlineProvenanceRow => {
    const front = payload.fronts[stock.canonical];
    const headline = finalVisibleHeadline(stock, front);
    const eventKind = classifyEventKind(stock, front, headline);
    const path = classifyPath(stock, headline, eventKind);
    return {
      index: index + 1,
      ticker: stock.canonical,
      country: stock.country ?? payload.country ?? args.country,
      headline,
      path,
      method: classifyMethod(path, headline),
      hasEvent: eventKind !== "none",
      eventKind,
      ...(stock.insightTag ? { insightTag: stock.insightTag } : {}),
      ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
    };
  });

  const pathCounts: Record<HeadlinePath, number> = {
    raw_title: 0,
    abstract_template: 0,
    why_synthesis: 0,
    fallback_no_event: 0,
  };
  const methodCounts: Record<HeadlineMethod, number> = {
    ai: 0,
    rule: 0,
    fallback: 0,
    none: 0,
  };
  const eventCounts: Record<ProvenanceEventKind, number> = {
    news_mention: 0,
    disclosure: 0,
    volume_spike: 0,
    none: 0,
  };
  rows.forEach((row) => {
    increment(pathCounts, row.path);
    increment(methodCounts, row.method);
    increment(eventCounts, row.eventKind);
  });

  return {
    generatedAt: new Date().toISOString(),
    asOf: payload.asOf,
    country: payload.country ?? args.country,
    limit: args.limit,
    total: rows.length,
    distributions: {
      path: pathCounts,
      method: methodCounts,
      eventKind: eventCounts,
    },
    cards: rows,
  };
}

function printReport(report: HeadlineProvenanceReport): void {
  console.log(`Headline provenance baseline (${report.country})`);
  console.log(`- asOf: ${report.asOf}`);
  console.log(`- cards: ${report.total}`);
  console.log("- path");
  (Object.keys(report.distributions.path) as HeadlinePath[]).forEach((key) => {
    const value = report.distributions.path[key];
    const pct = report.total > 0 ? Math.round((value / report.total) * 100) : 0;
    console.log(`  - ${key}: ${value} (${pct}%)`);
  });
  console.log("- method");
  (Object.keys(report.distributions.method) as HeadlineMethod[]).forEach((key) => {
    const value = report.distributions.method[key];
    const pct = report.total > 0 ? Math.round((value / report.total) * 100) : 0;
    console.log(`  - ${key}: ${value} (${pct}%)`);
  });
  console.log("- eventKind");
  (Object.keys(report.distributions.eventKind) as ProvenanceEventKind[]).forEach((key) => {
    const value = report.distributions.eventKind[key];
    const pct = report.total > 0 ? Math.round((value / report.total) * 100) : 0;
    console.log(`  - ${key}: ${value} (${pct}%)`);
  });
  console.log("\nTop samples");
  report.cards.slice(0, 12).forEach((row) => {
    console.log(`${String(row.index).padStart(2, "0")}. ${row.ticker} [${row.path}/${row.eventKind}] ${row.headline}`);
  });
}

async function writeBaseline(report: HeadlineProvenanceReport, output: string): Promise<void> {
  const file = path.resolve(process.cwd(), output);
  await mkdir(path.dirname(file), { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  existing[String(report.country)] = report;
  await writeFile(file, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const payload = await buildDiscoveryResponse({ country: args.country, targetedMaterial: true });
  const report = buildReport(payload, args);
  printReport(report);
  await writeBaseline(report, args.output);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

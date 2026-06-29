import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDiscoveryResponse,
  type DiscoveryFrontSeed,
  type DiscoveryResponse,
  type DiscoveryStockPayload,
} from "../apps/web/lib/discovery-supply";
import { hasConcreteSourceValue, hasExcessiveLatinHeadline, isAbstractTemplate, isRawTitleCopy } from "../apps/web/lib/copy-guards";
import type { DiscoveryCountryScope } from "../apps/web/lib/market-source-types";

type HeadlinePath = "raw_title" | "abstract_template" | "why_synthesis" | "fallback_no_event";
type HeadlineMethod = "ai" | "rule" | "fallback" | "none";
type ProvenanceEventKind = "news_mention" | "disclosure" | "volume_spike" | "price_move" | "market_context" | "theme_link" | "none";
type HeadlineTrack = "A_material" | "suppressed";

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
  track: HeadlineTrack;
  method: HeadlineMethod;
  hasEvent: boolean;
  eventKind: ProvenanceEventKind;
  insightTag?: string;
  sourceLabel?: string;
  concrete: boolean;
}

interface HeadlineProvenanceReport {
  generatedAt: string;
  asOf: string;
  country: DiscoveryCountryScope | string;
  limit: number;
  total: number;
  distributions: {
    path: Record<HeadlinePath, number>;
    track: Record<HeadlineTrack, number>;
    method: Record<HeadlineMethod, number>;
    eventKind: Record<ProvenanceEventKind, number>;
    hasEvent: {
      true: number;
      false: number;
    };
    concrete: {
      true: number;
      false: number;
    };
  };
  cards: HeadlineProvenanceRow[];
}

const FALLBACK_PATTERN =
  /아직\s*공개된\s*계기\s*없음|뚜렷한\s*이유|아직\s*안\s*보여|확인되지\s*않았|재료\s*확인\s*안|원문\s*근거/;
const ABSTRACT_TEMPLATE_PATTERN =
  /^(?:뉴스|공시|계약|수주|실적|제품|파트너십|공급계약|해외\s*수주)에\s+(?:직접\s*)?재료가\s*붙었어요$|(?:외국인|기관)?\s*수급이\s*먼저\s*들어온\s*종목이에요|직접\s*재료가\s*붙었어요|뉴스\s*재료|공시\s*먼저|계약\s*재료|수주\s*재료/;
const ADDITIONAL_ABSTRACT_TEMPLATE_PATTERN =
  /수급도\s*붙었어요|거래도\s*붙었어요|동종\s*(?:종목\s*비교도|흐름도)\s*붙었어요|(?:뉴스|공시|계약|수주|실적|제품|파트너십|공급계약|해외\s*수주)(?:에|\s*재료(?:가|를)?)\s*(?:직접\s*)?(?:새로\s*)?(?:재료가\s*)?(?:붙었어요|확인됐어요|나왔어요|반응했어요)|공시\s*원문이\s*새로\s*확인됐|(?:자금조달|계약|수주|실적|공시|뉴스|소식|파트너십|제품)\s*이슈가\s*확인됐|(?:계약|수주|실적|공시|뉴스|소식|재료|파트너십|제품)\s*(?:재료)?\s*(?:가|이)?\s*(?:새로\s*)?(?:확인됐|나왔|반응|붙었)|소식에\s*반응|다시\s*확인됐|새\s*움직임이\s*붙었|먼저\s*반응이\s*붙었/;
const DISCLOSURE_PATTERN = /공시|DART|SEC|8-K|10-Q|filing/i;
const NEWS_PATTERN = /뉴스|외신|리서치|기사|소식|Reuters|Bloomberg|연합뉴스|뉴시스|매일경제|한국경제|뉴스1/i;
const VOLUME_PATTERN = /거래량|거래가|평소\s*\d+(?:\.\d+)?배/;

function cleanInline(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
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

function finalVisibleHeadline(stock: DiscoveryStockPayload): string {
  return cleanInline(stock.headline);
}

function sourceTitleFrom(stock: DiscoveryStockPayload): string | undefined {
  const label = cleanInline(stock.sourceLabel);
  if (label) return label.split(/\s+·\s+/)[0]?.trim();
  return cleanInline(stock.headlineProvenance?.eventRef?.title) || undefined;
}

function classifyEventKind(stock: DiscoveryStockPayload, front: DiscoveryFrontSeed | undefined, headline: string): ProvenanceEventKind {
  const explicitKind = stock.headlineProvenance?.eventRef?.kind;
  if (
    explicitKind === "news_mention" ||
    explicitKind === "disclosure" ||
    explicitKind === "volume_spike" ||
    explicitKind === "price_move" ||
    explicitKind === "market_context" ||
    explicitKind === "theme_link"
  ) {
    return explicitKind;
  }
  const haystack = [
    headline,
    stock.reason,
    stock.whyShown,
    stock.insightTag,
    stock.sourceLabel,
    stock.sourceUrl,
    stock.headlineProvenance?.eventRef?.source,
    stock.headlineProvenance?.eventRef?.title,
    stock.headlineProvenance?.eventRef?.url,
    front?.signals.newsEventLabel,
    front?.signals.newsEventSource,
  ]
    .map(cleanInline)
    .filter(Boolean)
    .join(" ");
  if (DISCLOSURE_PATTERN.test(haystack)) return "disclosure";
  if (NEWS_PATTERN.test(haystack) || !!stock.sourceUrl || !!stock.sourceLabel || !!front?.signals.newsEventLabel) return "news_mention";
  if (VOLUME_PATTERN.test(haystack)) return "volume_spike";
  return "none";
}

function classifyPath(stock: DiscoveryStockPayload, headline: string, eventKind: ProvenanceEventKind): HeadlinePath {
  if (stock.headlineProvenance?.provenance === "suppressed" || !headline || FALLBACK_PATTERN.test(headline)) {
    return "fallback_no_event";
  }
  const title = sourceTitleFrom(stock);
  if (hasExcessiveLatinHeadline(headline)) return "raw_title";
  if (title && isRawTitleCopy(headline, title)) return "raw_title";
  if (ABSTRACT_TEMPLATE_PATTERN.test(headline) || ADDITIONAL_ABSTRACT_TEMPLATE_PATTERN.test(headline) || isAbstractTemplate(headline)) return "abstract_template";
  if (eventKind === "none") return "fallback_no_event";
  return "why_synthesis";
}

function classifyTrack(path: HeadlinePath, eventKind: ProvenanceEventKind): HeadlineTrack {
  if (path === "fallback_no_event") return "suppressed";
  if (eventKind === "news_mention" || eventKind === "disclosure") return "A_material";
  return "suppressed";
}

function classifyMethod(stock: DiscoveryStockPayload, path: HeadlinePath, headline: string): HeadlineMethod {
  const declared = stock.headlineProvenance?.method;
  if (declared === "ai" || declared === "rule") return declared;
  if (declared === "none") return "none";
  if (!headline) return "none";
  if (path === "fallback_no_event") return "fallback";
  return "rule";
}

function increment<T extends string>(bucket: Record<T, number>, key: T): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function isConcreteHeadline(stock: DiscoveryStockPayload, headline: string): boolean {
  if (hasExcessiveLatinHeadline(headline)) return false;
  const sourceTitle = sourceTitleFrom(stock);
  if (sourceTitle && hasConcreteSourceValue(headline, sourceTitle)) return true;
  return /\d/.test(headline) || /[A-Z]{2,}|[가-힣A-Za-z0-9]+(?:와|과)\s*[가-힣A-Za-z0-9]+/.test(headline);
}

function buildReport(payload: DiscoveryResponse, args: Args): HeadlineProvenanceReport {
  const stocks = payload.stocks.slice(0, args.limit);
  const rows = stocks.map((stock, index): HeadlineProvenanceRow => {
    const front = payload.fronts[stock.canonical];
    const headline = finalVisibleHeadline(stock);
    const eventKind = classifyEventKind(stock, front, headline);
    const path = classifyPath(stock, headline, eventKind);
    const track = classifyTrack(path, eventKind);
    const concrete = path === "why_synthesis" && isConcreteHeadline(stock, headline);
    return {
      index: index + 1,
      ticker: stock.canonical,
      country: stock.country ?? payload.country ?? args.country,
      headline,
      path,
      track,
      method: classifyMethod(stock, path, headline),
      hasEvent: eventKind !== "none",
      eventKind,
      concrete,
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
  const trackCounts: Record<HeadlineTrack, number> = {
    A_material: 0,
    suppressed: 0,
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
    price_move: 0,
    market_context: 0,
    theme_link: 0,
    none: 0,
  };
  const hasEventCounts = {
    true: 0,
    false: 0,
  };
  const concreteCounts = {
    true: 0,
    false: 0,
  };
  rows.forEach((row) => {
    increment(pathCounts, row.path);
    increment(trackCounts, row.track);
    increment(methodCounts, row.method);
    increment(eventCounts, row.eventKind);
    if (row.hasEvent) {
      hasEventCounts.true += 1;
    } else {
      hasEventCounts.false += 1;
    }
    if (row.concrete) {
      concreteCounts.true += 1;
    } else {
      concreteCounts.false += 1;
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    asOf: payload.asOf,
    country: payload.country ?? args.country,
    limit: args.limit,
    total: rows.length,
    distributions: {
      path: pathCounts,
      track: trackCounts,
      method: methodCounts,
      eventKind: eventCounts,
      hasEvent: hasEventCounts,
      concrete: concreteCounts,
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
  console.log("- track");
  (Object.keys(report.distributions.track) as HeadlineTrack[]).forEach((key) => {
    const value = report.distributions.track[key];
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
  console.log("- hasEvent");
  (Object.keys(report.distributions.hasEvent) as Array<"true" | "false">).forEach((key) => {
    const value = report.distributions.hasEvent[key];
    const pct = report.total > 0 ? Math.round((value / report.total) * 100) : 0;
    console.log(`  - ${key}: ${value} (${pct}%)`);
  });
  console.log("- concrete");
  (Object.keys(report.distributions.concrete) as Array<"true" | "false">).forEach((key) => {
    const value = report.distributions.concrete[key];
    const pct = report.total > 0 ? Math.round((value / report.total) * 100) : 0;
    console.log(`  - ${key}: ${value} (${pct}%)`);
  });
  console.log("\nTop samples");
  report.cards.slice(0, 12).forEach((row) => {
    console.log(`${String(row.index).padStart(2, "0")}. ${row.ticker} [${row.track}/${row.path}/${row.eventKind}] ${row.headline}`);
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

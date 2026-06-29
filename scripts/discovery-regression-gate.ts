import { readFile } from "node:fs/promises";
import { buildDiscoveryResponse } from "../apps/web/lib/discovery-supply";

export interface DiscoveryGateStock {
  canonical?: string;
  name?: string;
  sector?: string;
  market?: string;
  reason?: string;
  whyShown?: string;
  headline?: string;
  axisHook?: {
    hookText?: string;
  };
}

export interface DiscoveryGatePayload {
  stocks?: DiscoveryGateStock[];
}

export interface DiscoveryGateOptions {
  minCards?: number;
  frontBand?: number;
  maxDuplicateFrontReason?: number;
  famousFrontBlocklist?: readonly string[];
}

export interface DiscoveryGateFinding {
  severity: "critical" | "warn";
  code: string;
  message: string;
  sample?: string;
}

export interface DiscoveryGateResult {
  ok: boolean;
  cardCount: number;
  frontBand: number;
  findings: DiscoveryGateFinding[];
}

const DEFAULT_MIN_CARDS = intFromEnv("DISCOVERY_GATE_MIN_CARDS", 40);
const DEFAULT_FRONT_BAND = intFromEnv("DISCOVERY_GATE_FRONT_BAND", 16);
const DEFAULT_MAX_DUPLICATE_FRONT_REASON = intFromEnv("DISCOVERY_GATE_MAX_DUPLICATE_FRONT_REASON", 3);
const DEFAULT_FAMOUS_FRONT_BLOCKLIST = [
  "삼성전자",
  "SK하이닉스",
  "NAVER",
  "카카오",
  "현대차",
  "기아",
  "LG에너지솔루션",
];

const MARKET_LABEL_PATTERN = /^(?:KOSPI|KOSDAQ|KONEX|코스피|코스닥|코넥스)$/i;
const NO_MATERIAL_PATTERN = /(?:공개\s*재료|뚜렷한\s*재료|원문\s*근거).{0,16}(?:확인\s*안\s*됨|부족|없음|적음)/;
const PRICE_ONLY_PATTERN =
  /(?:오늘\s*)?(?:가격|주가|등락|시총\s*\d+위권).{0,28}[+-]?\d+(?:\.\d+)?%|[+-]?\d+(?:\.\d+)?%\s*(?:움직|상승|하락|강했|약했)/;
const PRICE_ONLY_EXACT_PATTERN = /^오늘 가격이 [+-]?\d+(?:\.\d+)?% 움직였어요\.?$/;
const GENERIC_MOVEMENT_HOOK_PATTERN = /(?:움직였어요|움직임|강하게 움직|먼저 움직|버텼어요|강했어요|약했어요)/;
const FORBIDDEN_ADVICE_PATTERN = /매수|매도|목표가|추천|급등\s*임박|반등\s*예상|곧\s*오른|사야|팔아야|텐베거/i;

export function evaluateDiscoveryPayload(
  payload: DiscoveryGatePayload,
  options: DiscoveryGateOptions = {},
): DiscoveryGateResult {
  const stocks = Array.isArray(payload.stocks) ? payload.stocks : [];
  const minCards = options.minCards ?? DEFAULT_MIN_CARDS;
  const frontBand = Math.min(options.frontBand ?? DEFAULT_FRONT_BAND, stocks.length);
  const maxDuplicateFrontReason = options.maxDuplicateFrontReason ?? DEFAULT_MAX_DUPLICATE_FRONT_REASON;
  const famousFrontBlocklist = options.famousFrontBlocklist ?? DEFAULT_FAMOUS_FRONT_BLOCKLIST;
  const findings: DiscoveryGateFinding[] = [];
  const add = (code: string, message: string, sample?: string, severity: DiscoveryGateFinding["severity"] = "critical") => {
    findings.push({ severity, code, message, ...(sample ? { sample } : {}) });
  };

  if (stocks.length < minCards) {
    add("deck.too_short", `발견 덱 카드 수가 ${stocks.length}장입니다. 재료 없는 카드를 채우지 않는 품질 하한은 ${minCards}장입니다.`);
  }

  const frontStocks = stocks.slice(0, frontBand);
  for (const [index, stock] of frontStocks.entries()) {
    const name = stockName(stock);
    const sector = stock.sector?.trim();
    const hook = visibleHook(stock);
    const allCopy = visibleCopy(stock);

    if (!sector || MARKET_LABEL_PATTERN.test(sector)) {
      add("chip.market_label", `앞단 ${index + 1}번 카드 '${name}'의 칩이 업종/테마가 아닙니다.`, sector ?? "(empty)");
    }

    if (famousFrontBlocklist.includes(name)) {
      add("front.famous_stock", `앞단 ${index + 1}번 카드에 유명주 '${name}'가 들어왔습니다.`, name);
    }

    if (!hook) {
      add("hook.missing", `앞단 ${index + 1}번 카드 '${name}'에 표면 후킹멘트가 없습니다.`);
    }

    if (
      PRICE_ONLY_EXACT_PATTERN.test(hook) ||
      PRICE_ONLY_PATTERN.test(hook) ||
      GENERIC_MOVEMENT_HOOK_PATTERN.test(hook) ||
      NO_MATERIAL_PATTERN.test(hook)
    ) {
      add("hook.price_only", `앞단 ${index + 1}번 카드 '${name}'가 가격-only 또는 움직임 재진술 문장입니다.`, hook);
    }

    if (FORBIDDEN_ADVICE_PATTERN.test(allCopy)) {
      add("copy.forbidden_advice", `앞단 ${index + 1}번 카드 '${name}'에 금칙어가 있습니다.`, allCopy);
    }
  }

  const duplicateReasons = duplicateVisibleHooks(frontStocks);
  for (const [hook, count] of duplicateReasons) {
    if (count > maxDuplicateFrontReason) {
      add(
        "hook.duplicate_front",
        `앞단 카드에서 같은 이유 문장이 ${count}번 반복됩니다.`,
        hook,
        "warn",
      );
    }
  }

  return {
    ok: !findings.some((finding) => finding.severity === "critical"),
    cardCount: stocks.length,
    frontBand,
    findings,
  };
}

function stockName(stock: DiscoveryGateStock): string {
  return (stock.canonical ?? stock.name ?? "unknown").trim();
}

function visibleHook(stock: DiscoveryGateStock): string {
  return (stock.reason ?? stock.whyShown ?? stock.headline ?? stock.axisHook?.hookText ?? "").trim();
}

function visibleCopy(stock: DiscoveryGateStock): string {
  return [stock.reason, stock.whyShown, stock.headline, stock.axisHook?.hookText].filter(Boolean).join(" ").trim();
}

function duplicateVisibleHooks(stocks: readonly DiscoveryGateStock[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const stock of stocks) {
    const hook = visibleHook(stock);
    if (!hook) continue;
    counts.set(hook, (counts.get(hook) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function loadPayload(): Promise<DiscoveryGatePayload> {
  const jsonPath = process.env.DISCOVERY_GATE_JSON;
  if (jsonPath) return JSON.parse(await readFile(jsonPath, "utf8")) as DiscoveryGatePayload;

  const url = process.env.DISCOVERY_GATE_URL;
  if (url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`discovery gate fetch failed: ${response.status}`);
    return (await response.json()) as DiscoveryGatePayload;
  }

  return buildDiscoveryResponse({ targetedMaterial: true });
}

function intFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function printResult(result: DiscoveryGateResult): void {
  console.log(`Discovery regression gate`);
  console.log(`- cards: ${result.cardCount}`);
  console.log(`- front band: ${result.frontBand}`);
  if (result.findings.length === 0) {
    console.log("✅ passed");
    return;
  }
  for (const finding of result.findings) {
    const mark = finding.severity === "critical" ? "❌" : "⚠️";
    console.log(`${mark} [${finding.code}] ${finding.message}`);
    if (finding.sample) console.log(`   sample: ${finding.sample}`);
  }
}

async function main(): Promise<void> {
  const payload = await loadPayload();
  const result = evaluateDiscoveryPayload(payload);
  printResult(result);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("discovery-regression-gate.ts") || process.argv[1]?.endsWith("discovery-regression-gate.js")) {
  main().catch((err) => {
    console.error("[discovery-regression-gate] failed", err);
    process.exitCode = 1;
  });
}

import { buildDiscoveryResponse } from "../apps/web/lib/discovery-supply";

type ReasonKind = "event" | "what" | "honest-empty" | "missing";

interface DiscoveryStockLike {
  canonical?: string;
  name?: string;
  sector?: string;
  reason?: string;
  whyShown?: string;
  headline?: string;
}

interface DiscoveryPayloadLike {
  stocks?: DiscoveryStockLike[];
}

const EVENT_PATTERN =
  /뉴스|공시|계약|수주|공급|실적|가이던스|파트너십|제휴|출시|제품|SEC|DART|외국인|기관|순매수|수급|자사주|소각|인수|매각|합병|투자|증자|상장|승인|허가|임상|개발|클러스터|공장|착공|공급망|협약|MOU|납품|수혜|수출|라이선스|특허/;
const WHAT_PATTERN = /거래가|거래량|평소\s*\d|변동성|종목\s+중|시총\s*\d|오늘\s*[+-]?\d|움직였|강했|셌|동종\s*비교|상대강도|\d+\s*\/\s*\d+/;
const EMPTY_PATTERN = /공개된\s*계기\s*없음|뚜렷한\s*이유|아직\s*안\s*보여|확인되지\s*않았|원문\s*근거|재료\s*확인\s*안/;

function visibleReason(stock: DiscoveryStockLike): string {
  return (stock.reason ?? stock.whyShown ?? stock.headline ?? "").trim();
}

function classify(reason: string): ReasonKind {
  if (!reason) return "missing";
  if (EVENT_PATTERN.test(reason)) return "event";
  if (EMPTY_PATTERN.test(reason)) return "honest-empty";
  if (WHAT_PATTERN.test(reason)) return "what";
  return "what";
}

async function loadPayload(): Promise<DiscoveryPayloadLike> {
  const url = process.env.DISCOVERY_BASELINE_URL;
  if (url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`baseline fetch failed: ${response.status}`);
    return (await response.json()) as DiscoveryPayloadLike;
  }
  return buildDiscoveryResponse({ targetedMaterial: true });
}

async function main(): Promise<void> {
  const payload = await loadPayload();
  const stocks = (payload.stocks ?? []).slice(0, Number(process.env.DISCOVERY_BASELINE_LIMIT ?? 50));
  const counts: Record<ReasonKind, number> = {
    event: 0,
    what: 0,
    "honest-empty": 0,
    missing: 0,
  };

  for (const stock of stocks) {
    counts[classify(visibleReason(stock))] += 1;
  }

  console.log("Discovery reason baseline");
  console.log(`- cards: ${stocks.length}`);
  for (const kind of Object.keys(counts) as ReasonKind[]) {
    const value = counts[kind];
    const pct = stocks.length > 0 ? Math.round((value / stocks.length) * 100) : 0;
    console.log(`- ${kind}: ${value} (${pct}%)`);
  }
  console.log("\nTop samples");
  stocks.slice(0, 12).forEach((stock, index) => {
    const reason = visibleReason(stock);
    console.log(`${String(index + 1).padStart(2, "0")}. ${stock.canonical ?? stock.name ?? "unknown"} [${classify(reason)}] ${reason}`);
  });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

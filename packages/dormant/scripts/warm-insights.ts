/**
 * 뎁스 인사이트 프리워밍 — cold(첫 진입) 제거. PERF LOADING HANDOFF 후속(광혁 결정: cron 프리워밍).
 *
 * 문제: theme/stock-insight 는 첫 산출 시 LLM 20~30초. 영속 캐시(Vercel Data Cache)는 두 번째부터
 *   즉시지만, 그날·그 슬롯의 *첫* 사용자는 cold 를 맞는다.
 * 해결: cron 이 슬롯 시작마다 그날 테마+등장 종목의 endpoint 를 HTTP 로 미리 호출 → Data Cache 를
 *   현재 슬롯 키로 채운다. 사용자는 항상 warm(즉시). 테이블 신설 없음(기존 Data Cache 재사용).
 *   스와이프 피드용 stock-front lite 도 함께 데워 attention/theme-relative 캐시를 피드까지 전달한다.
 *
 * Data Cache 는 Vercel 런타임 안에서만 채워지므로, 로컬 함수 호출이 아니라 *배포 endpoint HTTP 호출*이어야 한다.
 * (종목 목록만 collectThemeStocks 로 추출 — 이건 LLM 없는 룰 기반 수집이라 가볍다.)
 *
 * env: WARM_BASE_URL(배포 API 베이스, 기본 prod). cron: warm-insights.yml(슬롯 시작 09/13/16 KST).
 */
import { SECTORS, stocksBySector, type StockSector } from "@fomo/core";
import { collectThemeStocks } from "../apps/web/lib/theme-understanding";

const BASE = (process.env.WARM_BASE_URL || "https://fomo-club-backend.vercel.app").replace(/\/$/, "");
const MIN_MENTIONS = 2; // 종목 추출 임계(가짜 연관 방지 — 빈도 낮은 종목은 워밍 제외)
const REQ_TIMEOUT_MS = 60_000; // understandTheme/Stock 의 LLM timeout(45s)보다 여유
const DISCOVERY_SECTORS: readonly StockSector[] = SECTORS.filter((sector) => sector !== "코인").slice(0, 6);
const MAX_FRONT_WARM_STOCKS = Number.parseInt(process.env["WARM_FRONT_STOCK_LIMIT"] ?? "60", 10);
const MAX_DEPTH_WARM_STOCKS = Number.parseInt(process.env["WARM_DEPTH_STOCK_LIMIT"] ?? "24", 10);
const DRY_RUN = process.env["WARM_DRY_RUN"] === "1";

async function warm(path: string, opts: { blocking?: boolean } = {}): Promise<void> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: opts.blocking ? { "x-warm": "1" } : undefined,
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    const fallback = res.headers.get("x-fomo-cold-fallback") === "1" ? " fallback" : "";
    console.log(`  ${res.ok ? "✓" : "✗"} ${res.status}${fallback} ${Date.now() - t0}ms  ${path}`);
  } catch (err) {
    console.warn(`  ✗ ERR ${Date.now() - t0}ms  ${path} — ${(err as Error)?.message}`);
  }
}

function addStock(out: Map<string, string>, stock: string, reason: string): void {
  const key = stock.trim();
  if (!key || out.has(key)) return;
  out.set(key, reason);
}

async function main() {
  console.log(`[warm-insights] base=${BASE}`);
  if (DRY_RUN) {
    const dryStocks = new Map<string, string>();
    for (const sector of DISCOVERY_SECTORS) {
      for (const stock of stocksBySector(sector, { requireNaverCode: true }).slice(0, 8)) {
        addStock(dryStocks, stock.canonical, stock.marquee ? `marquee:${sector}` : `sector:${sector}`);
      }
    }
    console.log(`[warm-insights] dry-run sectors=${DISCOVERY_SECTORS.join(", ")}`);
    console.log(`[warm-insights] dry-run stocks=${[...dryStocks.keys()].slice(0, MAX_DEPTH_WARM_STOCKS).join(", ")}`);
    return;
  }

  // 1) 그날 키워드 테마 목록(배포 endpoint — 같은 캐시를 공유한다).
  const kwRes = await fetch(`${BASE}/api/fomo/keywords`, { signal: AbortSignal.timeout(REQ_TIMEOUT_MS) });
  const kw = (await kwRes.json()) as { cards?: { keyword: string; surpriseStock?: { canonical?: string } }[] };
  const keywordCards = kw.cards ?? [];
  const themes = [...new Set(keywordCards.map((c) => c.keyword).filter(Boolean))];
  console.log(`[warm-insights] 테마 ${themes.length}개: ${themes.join(", ")}`);

  // 2) 테마 뎁스 워밍 + 그 테마에 등장한 종목 수집.
  const stocks = new Map<string, string>();
  for (const card of keywordCards) {
    if (card.surpriseStock?.canonical) addStock(stocks, card.surpriseStock.canonical, `surprise:${card.keyword}`);
  }
  for (const theme of themes) {
    await warm(`/api/fomo/theme-insight?theme=${encodeURIComponent(theme)}`);
    try {
      const extracted = await collectThemeStocks(theme, { minMentions: MIN_MENTIONS });
      for (const s of extracted) addStock(stocks, s.canonical, `theme:${theme}`);
    } catch (err) {
      console.warn(`  종목 추출 실패: ${theme} — ${(err as Error)?.message}`);
    }
  }

  // 3) 오늘 발견 덱 콜드스타트 후보까지 추가. 키워드에서 뽑힌 종목만 데우면 대표주/섹터 첫 카드가 비어 보일 수 있다.
  for (const sector of DISCOVERY_SECTORS) {
    for (const stock of stocksBySector(sector, { requireNaverCode: true }).slice(0, 8)) {
      addStock(stocks, stock.canonical, stock.marquee ? `marquee:${sector}` : `sector:${sector}`);
    }
  }

  // 4) 피드 카드용 stock-front lite 워밍 — 신호 캐시(attention/theme-relative)를 먼저 채운다.
  const stockList = [...stocks.keys()].slice(0, MAX_FRONT_WARM_STOCKS);
  const depthStockList = [...stocks.keys()].slice(0, MAX_DEPTH_WARM_STOCKS);
  console.log(`[warm-insights] 종목 ${stockList.length}개(front): ${stockList.join(", ")}`);
  console.log(`[warm-insights] 종목 ${depthStockList.length}개(depth): ${depthStockList.join(", ")}`);
  for (const stock of stockList) {
    await warm(`/api/fomo/stock-front?stock=${encodeURIComponent(stock)}&lite=1`);
  }

  // 5) 뎁스 워밍: blocking 으로 Data Cache 를 채운 뒤 일반 URL 도 호출해 화면 경로의 CDN 캐시를 성공 응답으로 채운다.
  for (const stock of depthStockList) {
    const path = `/api/fomo/stock-insight?stock=${encodeURIComponent(stock)}`;
    await warm(`${path}&blocking=1`, { blocking: true });
    await warm(path);
  }

  console.log(`[warm-insights] 완료 — 테마 ${themes.length} + front ${stockList.length} + depth ${depthStockList.length} 워밍`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[warm-insights] 실패", err);
    process.exit(1);
  });

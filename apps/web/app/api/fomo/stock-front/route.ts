import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { computeFomoScore, resolveStock, sectorOf, type StockSector } from "@fomo/core";
import { assembleStockFront, fetchMarketCapRankMap, type StockFrontData } from "../../../../lib/stock-front";
import {
  computeStockAttentionSignals,
  computeThemeRelativeSignals,
  type StockAttentionSignal,
  type ThemeRelativeSignal,
} from "../../../../lib/stock-signal-coverage";

/**
 * 카드 앞면 FOMO 신호 — PHASE0 rev2 후속. baseline(가격·52주) + 라이브 수급 streak + 시총순위 + 스파크라인.
 * 덱이 도달 종목에 lazy 로 부른다(비용 방어). 헤드라인 선택은 selectFomoHook(@fomo/core)가 클라에서.
 * 순수 데이터(LLM 0) — 네이버 금융 + 수급 누적 테이블. 일 단위 캐시(가격은 장중 갱신 위해 짧게).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const REVALIDATE_S = 600; // 10분 — 가격·수급은 자주 안 변함, 캐시로 비용 방어

/** 시총 순위 맵 — 하루 1회만 새로(랭킹은 장중 거의 불변, 무거운 페치). */
async function getRankMap(): Promise<Record<string, { market: string; rank: number }>> {
  const load = unstable_cache(async () => fetchMarketCapRankMap(), ["fomo-marketcap-rank", cacheVersion(), kstDate()], {
    revalidate: 60 * 60 * 12,
  });
  return load();
}

async function getAttentionMap(): Promise<Record<string, StockAttentionSignal>> {
  const load = unstable_cache(
    async () => computeStockAttentionSignals(),
    ["fomo-stock-attention", cacheVersion(), kstDate()],
    { revalidate: 1800 }
  );
  return load();
}

async function getThemeRelativeMap(sector: StockSector): Promise<Record<string, ThemeRelativeSignal>> {
  const load = unstable_cache(
    async () => computeThemeRelativeSignals(sector),
    ["fomo-theme-relative", cacheVersion(), kstDate(), sector],
    { revalidate: 1800 }
  );
  return load();
}

async function getFront(stock: string, lite = false): Promise<StockFrontData> {
  const today = kstDate();
  const load = unstable_cache(
    async () => {
      const def = resolveStock(stock);
      const canonical = def?.canonical ?? stock;
      const sector = def ? sectorOf(def.canonical) : undefined;
      const [rankMap, attentionMap, themeRelativeMap] = await Promise.all([
        lite ? Promise.resolve({}) : getRankMap().catch(() => ({})),
        lite ? Promise.resolve({} as Record<string, StockAttentionSignal>) : getAttentionMap().catch((): Record<string, StockAttentionSignal> => ({})),
        !lite && sector
          ? getThemeRelativeMap(sector).catch((): Record<string, ThemeRelativeSignal> => ({}))
          : Promise.resolve({} as Record<string, ThemeRelativeSignal>),
      ]);
      return assembleStockFront(stock, rankMap, {
        ...(attentionMap[canonical] ? { attention: attentionMap[canonical] } : {}),
        ...(themeRelativeMap[canonical] ? { themeRelative: themeRelativeMap[canonical] } : {}),
      }, { lite });
    },
    ["fomo-stock-front", lite ? "lite" : "full", cacheVersion(), today, stock],
    { revalidate: REVALIDATE_S }
  );
  return load();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const stock = url.searchParams.get("stock")?.trim();
  const lite = url.searchParams.get("lite") === "1";
  if (!stock) {
    return withCors(NextResponse.json({ error: "stock required" }, { status: 400 }));
  }
  try {
    const data = await getFront(stock, lite);
    return withCors(
      NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
      })
    );
  } catch (err) {
    console.warn("[stock-front] failed", stock, (err as Error)?.message);
    // 정직한 폴백 — 신호 없이도 카드는 잠잠(점수 보류)으로 뜬다.
    return withCors(
      NextResponse.json({ signals: {}, fomo: computeFomoScore({}), sparkline: [] } satisfies StockFrontData)
    );
  }
}

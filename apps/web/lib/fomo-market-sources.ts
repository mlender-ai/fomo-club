import {
  yahooChange,
  twelveDataChange,
  parseNaverIndexQuote,
  type MacroQuote,
  type WhaleInput,
} from "@fomo/core";

/**
 * FOMO 시장 데이터 수집 공용부 — banner(롤링 배너)와 feed(감정 치환 피드)가 공유한다.
 *
 * - macro: 1차 Twelve Data(키 있을 때 batch 1콜) → **네이버 금융 지수**(Node에서 안정) → Yahoo(폴백).
 *   ⚠️ Yahoo chart는 Node/undici fetch에 429를 준다(2026-06, curl만 통과) → Vercel·로컬 dev 모두 전멸.
 *   그래서 네이버를 키 없이 동작하는 1차 폴백으로 둔다(국내+해외 지수 모두 커버, 등락률 제공).
 * - whale: CoinGecko global + top10 markets.
 * 정직한 숫자 원칙: 실측값만, 결측은 생략.
 */

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// 호스트 2개 폴백 — 한쪽이 스로틀(429/빈응답)이면 다른 쪽 시도.
const YAHOO_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

// symbol: Yahoo chart 심볼(최후 폴백). td: Twelve Data `/quote` 심볼(1차, 키 필요).
// naver: 네이버 금융 지수 심볼 — 국내(KOSPI/KOSDAQ)는 m.stock, 해외(.IXIC 등)는 api.stock.
type NaverScope = "domestic" | "world";
export const INDICES: {
  key: MacroQuote["key"];
  label: string;
  symbol: string;
  td: string;
  naver: string;
  naverScope: NaverScope;
}[] = [
  { key: "kospi", label: "코스피", symbol: "^KS11", td: "KS11", naver: "KOSPI", naverScope: "domestic" },
  { key: "kosdaq", label: "코스닥", symbol: "^KQ11", td: "KQ11", naver: "KOSDAQ", naverScope: "domestic" },
  { key: "spx", label: "S&P500", symbol: "^GSPC", td: "GSPC", naver: ".INX", naverScope: "world" },
  { key: "ndq", label: "나스닥", symbol: "^IXIC", td: "IXIC", naver: ".IXIC", naverScope: "world" },
  { key: "sox", label: "필라델피아 반도체", symbol: "^SOX", td: "SOX", naver: ".SOX", naverScope: "world" },
];

const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * 네이버 금융 지수 1개 → {change(%), close, tradedAt?}. 실패 시 null.
 * fresh: 크론(브리핑 빌드) 경로 — 캐시 우회 강제. SWR 스테일 서빙이 전 거래일 데이터를
 * "오늘"로 발행시킨 2026-07-13 사건 방지. 요청 경로는 기존 5분 캐시 유지(레이트리밋 보호).
 */
export async function fetchNaverIndex(
  naver: string,
  scope: NaverScope,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<{ change: number; close: number; tradedAt?: string } | null> {
  const url =
    scope === "domestic"
      ? `https://m.stock.naver.com/api/index/${encodeURIComponent(naver)}/basic`
      : `https://api.stock.naver.com/index/${encodeURIComponent(naver)}/basic`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": NAVER_UA },
      signal: AbortSignal.timeout(8_000),
      // fresh: 캐시 우회(no-store) / 기본: 5분 데이터 캐시 — 레이트리밋 보호.
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
    });
    if (!res.ok) return null;
    return parseNaverIndexQuote(await res.json());
  } catch (err) {
    console.warn(`[fomo/sources] naver ${naver} error`, err);
    return null;
  }
}

/**
 * 한 심볼의 일봉 종가 배열. query1→query2 폴백. 실패 시 null.
 * ⚠️ Yahoo는 Node/Vercel에서 간헐적 429 — 호출부는 폴백/숫자카드를 항상 준비할 것.
 */
export async function fetchIndexCloses(
  symbol: string,
  range = "5d"
): Promise<(number | null)[] | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d`;
      // no-store: 스로틀/빈 응답을 데이터 캐시에 박지 않는다. 레이트리밋 보호는 라우트 s-maxage.
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": YAHOO_UA },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
      };
      const closes = payload.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (closes && closes.length > 0) return closes;
    } catch {
      // 다음 호스트로
    }
  }
  return null;
}

/**
 * Twelve Data `/quote` batch — 5개 지수를 1콜에(무료 800req/day). 키 없으면 빈 맵.
 */
async function fetchMacroTwelveData(): Promise<
  Map<MacroQuote["key"], { change: number; close: number }>
> {
  const out = new Map<MacroQuote["key"], { change: number; close: number }>();
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return out;
  try {
    const symbols = INDICES.map((s) => s.td).join(",");
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      // 5분 데이터 캐시 — 무료 일일쿼터·레이트리밋 보호.
      next: { revalidate: 300 },
    });
    if (!res.ok) return out;
    const payload = (await res.json()) as Record<string, unknown> & { status?: string };
    // batch(>1심볼)는 심볼 키 객체, 단일은 quote 객체 자체.
    const pick = (td: string): Parameters<typeof twelveDataChange>[0] => {
      const byKey = (payload as Record<string, unknown>)[td];
      if (byKey && typeof byKey === "object") return byKey as Parameters<typeof twelveDataChange>[0];
      if (INDICES.length === 1) return payload as Parameters<typeof twelveDataChange>[0];
      return null;
    };
    for (const s of INDICES) {
      const parsed = twelveDataChange(pick(s.td));
      if (parsed) out.set(s.key, parsed);
    }
  } catch (err) {
    console.warn("[fomo/sources] twelvedata error", err);
  }
  return out;
}

/**
 * 거시 지수 변화율 수집. 소스 우선순위: Twelve Data(키) → 네이버 → Yahoo.
 * 네이버/Yahoo 폴백은 지수별 병렬 — Yahoo 순차 누적 타임아웃(함수 데드라인) 회피.
 * fresh(크론 브리핑 경로): Twelve Data 건너뛰고 네이버 no-store 직행 — 지연·캐시 데이터가
 * "오늘"로 발행되는 것 방지(2026-07-13 사건). tradedAt 있는 소스(네이버)는 그대로 전달.
 */
export async function fetchMacro({ fresh = false }: { fresh?: boolean } = {}): Promise<MacroQuote[]> {
  const td = fresh ? new Map<MacroQuote["key"], { change: number; close: number }>() : await fetchMacroTwelveData();

  const settled = await Promise.allSettled(
    INDICES.map(async (s): Promise<MacroQuote | null> => {
      const hit = td.get(s.key);
      if (hit) return { key: s.key, label: s.label, change: hit.change, close: hit.close };

      // Twelve Data 누락(키 없음 포함) → 네이버(Node에서 안정) → Yahoo(429 가능).
      const naver = await fetchNaverIndex(s.naver, s.naverScope, { fresh });
      if (naver)
        return {
          key: s.key,
          label: s.label,
          change: naver.change,
          close: naver.close,
          ...(naver.tradedAt ? { tradedAt: naver.tradedAt } : {}),
        };

      const closes = await fetchIndexCloses(s.symbol);
      const parsed = closes ? yahooChange(closes) : null;
      if (parsed) return { key: s.key, label: s.label, change: parsed.change, close: parsed.close };

      console.warn(`[fomo/sources] macro miss ${s.symbol} (td+naver+yahoo)`);
      return null;
    })
  );

  const quotes: MacroQuote[] = [];
  for (const r of settled) if (r.status === "fulfilled" && r.value) quotes.push(r.value);
  return quotes;
}

/** CoinGecko 시장 신호. */
export async function fetchWhale(): Promise<WhaleInput> {
  try {
    const [globalRes, marketsRes] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/global", { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) }),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h",
        { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) }
      ),
    ]);

    let marketCapChange24h: number | null = null;
    if (globalRes.status === "fulfilled" && globalRes.value.ok) {
      const g = (await globalRes.value.json()) as {
        data?: { market_cap_change_percentage_24h_usd?: number };
      };
      const mc = g.data?.market_cap_change_percentage_24h_usd;
      if (typeof mc === "number") marketCapChange24h = mc;
    }

    let coins: WhaleInput["coins"] = [];
    if (marketsRes.status === "fulfilled" && marketsRes.value.ok) {
      const raw = (await marketsRes.value.json()) as {
        name: string;
        symbol: string;
        price_change_percentage_24h: number | null;
        ath_change_percentage: number | null;
      }[];
      coins = raw.map((c) => ({
        name: c.name,
        symbol: c.symbol,
        change24h: c.price_change_percentage_24h,
        athChange: c.ath_change_percentage,
      }));
    }
    return { marketCapChange24h, coins };
  } catch (err) {
    console.warn("[fomo/sources] coingecko error", err);
    return { marketCapChange24h: null, coins: [] };
  }
}

import { assembleStockBasics, parseNaverStockBasic, resolveStock, type StockBasics } from "@fomo/core";

/**
 * 종목 기본 정보(바닥) 수집 — STOCK_SCREEN_REDESIGN §2.
 * 출처: 네이버 금융 종목 API(m.stock.naver.com/api/stock/{code}/*) — 이미 쓰는 무료·무인증 출처.
 *   · basic         → 주가·등락·시장
 *   · integration   → 시총·PER/EPS/PBR/배당/52주
 *   · finance/annual→ 회사개요·연간 매출/영업이익/순이익(추정치 구분)
 * 종목명 → 코드: STOCK_VOCAB(resolveStock).naverCode 재사용. 코드 없으면(미국주 등) 기본만(정직).
 * 파싱·번역은 fomo-core 순수부(assembleStockBasics). 여긴 fetch·조립만.
 */

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn("[stock-basics] non-OK", res.status, url);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[stock-basics] fetch failed", url, (err as Error)?.message);
    return null;
  }
}

/** 카드 앞면 lite용 — 주가·등락만 짧게 가져온다. 상세 지표/재무/개요는 depth API가 맡는다. */
export async function fetchStockBasicsLite(stock: string, timeoutMs = 3500): Promise<StockBasics> {
  const def = resolveStock(stock);
  const code = def?.naverCode;
  if (!code) return { name: def?.canonical ?? stock, metrics: [] };

  const base = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}`;
  const basic = await getJson(`${base}/basic`, timeoutMs);
  const parsed = parseNaverStockBasic(basic);
  return {
    name: parsed.name || def?.canonical || stock,
    ...(parsed.market ? { market: parsed.market } : {}),
    ...(parsed.priceText ? { priceText: parsed.priceText } : {}),
    ...(parsed.changeText ? { changeText: parsed.changeText } : {}),
    ...(parsed.changeDir ? { changeDir: parsed.changeDir } : {}),
    metrics: [],
  };
}

/** 종목명으로 기본 정보. 코드 해석 실패(미등록/미국주) → name 만(빈 화면 대신 최소 보장). */
export async function fetchStockBasics(stock: string): Promise<StockBasics> {
  const def = resolveStock(stock);
  const code = def?.naverCode;
  if (!code) {
    // 국내 코드 없음 → 네이버 종목 API 경로 없음. 정직하게 이름만(상위에서 수급/해석으로 보완).
    return { name: def?.canonical ?? stock, metrics: [] };
  }
  const base = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}`;
  const [basic, integration, finance] = await Promise.all([
    getJson(`${base}/basic`),
    getJson(`${base}/integration`),
    getJson(`${base}/finance/annual`),
  ]);
  return assembleStockBasics(def?.canonical ?? stock, basic, integration, finance);
}

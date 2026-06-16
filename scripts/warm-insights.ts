/**
 * 뎁스 인사이트 프리워밍 — cold(첫 진입) 제거. PERF LOADING HANDOFF 후속(광혁 결정: cron 프리워밍).
 *
 * 문제: theme/stock-insight 는 첫 산출 시 LLM 20~30초. 영속 캐시(Vercel Data Cache)는 두 번째부터
 *   즉시지만, 그날·그 슬롯의 *첫* 사용자는 cold 를 맞는다.
 * 해결: cron 이 슬롯 시작마다 그날 테마+등장 종목의 endpoint 를 HTTP 로 미리 호출 → Data Cache 를
 *   현재 슬롯 키로 채운다. 사용자는 항상 warm(즉시). 테이블 신설 없음(기존 Data Cache 재사용).
 *
 * Data Cache 는 Vercel 런타임 안에서만 채워지므로, 로컬 함수 호출이 아니라 *배포 endpoint HTTP 호출*이어야 한다.
 * (종목 목록만 collectThemeStocks 로 추출 — 이건 LLM 없는 룰 기반 수집이라 가볍다.)
 *
 * env: WARM_BASE_URL(배포 API 베이스, 기본 prod). cron: warm-insights.yml(슬롯 시작 09/13/16 KST).
 */
import { collectThemeStocks } from "../apps/web/lib/theme-understanding";

const BASE = (process.env.WARM_BASE_URL || "https://taro-stock-web.vercel.app").replace(/\/$/, "");
const MIN_MENTIONS = 2; // 종목 추출 임계(가짜 연관 방지 — 빈도 낮은 종목은 워밍 제외)
const REQ_TIMEOUT_MS = 60_000; // understandTheme/Stock 의 LLM timeout(45s)보다 여유

async function warm(path: string): Promise<void> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-warm": "1" },
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    console.log(`  ${res.ok ? "✓" : "✗"} ${res.status} ${Date.now() - t0}ms  ${path}`);
  } catch (err) {
    console.warn(`  ✗ ERR ${Date.now() - t0}ms  ${path} — ${(err as Error)?.message}`);
  }
}

async function main() {
  console.log(`[warm-insights] base=${BASE}`);

  // 1) 그날 키워드 테마 목록(배포 endpoint — 같은 캐시를 공유한다).
  const kwRes = await fetch(`${BASE}/api/fomo/keywords`, { signal: AbortSignal.timeout(REQ_TIMEOUT_MS) });
  const kw = (await kwRes.json()) as { cards?: { keyword: string }[] };
  const themes = [...new Set((kw.cards ?? []).map((c) => c.keyword).filter(Boolean))];
  console.log(`[warm-insights] 테마 ${themes.length}개: ${themes.join(", ")}`);

  // 2) 테마 뎁스 워밍 + 그 테마에 등장한 종목 수집.
  const stocks = new Set<string>();
  for (const theme of themes) {
    await warm(`/api/fomo/theme-insight?theme=${encodeURIComponent(theme)}`);
    try {
      const extracted = await collectThemeStocks(theme, { minMentions: MIN_MENTIONS });
      for (const s of extracted) stocks.add(s.canonical);
    } catch (err) {
      console.warn(`  종목 추출 실패: ${theme} — ${(err as Error)?.message}`);
    }
  }

  // 3) 그날 등장 종목 뎁스 워밍(가장 느렸던 경로 — cold 33초의 주범).
  const stockList = [...stocks];
  console.log(`[warm-insights] 종목 ${stockList.length}개: ${stockList.join(", ")}`);
  for (const stock of stockList) {
    await warm(`/api/fomo/stock-insight?stock=${encodeURIComponent(stock)}`);
  }

  console.log(`[warm-insights] 완료 — 테마 ${themes.length} + 종목 ${stockList.length} 워밍`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[warm-insights] 실패", err);
    process.exit(1);
  });

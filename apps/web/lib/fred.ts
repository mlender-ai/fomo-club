import { parseFredCsvLatest, buildFredDoc, FRED_SERIES, type SourceDoc } from "@fomo/core";

/**
 * FRED 수집 — DATA_ENGINE_STRATEGY §4.5 C-2. (네트워크)
 *
 * 기본은 **키리스 공개 엔드포인트**(fredgraph.csv) — API 키 없이 동작.
 * FRED_API_KEY 가 있으면 공식 JSON API 로 업그레이드(더 견고). 둘 다 실패 시 빈 배열(정직한 폴백).
 *
 * 키리스 CSV 는 전체 히스토리가 커서 타임아웃 → cosd(최근 시작일)로 구간 제한.
 */

const FRED_API_KEY = process.env["FRED_API_KEY"] ?? "";
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";
/** 최근 N일만 — 월간(FEDFUNDS/CPI)도 충분히 커버하면서 페이로드를 작게. */
const LOOKBACK_DAYS = 150;

/** 테마 → FRED 시리즈. 지금은 금리(거시)만 — 다른 테마는 FRED 근거 없음. */
const FRED_THEME_SERIES: Record<string, string[]> = {
  금리: ["FEDFUNDS", "DGS10", "DGS2"],
};

function cosd(): string {
  const d = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(d); // YYYY-MM-DD
}

/** 키리스 CSV 경로. 실패 시 null. */
async function fetchCsvLatest(seriesId: string): Promise<{ date: string; value: number } | null> {
  try {
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}&cosd=${cosd()}`;
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/csv,*/*" },
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return parseFredCsvLatest(await res.text());
  } catch (err) {
    console.warn(`[fred] csv ${seriesId} error`, err);
    return null;
  }
}

interface FredJsonResp {
  observations?: { date: string; value: string }[];
}

/** 키 있을 때 공식 JSON API(더 견고). 실패 시 null → CSV 폴백. */
async function fetchJsonLatest(seriesId: string): Promise<{ date: string; value: number } | null> {
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}` +
      `&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=10&observation_start=${cosd()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as FredJsonResp;
    for (const o of data.observations ?? []) {
      const v = Number.parseFloat(o.value);
      if (Number.isFinite(v)) return { date: o.date, value: v };
    }
    return null;
  } catch (err) {
    console.warn(`[fred] json ${seriesId} error`, err);
    return null;
  }
}

/** 테마의 FRED 공식 데이터 SourceDoc[]. idStart 부터 id 부여(S{n}). 미매핑/실패 시 빈 배열. */
export async function fetchFredDocs(theme: string, makeId: () => string): Promise<SourceDoc[]> {
  const series = FRED_THEME_SERIES[theme];
  if (!series || series.length === 0) return [];

  const settled = await Promise.allSettled(
    series.map(async (s) => {
      // 키 있으면 JSON 우선, 실패하면 키리스 CSV 로 폴백.
      const obs = (FRED_API_KEY && (await fetchJsonLatest(s))) || (await fetchCsvLatest(s));
      return obs ? { seriesId: s, obs } : null;
    })
  );

  const docs: SourceDoc[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value && FRED_SERIES[r.value.seriesId]) {
      const doc = buildFredDoc(makeId(), r.value.seriesId, r.value.obs);
      if (doc) docs.push(doc);
    }
  }
  return docs;
}

/**
 * WO-RESET-08 §E-3 — **국내 업종 분류표.** 자금 흐름 카드의 전제다.
 *
 * ## 왜 이게 먼저인가
 *
 * WO 가 못을 박았다: *"업종 흐름 카드는 분류가 틀리면 통째로 거짓이 된다."*
 * 그래서 카드를 만들기 전에 분류부터 쟀고, 결과가 이랬다(2026-08-28 실측, 유니버스 809):
 *
 * ```
 * 큐레이션 사전(sectorOf)   66종목  8.2%   ← 그나마 **테마**다(반도체·방산·AI·코인…)
 * 시세 행 업종힌트           0종목  0.0%
 * 분류 없음                743종목 91.8%   ← 삼성생명·KB금융·신한지주…
 * ```
 *
 * **8%로는 시장 자금 흐름을 말할 수 없다.** 게다가 그 8%의 라벨에 `코인` 이 들어 있는데,
 * 그건 회사의 업종이 아니라 오늘의 테마다 — `한화투자증권 = 코인` 사고의 원인이 그것이었다.
 *
 * ## 진짜 분류표가 있었다
 *
 * 네이버가 **업종 79개**와 업종별 종목 목록을 준다. 업종 하나당 한 번씩, 총 ~83번의 요청으로
 * 국내 상장 전체의 분류를 얻는다. 종목마다 조회하면 809번인데, 업종에서 훑으면 83번이다.
 *
 * 이건 **테마가 아니라 산업분류**다(`반도체와반도체장비` · `건강관리업체및서비스` · `은행`).
 */

const NAVER_INDUSTRY = "https://m.stock.naver.com/api/stocks/industry";
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
};

/** 업종 하나. */
export interface SectorGroup {
  /** 네이버 업종 번호 — 이름이 바뀌어도 이 번호는 유지된다. */
  no: number;
  name: string;
}

export interface SectorMap {
  asOf: string;
  /** 종목코드 → 업종명. **이게 정본이다.** */
  byCode: Record<string, string>;
  /** 업종명 → 종목 수. 얇은 업종을 집계에서 뺄 때 쓴다. */
  counts: Record<string, number>;
  groups: SectorGroup[];
  errors: string[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 업종 목록 — 페이지를 끝까지 넘긴다(한 페이지 20개, 총 79개). */
export async function fetchSectorGroups(): Promise<SectorGroup[]> {
  const out: SectorGroup[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= 10; page += 1) {
    const data = await fetchJson<{ groups?: Array<{ no?: number; name?: string }>; totalCount?: number }>(
      `${NAVER_INDUSTRY}?page=${page}&pageSize=20`
    );
    const groups = data?.groups ?? [];
    if (groups.length === 0) break;
    for (const g of groups) {
      if (typeof g.no !== "number" || !g.name?.trim() || seen.has(g.no)) continue;
      seen.add(g.no);
      out.push({ no: g.no, name: g.name.trim() });
    }
    if (typeof data?.totalCount === "number" && out.length >= data.totalCount) break;
  }
  return out;
}

/** 업종 하나의 종목 목록. 한 업종이 100종목을 넘으면 페이지를 넘긴다. */
export async function fetchSectorStocks(no: number): Promise<string[]> {
  const codes: string[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const data = await fetchJson<{ stocks?: Array<{ itemCode?: string }>; totalCount?: number }>(
      `${NAVER_INDUSTRY}/${no}?page=${page}&pageSize=100`
    );
    const stocks = data?.stocks ?? [];
    if (stocks.length === 0) break;
    for (const s of stocks) {
      const code = s.itemCode?.trim();
      if (code && /^\d{6}$/.test(code)) codes.push(code);
    }
    if (stocks.length < 100) break;
  }
  return codes;
}

/** 요청 사이 간격 — 네이버를 몰아치지 않는다(시세 수집과 같은 예의). */
const GAP_MS = 60;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 전체 분류표를 만든다.
 *
 * 한 종목이 여러 업종에 나오면 **먼저 만난 업종**을 쓴다 — 뒤엣것으로 덮으면 실행마다
 * 값이 달라져 흐름 집계가 흔들린다.
 */
export async function buildSectorMap(today: string): Promise<SectorMap> {
  const errors: string[] = [];
  const groups = await fetchSectorGroups();
  if (groups.length === 0) errors.push("naver: 업종 목록 조회 실패");

  const byCode: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const group of groups) {
    await sleep(GAP_MS);
    const codes = await fetchSectorStocks(group.no);
    if (codes.length === 0) { errors.push(`naver: 업종 ${group.name}(${group.no}) 종목 0`); continue; }
    for (const code of codes) {
      if (byCode[code]) continue;
      byCode[code] = group.name;
      counts[group.name] = (counts[group.name] ?? 0) + 1;
    }
  }
  return { asOf: today, byCode, counts, groups, errors };
}

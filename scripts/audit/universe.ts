/**
 * WO-SUB-00 감사 공용 — 표본 추출.
 *
 * 원칙: 표본은 **우리 카드 유니버스에서** 무작위로 뽑는다. 유명 종목을 임의로 넣으면
 * 커버리지가 실제보다 좋아 보인다(WO-SUB-00 §8 실패 모드).
 * 시드를 고정해 재실행 시 동일 표본이 나오게 한다.
 */

export const AUDIT_SEED = 20260727;

/** mulberry32 — 시드 고정 PRNG(재현성). Math.random 사용 금지. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, 시드 고정. 입력을 변형하지 않는다. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface UniverseEntry {
  canonical: string;
  country: "KR" | "US";
  symbol?: string;
  naverCode?: string;
  /** 어디서 왔는지 — 발행 카드(published)인지 정적 유니버스(static)인지. */
  origin: "published" | "static";
  /** 발행 카드인 경우 발행일. */
  publishedAt?: string;
}

interface ScorecardPick {
  canonical: string;
  symbol?: string;
  naverCode?: string;
  country?: string;
  date: string;
}

/**
 * 실제 발행된 카드 목록(성적표 API). 이것이 **진짜 유니버스**다 —
 * 정적 심볼 리스트(US_DISCOVERY_SYMBOLS)는 큐레이션된 유명주 위주라 롱테일을 대표하지 못한다.
 */
export async function fetchPublishedUniverse(baseUrl: string, timeoutMs = 20_000): Promise<UniverseEntry[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/fomo/track-record/picks`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`track-record/picks ${res.status}`);
  const json = (await res.json()) as { picks?: ScorecardPick[] };
  const seen = new Set<string>();
  const out: UniverseEntry[] = [];
  for (const pick of json.picks ?? []) {
    const key = pick.canonical.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      canonical: key,
      country: pick.country === "US" ? "US" : "KR",
      ...(pick.symbol ? { symbol: pick.symbol } : {}),
      ...(pick.naverCode ? { naverCode: pick.naverCode } : {}),
      origin: "published",
      publishedAt: pick.date,
    });
  }
  return out;
}

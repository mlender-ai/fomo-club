/**
 * WO-SUB-02R PART A — 시장 분포 실측.
 *
 * ## 왜 이 스크립트가 따로 있는가
 *
 * 02R 규칙 1: **발행된 카드에서 유형을 도출하지 않는다.** 현재 `loadFundamentalsUniverse()` 는
 * 원장의 발행 종목(365일)에서 유니버스를 만드는데, 그건 수급 신호 엔진이 고른 표본이라
 * 시장 분포가 아니다. 게다가 그 엔진의 입력 자체가 KR 상위 1,000 / US 상위 500 으로 잘려 있다.
 * 편향된 표본에서 유형을 도출하면 카탈로그가 그 편향을 그대로 물려받는다.
 *
 * 그래서 시장 전체를 따로 긁는다.
 *
 * ## 확보 경로 (2026-08-01 구조 실측)
 *
 * | 시장 | 경로 | 콜 수 | 얻는 것 |
 * |---|---|---|---|
 * | KR | `m.stock.naver.com/api/stocks/industry` 79그룹 → 그룹별 구성종목 | ~79 + 페이지 | 종목·업종·시총(원)·거래소 |
 * | US | `api.nasdaq.com/api/screener/stocks?download=true` | **1** | 심볼·섹터·업종·시총(USD) |
 *
 * KR 업종 그룹 순회 하나로 로스터·업종·시총·시장구분이 **동시에** 나온다. 시총을 종목별로
 * 다시 묻지 않아도 된다 — `marketValueRaw` 가 목록 응답에 이미 들어 있다(파서가 버리고 있었다).
 *
 * ## 단위 함정
 *
 * `marketValue`(문자열)는 **억원**, `marketValueRaw` 는 **원**이다. 어제 `accumulatedTradingValue`
 * 를 백만원인 줄 모르고 원으로 읽어 유동성 게이트가 삼성전자까지 걸러낸 사고가 있었다.
 * 같은 계열의 함정이라 **Raw 만 쓴다.**
 *
 * 실행: npx tsx scripts/archetype/market-distribution.ts --out docs/archetype
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json" } as const;
const TIMEOUT_MS = 25_000;
const PAGE_SIZE = 100;

/**
 * 층화 표본 시드. **고정값이다** — 02R A-2 가 재현 가능성을 요구한다.
 * 바꾸면 표본이 바뀌므로 문서의 표본 설계도 함께 갱신해야 한다.
 */
const SAMPLE_SEED = 20260801;
/** 목표 표본 크기(A-2: 300종목 내외). */
const SAMPLE_TARGET = 300;
/** 층당 최소 표본 — 층이 비면 그 층의 분포를 말할 수 없다. */
const MIN_PER_STRATUM = 3;

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** 결정론 PRNG. `Math.random()` 은 재현 불가라 쓰지 않는다. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MarketRow {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ" | "KONEX" | "NASDAQ" | "NYSE" | "AMEX" | "기타";
  country: "KR" | "US";
  /** 원통화 시총. 환산하지 않는다(WO-SUB-01 §4 규칙 3). */
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
}

interface NaverGroup {
  no: number;
  name: string;
  totalCount: number;
}

interface NaverStock {
  itemCode?: string;
  stockName?: string;
  marketValueRaw?: string | number;
  stockEndType?: string;
  stockExchangeType?: { name?: string; nameEng?: string };
}

function numberOf(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function krMarketOf(raw: NaverStock): MarketRow["market"] {
  const name = raw.stockExchangeType?.nameEng ?? raw.stockExchangeType?.name ?? "";
  if (/KOSPI/i.test(name)) return "KOSPI";
  if (/KOSDAQ/i.test(name)) return "KOSDAQ";
  if (/KONEX/i.test(name)) return "KONEX";
  return "기타";
}

/** KR 전수 — 업종 79그룹을 순회한다. 그룹 합집합이 곧 상장 로스터다. */
export async function fetchKrUniverse(): Promise<{ rows: MarketRow[]; groups: number; errors: string[] }> {
  const errors: string[] = [];
  const index = await getJson<{ groups?: NaverGroup[]; totalCount?: number }>(
    `https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=${PAGE_SIZE}`
  );
  const groups = index?.groups ?? [];
  if (groups.length === 0) return { rows: [], groups: 0, errors: ["kr: 업종 그룹 목록 실패"] };

  const byCode = new Map<string, MarketRow>();
  for (const group of groups) {
    // 그룹 하나가 여러 페이지일 수 있다. totalCount 를 다 덮을 때까지 넘긴다 —
    // 첫 페이지만 읽으면 대형 업종(반도체 171종목)이 잘려 분포가 왜곡된다.
    const pages = Math.max(1, Math.ceil(group.totalCount / PAGE_SIZE));
    for (let page = 1; page <= pages; page += 1) {
      const body = await getJson<{ stocks?: NaverStock[] }>(
        `https://m.stock.naver.com/api/stocks/industry/${group.no}?page=${page}&pageSize=${PAGE_SIZE}`
      );
      const stocks = body?.stocks ?? [];
      if (stocks.length === 0) {
        errors.push(`kr: 업종 ${group.no}(${group.name}) page ${page} 비어 있음`);
        break;
      }
      for (const stock of stocks) {
        const code = stock.itemCode?.trim();
        if (!code || !/^\d{6}$/.test(code)) continue;
        // ETF·리츠 등 일반 주식이 아닌 것은 분포에서 뺀다. 유형 도출 대상이 아니다.
        if (stock.stockEndType && stock.stockEndType !== "stock") continue;
        byCode.set(code, {
          code,
          name: stock.stockName?.trim() ?? code,
          market: krMarketOf(stock),
          country: "KR",
          marketCap: numberOf(stock.marketValueRaw),
          sector: group.name,
          industry: group.name,
        });
      }
    }
  }
  return { rows: [...byCode.values()], groups: groups.length, errors };
}

interface NasdaqRow {
  symbol?: string;
  name?: string;
  marketCap?: string;
  country?: string;
  sector?: string;
  industry?: string;
  volume?: string;
  lastsale?: string;
}

/** US 전수 — 스크리너 1콜. 우리 코드의 $20B 하한·상위 500 절단을 **쓰지 않는다**(분포가 왜곡된다). */
export async function fetchUsUniverse(): Promise<{ rows: MarketRow[]; errors: string[] }> {
  const body = await getJson<{ data?: { rows?: NasdaqRow[] } }>(
    "https://api.nasdaq.com/api/screener/stocks?limit=10000&download=true"
  );
  const raw = body?.data?.rows ?? [];
  if (raw.length === 0) return { rows: [], errors: ["us: 스크리너 응답 없음"] };

  const rows: MarketRow[] = [];
  for (const row of raw) {
    const symbol = row.symbol?.trim();
    // 보통주 모양만 — 워런트·유닛·우선주는 유형 도출 대상이 아니다.
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) continue;
    rows.push({
      code: symbol,
      name: row.name?.trim() ?? symbol,
      // 스크리너는 거래소를 주지 않는다. 시장 구분은 US 로만 두고, 필요해지면 그때 소스를 늘린다.
      market: "기타",
      country: "US",
      marketCap: numberOf(row.marketCap),
      sector: row.sector?.trim() || null,
      industry: row.industry?.trim() || null,
    });
  }
  return { rows, errors: [] };
}

function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export interface Stratum {
  key: string;
  sector: string;
  capTier: "대" | "중" | "소";
  population: number;
  sampled: number;
}

/**
 * 층화 표본 — 업종 × 시총 3분위.
 *
 * 비례배분만 하면 소형 업종이 0개가 되어 그 층의 분포를 말할 수 없다. 그래서
 * **층당 최소 표본을 먼저 보장하고**, 남은 예산을 모집단 비례로 나눈다.
 */
export function designSample(
  rows: readonly MarketRow[],
  target: number,
  seed: number
): { sample: MarketRow[]; strata: Stratum[] } {
  const withCap = rows.filter((row) => row.marketCap !== null && row.sector !== null);
  const caps = withCap.map((row) => row.marketCap!);
  const p33 = quantile(caps, 1 / 3) ?? 0;
  const p67 = quantile(caps, 2 / 3) ?? 0;
  const tierOf = (cap: number): Stratum["capTier"] => (cap >= p67 ? "대" : cap >= p33 ? "중" : "소");

  const buckets = new Map<string, MarketRow[]>();
  for (const row of withCap) {
    const key = `${row.sector}|${tierOf(row.marketCap!)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const random = mulberry32(seed);
  const shuffle = (items: readonly MarketRow[]): MarketRow[] => {
    // 코드 정렬로 시작해 입력 순서 의존을 없앤 뒤 시드 셔플 — 같은 시드 → 같은 표본.
    const out = [...items].sort((a, b) => a.code.localeCompare(b.code));
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };

  const keys = [...buckets.keys()].sort();
  const picked = new Map<string, MarketRow[]>();
  let used = 0;
  for (const key of keys) {
    const pool = buckets.get(key)!;
    const take = Math.min(MIN_PER_STRATUM, pool.length);
    picked.set(key, shuffle(pool).slice(0, take));
    used += take;
  }
  const remaining = Math.max(0, target - used);
  const total = withCap.length;
  for (const key of keys) {
    if (remaining <= 0) break;
    const pool = buckets.get(key)!;
    const already = picked.get(key)!;
    const extra = Math.min(pool.length - already.length, Math.round((pool.length / total) * remaining));
    if (extra > 0) {
      const chosen = shuffle(pool).filter((row) => !already.some((a) => a.code === row.code));
      picked.set(key, [...already, ...chosen.slice(0, extra)]);
    }
  }

  const strata: Stratum[] = keys.map((key) => {
    const [sector, capTier] = key.split("|") as [string, Stratum["capTier"]];
    return { key, sector, capTier, population: buckets.get(key)!.length, sampled: picked.get(key)!.length };
  });
  const sample = keys.flatMap((key) => picked.get(key)!).sort((a, b) => a.code.localeCompare(b.code));
  return { sample, strata };
}

function distTable(rows: readonly MarketRow[], label: string): string[] {
  const lines: string[] = [];
  const bySector = new Map<string, MarketRow[]>();
  for (const row of rows) {
    const key = row.sector ?? "(미분류)";
    bySector.set(key, [...(bySector.get(key) ?? []), row]);
  }
  lines.push(`### ${label} — 업종 분포 (전수 ${rows.length}종목)`);
  lines.push("");
  lines.push("| 업종 | 종목 수 | 비중 | 시총 중앙값 |");
  lines.push("|---|---|---|---|");
  for (const [sector, members] of [...bySector.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const caps = members.map((m) => m.marketCap).filter((c): c is number => c !== null);
    const median = quantile(caps, 0.5);
    lines.push(
      `| ${sector} | ${members.length} | ${((members.length / rows.length) * 100).toFixed(1)}% | ${median === null ? "—" : median.toExponential(2)} |`
    );
  }
  lines.push("");
  const caps = rows.map((r) => r.marketCap).filter((c): c is number => c !== null);
  lines.push(`시총 분위수(원통화): p10 ${quantile(caps, 0.1)?.toExponential(2)} · p33 ${quantile(caps, 1 / 3)?.toExponential(2)} · p50 ${quantile(caps, 0.5)?.toExponential(2)} · p67 ${quantile(caps, 2 / 3)?.toExponential(2)} · p90 ${quantile(caps, 0.9)?.toExponential(2)}`);
  lines.push("");
  lines.push(`시총 결측 ${rows.filter((r) => r.marketCap === null).length}종목 · 업종 결측 ${rows.filter((r) => r.sector === null).length}종목`);
  lines.push("");
  return lines;
}

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf("--out");
  const outDir = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

  console.log("[02R A-1] KR 전수 수집(업종 79그룹 순회)…");
  const kr = await fetchKrUniverse();
  console.log(`  KR ${kr.rows.length}종목 · 업종 ${kr.groups}그룹 · 경고 ${kr.errors.length}`);

  console.log("[02R A-1] US 전수 수집(스크리너 1콜)…");
  const us = await fetchUsUniverse();
  console.log(`  US ${us.rows.length}종목`);

  const krSample = designSample(kr.rows, SAMPLE_TARGET, SAMPLE_SEED);
  console.log(`[02R A-2] KR 층화 표본 ${krSample.sample.length}종목 / ${krSample.strata.length}층`);

  const lines: string[] = [];
  lines.push("# 시장 분포 실측 (WO-SUB-02R PART A)");
  lines.push("");
  lines.push("> **발행 카드가 아니라 시장 전체에서 뽑았다**(02R 규칙 1).");
  lines.push("> `loadFundamentalsUniverse()` 는 원장 발행 종목이라 수급 엔진의 편향이 들어 있고,");
  lines.push("> 그 엔진의 입력조차 KR 상위 1,000 / US 상위 500 으로 잘려 있다. 여기서는 쓰지 않았다.");
  lines.push("");
  lines.push(`측정일: ${new Date().toISOString().slice(0, 10)} · 표본 시드 \`${SAMPLE_SEED}\`(고정)`);
  lines.push("");
  lines.push("## 1. 확보 경로와 콜 수");
  lines.push("");
  lines.push("| 시장 | 경로 | 콜 | 얻은 것 |");
  lines.push("|---|---|---|---|");
  lines.push(`| KR | 네이버 업종 ${kr.groups}그룹 순회 | ~${kr.groups}+ | 종목·업종·시총(원)·거래소 |`);
  lines.push("| US | 나스닥 스크리너 `download=true` | **1** | 심볼·섹터·업종·시총(USD) |");
  lines.push("");
  lines.push("`marketValue`(문자열)는 억원, `marketValueRaw` 는 원이다. **Raw 만 썼다** —");
  lines.push("`accumulatedTradingValue` 를 백만원인 줄 모르고 원으로 읽어 유동성 게이트가 삼성전자까지");
  lines.push("걸러낸 사고(2026-07-31)와 같은 계열의 함정이다.");
  lines.push("");
  lines.push("## 2. 전수 분포");
  lines.push("");
  lines.push(...distTable(kr.rows, "KR"));
  lines.push(...distTable(us.rows, "US"));
  lines.push("## 3. 층화 표본 설계 (A-2 2단계 입력) — **설계 충돌, 결정 대기**");
  lines.push("");
  lines.push("> A-2 의 두 요구가 이 시장에서 동시에 성립하지 않는다.");
  lines.push("> · \"업종 **대분류** × 시총 3분위\" — 네이버 업종은 79개 **중분류**다(GICS Industry 급).");
  lines.push(`> · \"총 ${SAMPLE_TARGET}종목 내외\" + \"각 층에 최소 표본 보장\" — 층이 ${krSample.strata.length}개라`);
  lines.push(`>   층당 최소 ${MIN_PER_STRATUM}종목만 보장해도 **${krSample.sample.length}종목**이 된다. 목표의 1.8배다.`);
  lines.push("");
  lines.push("아래 표는 \"79중분류 × 최소 3\" 로 돌린 결과이고, **확정 표본이 아니다.**");
  lines.push("");
  lines.push(`- 층 = 업종 × 시총 3분위(대/중/소) · 층당 최소 ${MIN_PER_STRATUM}종목 보장 후 잔여를 비례배분`);
  lines.push(`- 시드 \`${SAMPLE_SEED}\` 고정 · 코드 정렬 후 셔플 → **같은 시드면 같은 표본**`);
  lines.push(`- KR 표본 **${krSample.sample.length}종목** / ${krSample.strata.length}층 (목표 ${SAMPLE_TARGET})`);
  lines.push("");
  lines.push("비례배분만 하면 소형 업종이 0개가 되어 그 층의 분포를 말할 수 없다. 그래서 최소 보장을 먼저 한다.");
  lines.push("");
  lines.push("| 층(업종·시총) | 모집단 | 표본 |");
  lines.push("|---|---|---|");
  for (const stratum of krSample.strata.filter((s) => s.sampled > 0).sort((a, b) => b.population - a.population)) {
    lines.push(`| ${stratum.sector} · ${stratum.capTier} | ${stratum.population} | ${stratum.sampled} |`);
  }
  lines.push("");
  lines.push("## 4. 아직 하지 않은 것");
  lines.push("");
  lines.push("**표본이 확정되지 않았다.** §3 의 충돌을 사람이 결정해야 A-3 을 돌릴 수 있다.");
  lines.push("");
  lines.push("**A-3 재무 프로파일은 이 문서에 없다.** 표본 종목의 5개년 손익·8분기 마진·밴드 가능 여부는");
  lines.push("DART 를 종목마다 두들겨야 하고, 그건 별도 실행이다. 이 문서는 그 실행의 **표본 명세**다.");
  lines.push("");
  if (kr.errors.length > 0 || us.errors.length > 0) {
    lines.push("## 5. 수집 경고");
    lines.push("");
    for (const error of [...kr.errors, ...us.errors].slice(0, 30)) lines.push(`- ${error}`);
    lines.push("");
  }

  const report = lines.join("\n");
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "MARKET_DISTRIBUTION.md"), report);
    writeFileSync(
      join(outDir, "market_universe_raw.json"),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), seed: SAMPLE_SEED, kr: kr.rows, us: us.rows, krSample: krSample.sample.map((r) => r.code), strata: krSample.strata },
        null,
        1
      )
    );
    console.log(`[02R A-6] 저장 — ${join(outDir, "MARKET_DISTRIBUTION.md")}`);
  } else {
    console.log(report);
  }
}

if (process.argv[1]?.includes("market-distribution")) {
  main().catch((error) => {
    console.error("[02R A] 실패", error);
    process.exit(1);
  });
}

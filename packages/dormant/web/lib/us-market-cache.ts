import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { DiscoveryMarketRow } from "./market-source-types";
import { usDiscoveryUniverse } from "./us-symbols";

const US_MARKET_QUOTE_CACHE_MAX_AGE_HOURS = 18;

// 2026-07-11 User Zero: "미장은 시총 높은 걸로 — 상위권 기업 아니면 핫한 기업만".
// 다이내믹(비큐레이션) 행 시총 하한. 쓰기(스크리너 파스)와 읽기(캐시 재검증) 양쪽에서 적용 —
// 캐시는 UPSERT-only라 구 마이크로캡 행이 18h 잔존하므로 읽기 재검증이 필수(배포 즉시 효력).
export const US_DYNAMIC_MIN_MARKET_CAP_USD = Number(process.env.US_DYNAMIC_MIN_MARKET_CAP_USD ?? 20_000_000_000);

/**
 * 신호 보유 종목의 시총 하한 (US-02 C).
 *
 * 기본 하한 $20B 은 "미장은 시총 높은 걸로"라는 결정이고 그대로 둔다. 다만 그 하한이
 * **신호까지 같이 죽였다** — SEC Form 4 클러스터 매수는 본래 중소형주 현상이라
 * (2026-09-01 실측: 클러스터 매수 100종목의 시총 중앙값 ~$1B), $20B 은 그중 9종목만 남겼고
 * 그래서 임원 매수 카드가 하루 3장이었다.
 *
 * $2B 은 감으로 고른 값이 아니다 — 같은 실측에서 $2B 은 **100종목 중 38**을 통과시킨다.
 * 목표(하루 5장 이상)에 넉넉하면서, 마이크로캡($0.06B 급)이 덱을 지배했던
 * 2026-07-11 사고 선은 넘지 않는다.
 */
export const US_SIGNAL_MIN_MARKET_CAP_USD = Number(process.env.US_SIGNAL_MIN_MARKET_CAP_USD ?? 2_000_000_000);

let curatedSymbolCache: Set<string> | null = null;

function isCuratedSymbol(symbol: string): boolean {
  curatedSymbolCache ??= new Set(usDiscoveryUniverse().map((seed) => seed.symbol.toUpperCase()));
  return curatedSymbolCache.has(symbol.toUpperCase());
}

/** 큐레이션 시드는 하한 우회, 그 외는 시총 하한 충족 필수(시총 미상 구캐시 행은 보수적 제외). */
function passesUsCapCuration(row: DiscoveryMarketRow): boolean {
  if (isCuratedSymbol(row.symbol)) return true;
  if (typeof row.marketCapUsd !== "number") return false;
  // 신호(내부자 클러스터 등)로 들어온 행은 낮은 하한을 쓴다 — 쓰기 시점 판정을 읽기에서 존중한다.
  const floor = row.capBypass === "signal" ? US_SIGNAL_MIN_MARKET_CAP_USD : US_DYNAMIC_MIN_MARKET_CAP_USD;
  return row.marketCapUsd >= floor;
}

export interface UsMarketQuoteCacheWriteOptions {
  sessionDate: string;
  slot: number;
}

export interface UsMarketQuoteCacheReadOptions {
  maxAgeHours?: number;
}

export interface UsMarketQuoteCacheStats {
  rows: number;
  rowsWithPrice: number;
  rowsWithSparkline: number;
  /** 20일 거래량 비율이 계산된 행 수 — 거래량 각성이 실제로 돌 수 있는 종목 수(US-02 B-2). */
  rowsWithVolumeRatio: number;
}

interface CachedUsMarketQuoteRow {
  symbol: string;
  row: unknown;
  updatedAt: Date;
}

let ensured = false;

async function ensureUsMarketQuoteCacheTable(): Promise<void> {
  if (ensured) return;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "UsMarketQuoteCache" (
      "symbol" TEXT PRIMARY KEY,
      "row" JSONB NOT NULL,
      "sessionDate" TEXT NOT NULL,
      "slot" INTEGER NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "UsMarketQuoteCache_updatedAt_idx"
    ON "UsMarketQuoteCache" ("updatedAt" DESC)
  `;
  ensured = true;
}

function isUsMarketRow(value: unknown): value is DiscoveryMarketRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DiscoveryMarketRow>;
  return row.country === "US" && typeof row.symbol === "string" && row.symbol.length > 0 && typeof row.canonical === "string";
}

function hasUsQuote(row: DiscoveryMarketRow): boolean {
  return typeof row.changePct === "number" || typeof row.priceText === "string" || (row.sparkline?.length ?? 0) >= 2;
}

/**
 * 거래량 이력 누적 (US-02 B-2).
 *
 * 스크리너는 **오늘 거래량 한 개**만 준다. 20일 평균은 이력이 있어야 나오는데, 이력을 위해
 * 종목마다 일봉을 받으면 유니버스 500에 500콜이다 — 프리웜이 감당 못 한다.
 * 그래서 프리웜이 돌 때마다 **그날의 거래량을 캐시 행 안에 세션일 키로 눌러 담는다.**
 * 추가 fetch 0, 신규 DDL 0(기존 JSONB 안에 산다). 세션이 쌓일수록 정확해지고,
 * 초기 공백은 `bootstrapVolumeHistory`(일봉 1회 조회)가 메운다.
 */
const VOLUME_HISTORY_KEEP_SESSIONS = 25;
/** `volumeRatioFromVolumes` 와 같은 최소 표본 — 이보다 적으면 비율을 내지 않는다(거짓 각성 금지). */
const VOLUME_HISTORY_MIN_SESSIONS = 6;

/** 저장 전용 봉투 — `DiscoveryMarketRow` 에 얹혀 JSONB 로 함께 산다. */
interface StoredUsMarketRow extends DiscoveryMarketRow {
  /** 세션일(YYYY-MM-DD) → 그날 거래량. 최근 `VOLUME_HISTORY_KEEP_SESSIONS` 개만 유지. */
  volumeHistory?: Record<string, number>;
}

function trimVolumeHistory(history: Record<string, number>): Record<string, number> {
  const dates = Object.keys(history).sort();
  if (dates.length <= VOLUME_HISTORY_KEEP_SESSIONS) return history;
  const keep = dates.slice(-VOLUME_HISTORY_KEEP_SESSIONS);
  return Object.fromEntries(keep.map((date) => [date, history[date]!]));
}

/**
 * 오늘을 뺀 과거 세션들의 평균 대비 오늘 거래량 배수.
 * 오늘을 분모에 넣으면 급증분이 스스로를 희석해 각성을 못 잡는다(`volumeRatioFromVolumes` 와 같은 규약).
 */
export function volumeRatioFromHistory(
  history: Record<string, number> | undefined,
  sessionDate: string
): { ratio: number; avg: number } | null {
  if (!history) return null;
  const today = history[sessionDate];
  if (typeof today !== "number" || today <= 0) return null;
  const past = Object.entries(history)
    .filter(([date, volume]) => date < sessionDate && typeof volume === "number" && volume > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-20)
    .map(([, volume]) => volume);
  if (past.length < VOLUME_HISTORY_MIN_SESSIONS - 1) return null;
  const avg = past.reduce((sum, volume) => sum + volume, 0) / past.length;
  if (!(avg > 0)) return null;
  return { ratio: today / avg, avg };
}

async function readVolumeHistories(symbols: readonly string[]): Promise<Map<string, Record<string, number>>> {
  if (symbols.length === 0) return new Map();
  const out = new Map<string, Record<string, number>>();
  try {
    const records = await prisma.$queryRaw<Array<{ symbol: string; history: unknown }>>`
      SELECT "symbol", "row"->'volumeHistory' AS history
      FROM "UsMarketQuoteCache"
      WHERE "symbol" = ANY(${[...symbols]}::text[])
    `;
    for (const record of records) {
      if (!record.history || typeof record.history !== "object") continue;
      const history: Record<string, number> = {};
      for (const [date, volume] of Object.entries(record.history as Record<string, unknown>)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && typeof volume === "number" && Number.isFinite(volume) && volume > 0) {
          history[date] = volume;
        }
      }
      if (Object.keys(history).length > 0) out.set(record.symbol.toUpperCase(), history);
    }
  } catch {
    // 이력이 없어도 시세 쓰기는 계속돼야 한다(fail-open) — 비율만 이번 판에 비는 것뿐이다.
  }
  return out;
}

export async function writeUsMarketQuoteRows(
  rows: readonly DiscoveryMarketRow[],
  options: UsMarketQuoteCacheWriteOptions,
): Promise<UsMarketQuoteCacheStats> {
  await ensureUsMarketQuoteCacheTable();
  const quoteRows = rows.filter((row) => row.country === "US" && hasUsQuote(row));
  const previousHistories = await readVolumeHistories(quoteRows.map((row) => row.symbol.toUpperCase()));
  const stored: StoredUsMarketRow[] = quoteRows.map((row) => {
    const symbol = row.symbol.toUpperCase();
    const history: Record<string, number> = { ...(previousHistories.get(symbol) ?? {}) };
    if (typeof row.tradingValue === "number" && row.tradingValue > 0) {
      history[options.sessionDate] = row.tradingValue;
    }
    const trimmed = trimVolumeHistory(history);
    const computed = volumeRatioFromHistory(trimmed, options.sessionDate);
    return {
      ...row,
      ...(computed ? { volumeRatio20d: Math.round(computed.ratio * 100) / 100, avgVolume20d: Math.round(computed.avg) } : {}),
      ...(Object.keys(trimmed).length > 0 ? { volumeHistory: trimmed } : {}),
    };
  });
  // 벌크 UPSERT(unnest) — 유니버스 500 확장 후 순차 INSERT 500회가 함수 타임아웃의 원인이었다.
  const CHUNK = 200;
  for (let i = 0; i < stored.length; i += CHUNK) {
    const chunk = stored.slice(i, i + CHUNK);
    const symbols = chunk.map((row) => row.symbol.toUpperCase());
    const payloads = chunk.map((row) => JSON.stringify(row));
    await prisma.$executeRaw`
      INSERT INTO "UsMarketQuoteCache" ("symbol", "row", "sessionDate", "slot", "updatedAt")
      SELECT s, p::jsonb, ${options.sessionDate}, ${options.slot}, NOW()
      FROM unnest(${symbols}::text[], ${payloads}::text[]) AS t(s, p)
      ON CONFLICT ("symbol") DO UPDATE
      SET "row" = EXCLUDED."row",
          "sessionDate" = EXCLUDED."sessionDate",
          "slot" = EXCLUDED."slot",
          "updatedAt" = NOW()
    `;
  }
  return {
    rows: stored.length,
    rowsWithPrice: stored.filter((row) => typeof row.changePct === "number" || row.priceText).length,
    rowsWithSparkline: stored.filter((row) => (row.sparkline?.length ?? 0) >= 2).length,
    rowsWithVolumeRatio: stored.filter((row) => typeof row.volumeRatio20d === "number").length,
  };
}

/**
 * 일봉에서 받아온 과거 거래량을 **기존 행에 병합**한다 (US-02 B-2 · `cron/us-volume-bootstrap`).
 *
 * 시세는 건드리지 않는다 — `"row"` 안의 `volumeHistory` · `volumeRatio20d` · `avgVolume20d`
 * 세 키만 갱신한다. 그래서 이 크론이 실패하거나 늦어도 시세 캐시는 멀쩡하다
 * (부가 작업이 필수 작업을 죽이지 않게 나눈 이유 — 라우트 주석 참조).
 *
 * 기존 이력과 **합집합**으로 병합한다. 세션 누적분(프리웜이 매일 눌러 담은 오늘 거래량)을
 * 일봉이 덮어쓰지 않게 하기 위해서다 — 둘은 같은 값을 다른 경로로 본 것이고, 이미 있는 쪽이
 * 더 최신일 수 있다.
 */
export async function seedUsVolumeHistories(
  seed: ReadonlyMap<string, Record<string, number>>,
  sessionDate: string
): Promise<{ written: number; rowsWithVolumeRatio: number }> {
  if (seed.size === 0) return { written: 0, rowsWithVolumeRatio: 0 };
  await ensureUsMarketQuoteCacheTable();
  const symbols = [...seed.keys()];
  const previous = await readVolumeHistories(symbols);
  const payloads: string[] = [];
  const keys: string[] = [];
  let withRatio = 0;
  for (const symbol of symbols) {
    // 이미 있는 값이 이긴다 — 프리웜이 눌러 담은 오늘치를 일봉 스냅샷이 되돌리지 않게.
    const merged = trimVolumeHistory({ ...(seed.get(symbol) ?? {}), ...(previous.get(symbol) ?? {}) });
    if (Object.keys(merged).length === 0) continue;
    const computed = volumeRatioFromHistory(merged, sessionDate);
    if (computed) withRatio += 1;
    keys.push(symbol);
    payloads.push(
      JSON.stringify({
        volumeHistory: merged,
        ...(computed
          ? { volumeRatio20d: Math.round(computed.ratio * 100) / 100, avgVolume20d: Math.round(computed.avg) }
          : {}),
      })
    );
  }
  if (keys.length === 0) return { written: 0, rowsWithVolumeRatio: 0 };
  const CHUNK = 200;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const symbolChunk = keys.slice(i, i + CHUNK);
    const payloadChunk = payloads.slice(i, i + CHUNK);
    // `||` 는 얕은 병합이다 — `row` 의 나머지 키(시세)는 그대로 두고 위 세 키만 덮는다.
    // 캐시에 없는 심볼은 `WHERE` 가 걸러 새 행을 만들지 않는다(시세 없는 껍데기 금지).
    await prisma.$executeRaw`
      UPDATE "UsMarketQuoteCache" AS c
      SET "row" = c."row" || t.p::jsonb
      FROM unnest(${symbolChunk}::text[], ${payloadChunk}::text[]) AS t(s, p)
      WHERE c."symbol" = t.s
    `;
  }
  return { written: keys.length, rowsWithVolumeRatio: withRatio };
}

/** 거래량 이력이 아직 없는 심볼 — 부트스트랩 크론이 일봉으로 메울 대상을 고른다. */
export async function symbolsMissingVolumeHistory(
  symbols: readonly string[],
  minSessions = VOLUME_HISTORY_MIN_SESSIONS
): Promise<string[]> {
  if (symbols.length === 0) return [];
  const histories = await readVolumeHistories(symbols.map((symbol) => symbol.toUpperCase()));
  return symbols.filter((symbol) => (Object.keys(histories.get(symbol.toUpperCase()) ?? {}).length) < minSessions);
}

export async function readUsMarketQuoteRows(options: UsMarketQuoteCacheReadOptions = {}): Promise<DiscoveryMarketRow[]> {
  const maxAgeHours = Math.max(1, Math.min(72, options.maxAgeHours ?? US_MARKET_QUOTE_CACHE_MAX_AGE_HOURS));
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  try {
    const records = await prisma.$queryRaw<CachedUsMarketQuoteRow[]>`
      SELECT "symbol", "row", "updatedAt"
      FROM "UsMarketQuoteCache"
      WHERE "updatedAt" >= ${since}
      ORDER BY COALESCE(("row"->>'marketCapRank')::int, 9999), "symbol" ASC
    `;
    return records
      .map((record) => record.row)
      .filter(isUsMarketRow)
      .filter(hasUsQuote)
      .filter(passesUsCapCuration)
      // `volumeHistory` 는 저장 전용이다 — 25세션 × 500종목이 파이프라인과 응답으로 새면
      // 카드 payload 가 쓸데없이 불어난다. 요약된 `volumeRatio20d` 만 내려보낸다.
      .map(({ volumeHistory: _volumeHistory, ...row }: DiscoveryMarketRow & { volumeHistory?: unknown }) => row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return [];
    return [];
  }
}

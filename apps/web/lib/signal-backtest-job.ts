import {
  scoreBacktestSample,
  type DailyOhlcv,
  type ScoredSample,
  type SignalTypeCode,
} from "@fomo/core";
import { STOCK_VOCAB } from "@fomo/core";
import { prisma } from "./prisma";
import { kstDate } from "./fomo";
import { fetchHistoricalClusters } from "./insider-source";
import { fetchNasdaqDailyCandles } from "./us-market-source";
import { readUsCandleCache } from "./us-candle-cache";
import { readKrCandleCache } from "./kr-candle-cache";
import { fetchStockDaily } from "./stock-front";
import { US_DISCOVERY_SYMBOLS } from "./us-symbols";
import {
  finalizeRun,
  readSignalStatsRun,
  writeSignalStats,
  writeSignalStatsRun,
  type SignalStatsRun,
} from "./signal-stats";

/**
 * 신호 성적 백테스트 잡 — 과거 동일 신호를 실제로 역산해 표본을 만든다. WO-P2 §1.
 *
 * 수집원(전부 기존 소스 재사용, 새 외부 소스 0):
 *  - insider_cluster : openinsider screener(fd=365) → 클러스터 재구성 × Nasdaq 일봉
 *  - institution_streak / foreign_streak : 우리 DB(SupplyDemandDaily) 히스토리 × 네이버 일봉
 *
 * Vercel maxDuration 안에서 끝내려고 **청크 실행**한다(유니버스 커서 + 누적 표본을 KV 에 저장).
 * 워크플로가 done=true 나올 때까지 반복 호출하면 통계가 확정된다.
 *
 * 정직: 수집 실패 종목은 조용히 건너뛰되 skipped 로 집계해 커버리지를 보고한다(가짜 채움 0).
 */

/** 백테스트를 지원하는 신호 유형(수집 경로가 실제로 있는 것만). */
export const BACKTESTABLE_TYPES = [
  "insider_cluster",
  "institution_streak",
  "foreign_streak",
] as const satisfies readonly SignalTypeCode[];

export type BacktestableType = (typeof BACKTESTABLE_TYPES)[number];

export function isBacktestableType(v: string): v is BacktestableType {
  return (BACKTESTABLE_TYPES as readonly string[]).includes(v);
}

/** 30거래일 채점을 위해 필요한 최소 경과(달력일) — 이보다 최근 신호는 아직 채점 불가. */
const MIN_AGE_DAYS_FOR_30D = 46;
/** 한 종목에서 뽑는 최대 표본 — 한 종목이 통계를 지배하지 않게(편향 방지). */
const MAX_SAMPLES_PER_SYMBOL = 3;
/** KR streak 최소 연속일(signal-resume 의 inferStandardSignalTypes 와 동일 기준). */
const MIN_STREAK_DAYS = 3;
/** 같은 종목에서 신호를 중복 계산하지 않는 최소 간격(달력일). */
const SIGNAL_COOLDOWN_DAYS = 30;
/** DB 히스토리 조회 상한(달력일) — 12개월. */
const KR_HISTORY_DAYS = 400;

const dayMs = 86_400_000;

function ageDays(dateIso: string, today: string): number {
  const a = Date.parse(`${dateIso}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
  return Math.round((b - a) / dayMs);
}

/** 신호일 목록 → 쿨다운 적용(오래된 것부터 유지) + 종목당 상한. */
function thinSignals(dates: readonly string[]): string[] {
  const sorted = [...dates].sort();
  const out: string[] = [];
  let lastMs = -Infinity;
  for (const d of sorted) {
    const ms = Date.parse(`${d}T00:00:00Z`);
    if (!Number.isFinite(ms) || ms - lastMs < SIGNAL_COOLDOWN_DAYS * dayMs) continue;
    lastMs = ms;
    out.push(d);
    if (out.length >= MAX_SAMPLES_PER_SYMBOL) break;
  }
  return out;
}

/** 유형별 유니버스(결정적 순서 — 청크 커서가 안정적이어야 한다). */
export function universeFor(type: BacktestableType): string[] {
  if (type === "insider_cluster") return US_DISCOVERY_SYMBOLS.map((s) => s.symbol);
  return STOCK_VOCAB.filter((d) => d.naverCode).map((d) => d.naverCode!);
}

/** US 일봉 — 캐시 우선(프리웜 산출물), 없으면 400일력 신규 조회. */
async function usCandles(symbol: string): Promise<DailyOhlcv[]> {
  const cached = await readUsCandleCache(symbol).catch(() => null);
  if (cached && cached.length >= 200) return cached;
  const { candles } = await fetchNasdaqDailyCandles(symbol, 400).catch(() => ({ candles: [] as DailyOhlcv[] }));
  return candles;
}

/** KR 일봉 — 캐시 우선, 없으면 420일력 신규 조회. */
async function krCandles(code: string): Promise<DailyOhlcv[]> {
  const cached = await readKrCandleCache(code).catch(() => null);
  if (cached && cached.length >= 200) return cached;
  const { candles } = await fetchStockDaily(code, 420).catch(() => ({ candles: [] as DailyOhlcv[] }));
  return candles;
}

/** 종목 1개 → 채점된 표본들(insider_cluster). 실패 시 null(=skipped). */
async function collectInsiderSamples(symbol: string, today: string): Promise<ScoredSample[] | null> {
  const clusters = await fetchHistoricalClusters(symbol).catch(() => []);
  if (clusters.length === 0) return null; // 네트워크 실패/이력 없음 — 구분 불가하므로 보수적으로 skipped
  const dates = thinSignals(
    clusters.map((c) => c.signalDate).filter((d) => ageDays(d, today) >= MIN_AGE_DAYS_FOR_30D)
  );
  if (dates.length === 0) return [];
  const candles = await usCandles(symbol);
  if (candles.length === 0) return null;
  return dates
    .map((signalDate) => scoreBacktestSample({ symbol, signalDate, candles }))
    .filter((s): s is ScoredSample => s !== null);
}

/** 수급 히스토리 → 연속 순매수(streak) 종료일 목록. net>0 이 MIN_STREAK_DAYS 이상 이어진 마지막 날. */
export function detectStreakSignalDates(
  rows: readonly { date: string; net: number }[],
  minDays = MIN_STREAK_DAYS
): string[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const out: string[] = [];
  let run = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    if (cur.net > 0) {
      run += 1;
      const next = sorted[i + 1];
      const streakEnds = !next || next.net <= 0;
      if (run >= minDays && streakEnds) out.push(cur.date); // 연속이 끊기는 날 = 신호 확정일
    } else {
      run = 0;
    }
  }
  return out;
}

/** 종목 1개 → 채점된 표본들(KR streak). 실패 시 null(=skipped). */
async function collectStreakSamples(
  code: string,
  actor: "institution" | "foreign",
  today: string
): Promise<ScoredSample[] | null> {
  const since = new Date(Date.now() - KR_HISTORY_DAYS * dayMs).toISOString().slice(0, 10);
  const rows = await prisma.supplyDemandDaily
    .findMany({
      where: { ticker: code, date: { gte: since } },
      select: { date: true, foreignNet: true, institutionNet: true },
      orderBy: { date: "asc" },
      take: 500,
    })
    .catch(() => [] as { date: string; foreignNet: number; institutionNet: number }[]);
  if (rows.length < 60) return null; // 히스토리 부족 — 역산 불가(가짜 금지)

  const nets = rows.map((r) => ({
    date: r.date,
    net: actor === "institution" ? r.institutionNet : r.foreignNet,
  }));
  const dates = thinSignals(
    detectStreakSignalDates(nets).filter((d) => ageDays(d, today) >= MIN_AGE_DAYS_FOR_30D)
  );
  if (dates.length === 0) return [];
  const candles = await krCandles(code);
  if (candles.length === 0) return null;
  return dates
    .map((signalDate) => scoreBacktestSample({ symbol: code, signalDate, candles }))
    .filter((s): s is ScoredSample => s !== null);
}

/** 동시성 제한 map — 외부 소스 부하 억제. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface ChunkResult {
  type: BacktestableType;
  /** 이번 청크에서 처리한 유니버스 구간. */
  from: number;
  to: number;
  universeSize: number;
  /** 누적 표본 수. */
  samples: number;
  /** 누적 수집 실패 종목 수. */
  skipped: number;
  /** 유니버스를 끝까지 돌았는가. */
  done: boolean;
  /** 확정 저장된 통계(done 이고 표본 충분할 때만). */
  saved: boolean;
  /** 표본 부족으로 통계를 만들지 않았으면 사유. */
  note?: string;
}

export interface ChunkOptions {
  /** 이번 호출에서 처리할 종목 수(기본 24). */
  limit?: number;
  /** 진행 상태를 버리고 처음부터(월 1회 갱신 시작). */
  reset?: boolean;
  /** 동시 요청 수. */
  concurrency?: number;
}

/**
 * 신호 유형 1개의 백테스트를 한 청크 진행한다. done=true 가 될 때까지 반복 호출.
 * 완료 시 표본이 충분하면 `signal-stats:{type}` 에 확정 저장(부족하면 저장 안 함 — 정직).
 */
export async function runSignalStatsChunk(
  type: BacktestableType,
  opts: ChunkOptions = {}
): Promise<ChunkResult> {
  const today = kstDate();
  const limit = Math.max(1, Math.min(opts.limit ?? 24, 60));
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const universe = universeFor(type);

  const prev = opts.reset ? null : await readSignalStatsRun(type).catch(() => null);
  const run: SignalStatsRun =
    prev && prev.universeSize === universe.length
      ? prev
      : {
          type,
          cursor: 0,
          universeSize: universe.length,
          samples: [],
          startedAt: today,
          updatedAt: today,
          skipped: 0,
        };

  const from = Math.min(run.cursor, universe.length);
  const to = Math.min(from + limit, universe.length);
  const slice = universe.slice(from, to);

  const results = await mapLimit(slice, concurrency, async (id) => {
    if (type === "insider_cluster") return collectInsiderSamples(id, today);
    return collectStreakSamples(id, type === "institution_streak" ? "institution" : "foreign", today);
  });

  for (const r of results) {
    if (r === null) run.skipped += 1;
    else run.samples.push(...r);
  }
  run.cursor = to;
  run.updatedAt = today;
  await writeSignalStatsRun(run);

  const done = to >= universe.length;
  let saved = false;
  let note: string | undefined;
  if (done) {
    const stats = finalizeRun(run, today);
    if (stats) {
      await writeSignalStats(stats);
      saved = true;
    } else {
      note = `표본 부족(${run.samples.length}건) — 통계 미저장(카드는 블록을 숨김)`;
    }
  }

  return {
    type,
    from,
    to,
    universeSize: universe.length,
    samples: run.samples.length,
    skipped: run.skipped,
    done,
    saved,
    ...(note ? { note } : {}),
  };
}

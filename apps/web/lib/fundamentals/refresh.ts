import type { FactSheet } from "@fomo/core";
import { kstDate } from "../fomo";
import { readFeedContent, writeFeedContent } from "../feed-content-store";
import { buildFactSheet } from "./build";
import { readFactSheet, writeFactSheet, writeFactSheetIndex, type FactSheetIndexEntry } from "./repository";
import { loadFundamentalsUniverse, type UniverseEntry } from "./universe";

/**
 * 팩트시트 갱신 배치 (WO-SUB-01 §7-2, §8-9).
 *
 * **요청 시점 계산 금지**(§4 규칙 5). 이 파일의 함수는 크론·스크립트에서만 부른다.
 * 과거 사고(lite API path 결손 → 롱테일이 `quiet` 로 폴백)와 같은 계열의 실패를 원천 차단하기 위해,
 * 카드 렌더 경로에서 이 모듈을 import 하는지 테스트로 감시한다.
 *
 * 크론 1회 실행이 전 유니버스를 다 돌 수 없다(외부 소스 지연 × 종목 수 > 함수 시간 상한).
 * 그래서 **커서 기반 청크**로 돈다 — `signal-stats` 크론과 같은 패턴이다.
 */

const CURSOR_ID = "factsheet-cursor";
/** 1회 청크 종목 수 기본값. 종목당 SEC+Nasdaq(≈5요청) 또는 네이버(4요청) + 예의 지연. */
const DEFAULT_CHUNK = 12;

interface CursorRow {
  date: string;
  /** 이번 라운드에서 이미 처리한 canonical. */
  done: string[];
  updatedAt: string;
}

export interface RefreshOutcome {
  canonical: string;
  market: string;
  hash: string;
  coverage_flag: string;
  missing_count: number;
  quarters: number;
  band_sufficient: boolean;
  errors: string[];
  /** 최신 분기 기간말 → 갱신 지연 측정(WO-SUB-00 §5 미완 항목). */
  latest_period_end: string | null;
  lag_days: number | null;
}

export interface RefreshResult {
  date: string;
  universe: number;
  processed: number;
  remaining: number;
  done: boolean;
  outcomes: RefreshOutcome[];
}

function lagDays(latestPeriodEnd: string | null, today: string): number | null {
  if (!latestPeriodEnd) return null;
  const days = (Date.parse(today) - Date.parse(latestPeriodEnd)) / 86_400_000;
  return Number.isFinite(days) ? Math.round(days) : null;
}

function outcomeOf(factsheet: FactSheet, hash: string, today: string): RefreshOutcome {
  const latest = factsheet.fiscal.quarters[factsheet.fiscal.quarters.length - 1]?.period_end ?? null;
  const bands = factsheet.valuation.band_5y;
  return {
    canonical: factsheet.canonical,
    market: factsheet.market,
    hash,
    coverage_flag: factsheet.fiscal.coverage_flag,
    missing_count: factsheet.missing_fields.length,
    quarters: factsheet.fiscal.quarters.length,
    band_sufficient: Boolean(bands.per?.sufficient || bands.pbr?.sufficient || bands.psr?.sufficient),
    errors: factsheet.source_errors,
    latest_period_end: latest,
    lag_days: lagDays(latest, today),
  };
}

/**
 * 한 청크 처리. 커서가 오늘 날짜가 아니면 새 라운드를 시작한다.
 * `reset` 이면 커서를 버리고 처음부터 돈다(백필).
 */
export async function refreshFactSheetsChunk(
  options: { limit?: number; reset?: boolean; only?: readonly string[]; date?: string } = {}
): Promise<RefreshResult> {
  const date = options.date ?? kstDate();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_CHUNK, 200));
  const universe = await loadFundamentalsUniverse();
  const filtered = options.only && options.only.length > 0
    ? universe.filter((entry) => options.only!.includes(entry.canonical) || (entry.symbol ? options.only!.includes(entry.symbol) : false))
    : universe;

  const cursor = options.reset ? null : await readFeedContent<CursorRow>(CURSOR_ID).catch(() => null);
  const done = new Set(cursor?.date === date ? cursor.done : []);
  const pending = filtered.filter((entry) => !done.has(entry.canonical));
  const batch = pending.slice(0, limit);

  const outcomes: RefreshOutcome[] = [];
  for (const entry of batch) {
    try {
      const factsheet = await buildFactSheet(entry);
      const record = await writeFactSheet(factsheet);
      outcomes.push(outcomeOf(record.factsheet, record.factsheet_hash, date));
    } catch (error) {
      // 한 종목의 실패가 배치를 죽이지 않는다. 실패도 사실이므로 기록한다.
      outcomes.push({
        canonical: entry.canonical,
        market: entry.country,
        hash: "",
        coverage_flag: "none",
        missing_count: 0,
        quarters: 0,
        band_sufficient: false,
        errors: [`build 실패: ${error instanceof Error ? error.message : String(error)}`],
        latest_period_end: null,
        lag_days: null,
      });
    }
    done.add(entry.canonical);
  }

  await writeFeedContent(CURSOR_ID, { date, done: [...done], updatedAt: new Date().toISOString() } satisfies CursorRow);

  const remaining = Math.max(0, filtered.length - done.size);
  if (remaining === 0) await writeDayIndex(date, filtered);

  return { date, universe: filtered.length, processed: batch.length, remaining, done: remaining === 0, outcomes };
}

/** 라운드가 끝나면 그날의 종목→해시 인덱스를 남긴다(대시보드·감사 입력). */
async function writeDayIndex(date: string, universe: readonly UniverseEntry[]): Promise<void> {
  const entries: FactSheetIndexEntry[] = [];
  for (const entry of universe) {
    const record = await readFactSheet(entry.country, entry.canonical);
    if (!record) continue;
    entries.push({
      canonical: entry.canonical,
      market: record.factsheet.market,
      hash: record.factsheet_hash,
      coverage_flag: record.factsheet.fiscal.coverage_flag,
      missing_count: record.factsheet.missing_fields.length,
    });
  }
  await writeFactSheetIndex(date, entries);
}

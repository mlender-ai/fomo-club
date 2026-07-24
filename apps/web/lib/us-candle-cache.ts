import type { DailyOhlcv } from "@fomo/core";
import { readFeedContent, writeFeedContent } from "./feed-content-store";

/**
 * US 일봉 260거래일 캐시 (WO-P1) — 픽 크론이 쓰고 요청 경로는 읽기 우선.
 *
 * 배경: 픽 유니버스(openinsider 시장 전체)와 데이터 유니버스(프리웜 ~500)가 불일치해서,
 * 픽 시점엔 TwelveData 로 260봉을 받아 자격을 통과한 종목이 요청 시점엔 쿼터 실패로
 * Nasdaq 폴백(종목별 이력 3봉)까지 떨어져 "가격 이력 3거래일" 빈 껍데기가 됐다.
 * 픽 시점의 캔들을 그대로 봉인해두면 요청 경로가 같은 화면을 재현한다(신규 fetch 0).
 *
 * 저장소는 기존 FeedContentCache(JSONB) 재사용 — 신규 DDL 없음. 키: "us-candles:<SYMBOL>".
 * KR(kr-candle-cache)과 달리 **날짜 합집합 병합**이다: 무료 소스가 어느 날 짧게 답해도
 * 이미 확보한 긴 이력을 덮어써 잃지 않는다(짧은 응답 → 병합 후에도 길이 유지).
 */

interface UsCandleRow {
  candles: DailyOhlcv[];
  asOf: string;
}

const KEY_PREFIX = "us-candles:";
/** 260거래일 = 52주 라벨 + MA120 여유. */
export const US_CANDLE_KEEP_DAYS = 260;
/** 이 미만은 캐시로서 쓸모가 없다(요청 경로 라이브 fetch 가 정본). */
const MIN_USEFUL_DAYS = 60;
/** 신선도 상한 — 픽 크론이 멈췄는데 옛 캔들로 verdict 내는 것 방지. */
const MAX_STALE_DAYS = 10;

function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** 날짜 기준 합집합 병합(최신 값 우선) → 오름차순 → 최근 N개. */
export function mergeCandlesByDate(
  previous: readonly DailyOhlcv[],
  next: readonly DailyOhlcv[],
  keep = US_CANDLE_KEEP_DAYS
): DailyOhlcv[] {
  const byDate = new Map<string, DailyOhlcv>();
  for (const candle of previous) if (candle?.date) byDate.set(candle.date, candle);
  for (const candle of next) if (candle?.date) byDate.set(candle.date, candle); // 같은 날짜는 새 값으로 갱신
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, candle]) => candle)
    .slice(-keep);
}

/**
 * 픽 시점 캔들 봉인. 기존 캐시와 합집합 병합해 저장하고 최종 길이를 돌려준다(게이트 로그용).
 * MIN_USEFUL_DAYS 미만이면 저장하지 않는다(빈 껍데기 캐시 금지) — 병합 결과 기준.
 */
export async function writeUsCandleCache(symbol: string, candles: readonly DailyOhlcv[]): Promise<number> {
  const key = `${KEY_PREFIX}${normalizeSymbol(symbol)}`;
  const previous = await readFeedContent<UsCandleRow>(key).catch(() => null);
  const merged = mergeCandlesByDate(previous?.candles ?? [], candles);
  if (merged.length < MIN_USEFUL_DAYS) return merged.length;
  await writeFeedContent(key, { candles: merged, asOf: kstDate() } satisfies UsCandleRow);
  return merged.length;
}

/** 캐시 읽기 — 유효(길이·신선도)하지 않으면 null(호출부가 라이브 fetch 로 폴백). */
export async function readUsCandleCache(symbol: string): Promise<DailyOhlcv[] | null> {
  const row = await readFeedContent<UsCandleRow>(`${KEY_PREFIX}${normalizeSymbol(symbol)}`).catch(() => null);
  if (!row?.candles || row.candles.length < MIN_USEFUL_DAYS) return null;
  const ageDays = (Date.parse(kstDate()) - Date.parse(row.asOf)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > MAX_STALE_DAYS) return null;
  return row.candles;
}

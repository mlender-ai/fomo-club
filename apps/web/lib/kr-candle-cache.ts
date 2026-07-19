import type { DailyOhlcv } from "@fomo/core";
import { readFeedContent, writeFeedContent } from "./feed-content-store";

/**
 * KR 일봉 260거래일 캐시 (WO 카드 품질 2차 C) — 프리웜 크론이 쓰고 요청 경로는 읽기만(504 원칙).
 *
 * 배경: 덱 카드 verdict 가 네이버 일봉 110일력(≈75거래일)만 받아 52주·MA120·와이코프 phase 판정이
 * 국장에서 불가능했다("최근 4개월 저점" 문구·phase 55% 판정불가의 뿌리). 프리웜이 420일력(≈280거래일)을
 * 받아 최근 260거래일을 저장하면 windowLabel ≥240 → "52주" 승격, MA120·정배열 판정이 자동 활성된다.
 *
 * 저장소는 기존 FeedContentCache(JSONB) 재사용 — 신규 DDL 없음. 키: "kr-candles:<naverCode>".
 */

interface KrCandleRow {
  candles: DailyOhlcv[];
  asOf: string;
}

const KEY_PREFIX = "kr-candles:";
/** 260거래일 = 52주 라벨(windowLabel ≥240) + MA120 여유. */
export const KR_CANDLE_KEEP_DAYS = 260;
/** 캐시가 유효하려면 최소 이만큼 — 현행 요청 경로(110일력 ≈ 75거래일)보다 명확히 나은 경우만 사용. */
const MIN_USEFUL_DAYS = 120;
/** 이 일수보다 오래된 캐시는 스테일 — 프리웜이 죽었는데 옛 캔들로 verdict 내는 것 방지. */
const MAX_STALE_DAYS = 7;

function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function writeKrCandleCache(naverCode: string, candles: readonly DailyOhlcv[]): Promise<void> {
  if (candles.length < MIN_USEFUL_DAYS) return; // 짧은 이력은 캐시하지 않는다 — 폴백(직접 fetch)이 정본
  const row: KrCandleRow = { candles: candles.slice(-KR_CANDLE_KEEP_DAYS), asOf: kstDate() };
  await writeFeedContent(`${KEY_PREFIX}${naverCode}`, row);
}

/** 캐시 읽기 — 유효(길이·신선도)하지 않으면 null(호출부가 기존 경로로 폴백). */
export async function readKrCandleCache(naverCode: string): Promise<DailyOhlcv[] | null> {
  const row = await readFeedContent<KrCandleRow>(`${KEY_PREFIX}${naverCode}`).catch(() => null);
  if (!row?.candles || row.candles.length < MIN_USEFUL_DAYS) return null;
  const ageDays = (Date.parse(kstDate()) - Date.parse(row.asOf)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > MAX_STALE_DAYS) return null;
  return row.candles;
}

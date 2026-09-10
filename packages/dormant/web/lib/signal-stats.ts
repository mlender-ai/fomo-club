import {
  SIGNAL_TYPE_CODES,
  SIGNAL_RESUME_MIN_SAMPLE,
  aggregateSignalStats,
  preferLedgerStats,
  type ScoredSample,
  type SignalStats,
  type SignalTypeCode,
} from "@fomo/core";
import { readFeedContent, writeFeedContent, readFeedContentByPrefix } from "./feed-content-store";
import { getCachedTrackRecord } from "./ledger-track-record";

/**
 * 신호 성적 통계 저장·조회 — "이 신호, 과거엔 어땠나"의 데이터 계층. WO-P2 §1.
 *
 * 저장은 기존 FeedContentCache(JSONB) 키-값 재사용 — 신규 DDL 0(us-candles/kr-candles 선례).
 *   `signal-stats:{type}`     → 확정 통계(월 1회 갱신)
 *   `signal-stats-run:{type}` → 산출 진행 상태(청크 커서 + 누적 표본). 완료 후에도 남겨 재현·디버그.
 *
 * 정직 규칙(WO-P2):
 *  ① 표본이 모자라면 저장하지 않는다 → 카드가 블록을 숨긴다(빈 껍데기 금지).
 *  ③ 원장(실전) 표본이 SIGNAL_RESUME_MIN_SAMPLE(30) 이상이면 백테스트 대신 실전 성적을 쓴다.
 */

const STATS_PREFIX = "signal-stats:";
const RUN_PREFIX = "signal-stats-run:";

export const statsKey = (type: SignalTypeCode) => `${STATS_PREFIX}${type}`;
export const runKey = (type: SignalTypeCode) => `${RUN_PREFIX}${type}`;

/** 산출 진행 상태 — 청크 실행(Vercel maxDuration) 사이에 표본을 이어 붙인다. */
export interface SignalStatsRun {
  type: SignalTypeCode;
  /** 다음 청크가 시작할 유니버스 인덱스. 유니버스 끝까지 가면 완료. */
  cursor: number;
  /** 유니버스 크기(진행률 표시·완료 판정용). */
  universeSize: number;
  /** 지금까지 채점된 표본(종목·신호일·수익률). 통계는 이걸로 집계한다. */
  samples: ScoredSample[];
  startedAt: string;
  updatedAt: string;
  /** 마지막 청크에서 수집 실패(네트워크 등)한 종목 수 — 정직한 커버리지 보고용. */
  skipped: number;
}

export async function readSignalStatsRun(type: SignalTypeCode): Promise<SignalStatsRun | null> {
  return readFeedContent<SignalStatsRun>(runKey(type));
}

export async function writeSignalStatsRun(run: SignalStatsRun): Promise<void> {
  await writeFeedContent(runKey(run.type), run);
}

export async function readSignalStats(type: SignalTypeCode): Promise<SignalStats | null> {
  return readFeedContent<SignalStats>(statsKey(type));
}

export async function writeSignalStats(stats: SignalStats): Promise<void> {
  await writeFeedContent(statsKey(stats.type), stats);
}

/** 저장된 백테스트 통계 전량(신호 유형 16종 ≤ prefix 상한). */
export async function readAllBacktestStats(): Promise<Partial<Record<SignalTypeCode, SignalStats>>> {
  const rows = await readFeedContentByPrefix<SignalStats>(STATS_PREFIX, 50);
  const out: Partial<Record<SignalTypeCode, SignalStats>> = {};
  for (const { row } of rows) {
    if (row && SIGNAL_TYPE_CODES.includes(row.type)) out[row.type] = row;
  }
  return out;
}

/**
 * 원장(실전) 성적 → SignalStats 형태로 변환. n≥30 이라 마스킹이 풀린 것만(publicSignalMetric 정책).
 * winRate/medianReturn 이 null(표본 미달 마스킹)이면 승격 대상이 아니므로 제외한다.
 */
async function readLedgerStats(computedAt: string): Promise<Partial<Record<SignalTypeCode, SignalStats>>> {
  const out: Partial<Record<SignalTypeCode, SignalStats>> = {};
  try {
    const track = await getCachedTrackRecord();
    const bySignal = track.signalHistory30 ?? {};
    for (const code of SIGNAL_TYPE_CODES) {
      const m = bySignal[code];
      if (!m || m.n < SIGNAL_RESUME_MIN_SAMPLE) continue;
      if (m.winRate === null || m.medianReturn === null) continue;
      const up = Math.round((m.winRate / 100) * m.n);
      const down = m.n - up; // 원장 지표는 보합을 따로 세지 않는다 — 하락은 "안 오른 건수"로 정직하게 표기
      out[code] = {
        type: code,
        source: "ledger",
        horizons: {
          30: {
            n: m.n,
            up,
            winRate: m.winRate,
            down,
            downRate: Math.round((down / m.n) * 1000) / 10,
            medianReturn: m.medianReturn,
          },
        },
        computedAt,
        method: `우리가 실제로 골랐던 같은 신호 ${m.n}건을 30일 뒤 종가로 채점한 결과예요.`,
        methodVersion: "ledger.v1",
      };
    }
  } catch (err) {
    console.warn("[signal-stats] ledger read skipped", (err as Error)?.message);
  }
  return out;
}

/**
 * 카드에 실을 최종 통계 맵 — 유형별로 (원장 n≥30 ? 실전 : 백테스트).
 * 픽 생성(크론) 시 1회 호출해 픽에 박제한다 — 읽기 경로에 추가 비용 0.
 */
export async function readSignalStatsForCards(
  computedAt: string
): Promise<Partial<Record<SignalTypeCode, SignalStats>>> {
  const [backtest, ledger] = await Promise.all([readAllBacktestStats(), readLedgerStats(computedAt)]);
  const out: Partial<Record<SignalTypeCode, SignalStats>> = {};
  for (const code of SIGNAL_TYPE_CODES) {
    const merged = preferLedgerStats(backtest[code] ?? null, ledger[code] ?? null);
    if (merged) out[code] = merged;
  }
  return out;
}

/** 진행 상태의 누적 표본 → 통계 확정(표본 미달이면 null → 저장하지 않는다). */
export function finalizeRun(run: SignalStatsRun, computedAt: string): SignalStats | null {
  return aggregateSignalStats(run.samples, { type: run.type, computedAt });
}

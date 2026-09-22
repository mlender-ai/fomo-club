/**
 * 트랙 합산 (UI-02 PART C).
 *
 * ## 그대로 더하면 KR 이 40%를 먹는다
 *
 * ```
 * 크립토      500 USDT
 * 고래        500 USDT
 * 주식 US    100,000 USD
 * 주식 KR    100,000,000 KRW   ≈ $72,000
 * 폴리마켓    10,000 USDC
 * ```
 *
 * 크립토가 −30% 나도 총합에서는 −0.2% 로 보인다. **그건 거짓이다.**
 *
 * ## 그래서 트랙당 $10,000 으로 환산해서 합친다
 *
 * ```
 * 환산 자산 = $10,000 × (현재 자산 ÷ 시작 자본)
 * ```
 *
 * 환율이 필요 없다 — **비율만 쓴다.** 원래 금액은 각 행에 병기한다(C-3).
 *
 * ## 정지 트랙도 넣는다
 *
 * `UI-02 C-4` · 하지 말 것 — **빼면 수익률이 좋아 보인다.** 멈춘 트랙은 보통
 * 나쁜 상태에서 멈췄으므로, 빼는 순간 화면이 자기에게 유리하게 거짓말한다.
 *
 * ## 모르는 값은 뺀 채로 말한다
 *
 * 평가액이 없는 트랙(폴리마켓 — 451 로 NAV 미산출)은 **0 으로 채우지 않는다.**
 * 총합에서 빼되 "몇 개가 빠졌는지" 를 같이 낸다. 0 으로 채우면 그 트랙이 전액
 * 손실인 것처럼 합산된다.
 */
import type { FceTrackRow } from "./fce-board";

/** 트랙 하나가 총합에 넣는 몫. 통화가 달라도 이 값으로 같은 무게가 된다. */
export const TRACK_BASE_USD = 10_000;

export interface PortfolioTrack {
  key: string;
  label: string;
  currency: string;
  /** $10,000 환산값. 평가액을 모르면 null. */
  normalized: number | null;
  /** 원래 통화 금액. 행에 작게 병기한다. */
  nativeCurrent: number | null;
  nativeStart: number;
  /** FCE 가 낸 실현 기준 수익률. **랩이 다시 계산하지 않는다.** */
  returnPct: number | null;
  status: string;
  statusReason: string | null;
  /** 같은 방식으로 환산한 벤치마크. 없으면 null. */
  benchmarkNormalized: number | null;
  benchmarkLabel: string | null;
}

export interface Portfolio {
  /** 환산 총합. 값을 아는 트랙만 더한 것이다. */
  total: number;
  /** 값을 아는 트랙 수 × $10,000. 수익률의 분모다. */
  base: number;
  /** 총합 − 분모. */
  changeUsd: number;
  changePct: number | null;
  /** 벤치마크를 같은 방식으로 합친 값. 하나도 없으면 null. */
  benchmarkTotal: number | null;
  benchmarkChangePct: number | null;
  tracks: PortfolioTrack[];
  /** 평가액을 몰라 총합에서 빠진 트랙. **화면이 이걸 말해야 한다.** */
  excluded: { key: string; label: string; reason: string }[];
}

/**
 * 비율 환산. 시작 자본이 0 이하면 비율이 성립하지 않으므로 null 을 낸다 —
 * 그런 트랙을 `Infinity` 로 합치면 총합 전체가 못 쓰게 된다.
 */
function normalize(current: number | null, start: number): number | null {
  if (current === null || !Number.isFinite(current)) return null;
  if (!Number.isFinite(start) || start <= 0) return null;
  return TRACK_BASE_USD * (current / start);
}

export function buildPortfolio(rows: FceTrackRow[]): Portfolio {
  const tracks: PortfolioTrack[] = rows.map((t) => ({
    key: t.key,
    label: t.label,
    currency: t.currency,
    normalized: normalize(t.currentCapital, t.startingCapital),
    nativeCurrent: t.currentCapital,
    nativeStart: t.startingCapital,
    returnPct: t.returnPct,
    status: t.status,
    statusReason: t.statusReason,
    // 벤치마크도 **같은 방식**으로 환산한다(UI-02 D). 다른 방식으로 그리면
    // 두 선이 비교가 안 된다.
    benchmarkNormalized:
      t.benchmarkReturnPct === null
        ? null
        : TRACK_BASE_USD * (1 + t.benchmarkReturnPct / 100),
    benchmarkLabel: t.benchmarkLabel,
  }));

  const counted = tracks.filter((t) => t.normalized !== null);
  const total = counted.reduce((sum, t) => sum + (t.normalized ?? 0), 0);
  const base = counted.length * TRACK_BASE_USD;

  const withBenchmark = tracks.filter((t) => t.benchmarkNormalized !== null);
  const benchmarkTotal =
    withBenchmark.length > 0
      ? withBenchmark.reduce((sum, t) => sum + (t.benchmarkNormalized ?? 0), 0)
      : null;

  return {
    total,
    base,
    changeUsd: total - base,
    changePct: base > 0 ? ((total - base) / base) * 100 : null,
    benchmarkTotal,
    benchmarkChangePct:
      benchmarkTotal === null || withBenchmark.length === 0
        ? null
        : ((benchmarkTotal - withBenchmark.length * TRACK_BASE_USD) /
            (withBenchmark.length * TRACK_BASE_USD)) *
          100,
    tracks,
    excluded: tracks
      .filter((t) => t.normalized === null)
      .map((t) => ({
        key: t.key,
        label: t.label,
        reason: t.statusReason ?? "평가액 미산출",
      })),
  };
}

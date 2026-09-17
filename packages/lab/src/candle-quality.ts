/**
 * LAB-03 PART A-2 — 봉 품질 검사 5종. 전부 순수 함수다.
 *
 * **구멍을 메우지 않는다**(LAB-00 §7 · 하지 말 것 1). 이 모듈은 구멍을 **찾아서
 * 기록**할 뿐이고, 보간하는 함수는 일부러 만들지 않았다. 있으면 언젠가 쓰인다.
 *
 * 백테스트(`LAB-04`)가 같은 판정을 읽어 **구멍 구간에서 진입하지 않는다.**
 * 그래서 수집기와 엔진이 따로 판단하지 않도록 여기 한 곳에 둔다.
 */

/** 봉 주기. Prisma `CandleInterval` 과 1:1. */
export type Interval = "H1" | "D1";

/** 주기별 밀리초. */
export const INTERVAL_MS: Record<Interval, number> = {
  H1: 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
};

/** 검사에 필요한 최소 모양. DB 행이든 API 응답이든 이 모양으로 맞춰 넘긴다. */
export interface QualityCandle {
  /** 봉이 **여는** 시각. UTC. */
  at: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Gap {
  /** 빠진 첫 봉의 시각. */
  fromAt: Date;
  /** 빠진 마지막 봉의 시각. */
  toAt: Date;
  /** 빠진 봉 개수. */
  missing: number;
}

export interface Outlier {
  at: Date;
  /** 직전 봉 종가 대비 이 봉 종가의 변동률(%). */
  changePct: number;
}

export interface Misaligned {
  at: Date;
  /** 주기 경계에서 몇 밀리초 어긋났나. */
  offsetMs: number;
}

export interface QualityReport {
  symbol: string;
  interval: Interval;
  /** 실제로 가진 봉 수. */
  count: number;
  /** 기간으로 계산한 있어야 할 봉 수. 봉이 0개면 null. */
  expected: number | null;
  first: Date | null;
  last: Date | null;

  gaps: Gap[];
  /** 빠진 봉 총 개수. */
  missing: number;
  outliers: Outlier[];
  /** 주기 경계에 안 맞는 봉. UTC 정렬이 깨졌다는 신호다. */
  misaligned: Misaligned[];
  /** 같은 시각이 둘 이상인 봉의 시각. */
  duplicates: Date[];

  /** 다섯 검사를 다 통과했나. **구멍은 통과 여부에 넣지 않는다** — 아래 설명. */
  ok: boolean;
}

/**
 * 인접 봉 종가 대비 이만큼(%) 넘게 움직이면 이상치로 본다.
 *
 * 크립토는 하루 20% 도 흔하다. 그래서 기본을 높게 잡는다 — 낮추면 정상 변동이
 * 전부 이상치가 되고, 그러면 아무도 이 목록을 안 보게 된다.
 * **이상치는 버리는 신호가 아니라 눈으로 확인하라는 신호다.**
 */
export const DEFAULT_OUTLIER_PCT = 40;

/** 주기 경계에 맞는가. 봉 여는 시각은 주기의 배수여야 한다(UTC 기준). */
function offsetFromBoundary(at: Date, interval: Interval): number {
  return at.getTime() % INTERVAL_MS[interval];
}

/**
 * 기간으로 계산한 있어야 할 봉 수. 양끝 포함이다.
 * 1시간봉 3년이면 `3 × 365 × 24` 근처가 나온다(윤년·경계 때문에 정확히 같지는 않다).
 */
export function expectedCandleCount(first: Date, last: Date, interval: Interval): number {
  const span = last.getTime() - first.getTime();
  if (span < 0) return 0;
  return Math.floor(span / INTERVAL_MS[interval]) + 1;
}

/**
 * 구멍. 정렬된 봉 배열에서 인접 간격이 주기보다 크면 그 사이가 구멍이다.
 * 중복(간격 0)은 여기서 구멍으로 세지 않는다 — 중복 검사가 따로 잡는다.
 */
export function findGaps(candles: readonly QualityCandle[], interval: Interval): Gap[] {
  const step = INTERVAL_MS[interval];
  const gaps: Gap[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) continue;
    const delta = cur.at.getTime() - prev.at.getTime();
    if (delta <= step) continue;
    const missing = Math.round(delta / step) - 1;
    if (missing < 1) continue;
    gaps.push({
      fromAt: new Date(prev.at.getTime() + step),
      toAt: new Date(cur.at.getTime() - step),
      missing,
    });
  }
  return gaps;
}

/** 인접 봉 대비 극단적 변동. */
export function findOutliers(
  candles: readonly QualityCandle[],
  thresholdPct: number = DEFAULT_OUTLIER_PCT
): Outlier[] {
  const outliers: Outlier[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur || !(prev.close > 0)) continue;
    const changePct = ((cur.close - prev.close) / prev.close) * 100;
    if (Math.abs(changePct) >= thresholdPct) outliers.push({ at: cur.at, changePct });
  }
  return outliers;
}

/** 주기 경계에 안 맞는 봉. 로컬 시각으로 저장했거나 소스가 다른 정렬을 쓰는 것이다. */
export function findMisaligned(
  candles: readonly QualityCandle[],
  interval: Interval
): Misaligned[] {
  const out: Misaligned[] = [];
  for (const candle of candles) {
    const offsetMs = offsetFromBoundary(candle.at, interval);
    if (offsetMs !== 0) out.push({ at: candle.at, offsetMs });
  }
  return out;
}

/** 같은 시각 봉이 둘 이상. DB 의 유니크 제약이 막지만, **받은 직후에도 본다.** */
export function findDuplicates(candles: readonly QualityCandle[]): Date[] {
  const seen = new Set<number>();
  const dupes = new Map<number, Date>();
  for (const candle of candles) {
    const key = candle.at.getTime();
    if (seen.has(key)) dupes.set(key, candle.at);
    else seen.add(key);
  }
  return [...dupes.values()].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * 다섯 검사를 한 번에. **받은 뒤 반드시 확인한다**(PART A-2).
 *
 * 입력은 시각 오름차순이라고 가정하지 않는다 — 정렬해서 본다.
 *
 * ## `ok` 에 구멍을 넣지 않은 이유
 *
 * 구멍은 **정상 출력**이다. 거래소가 멈춘 구간은 실제로 봉이 없고, 그걸 실패로
 * 처리하면 수집이 영원히 빨간불이 되거나 — 더 나쁘게 — 누군가 메우려 든다.
 * 구멍은 세어서 기록하고, `ok` 는 **고칠 수 있는 것**(중복·정렬·이상치)만 본다.
 */
export function inspectCandles(
  symbol: string,
  interval: Interval,
  input: readonly QualityCandle[],
  options: { outlierPct?: number } = {}
): QualityReport {
  const candles = [...input].sort((a, b) => a.at.getTime() - b.at.getTime());
  const first = candles[0]?.at ?? null;
  const last = candles[candles.length - 1]?.at ?? null;

  const gaps = findGaps(candles, interval);
  const outliers = findOutliers(candles, options.outlierPct ?? DEFAULT_OUTLIER_PCT);
  const misaligned = findMisaligned(candles, interval);
  const duplicates = findDuplicates(candles);

  return {
    symbol,
    interval,
    count: candles.length,
    expected: first && last ? expectedCandleCount(first, last, interval) : null,
    first,
    last,
    gaps,
    missing: gaps.reduce((sum, gap) => sum + gap.missing, 0),
    outliers,
    misaligned,
    duplicates,
    ok: duplicates.length === 0 && misaligned.length === 0 && outliers.length === 0,
  };
}

/**
 * 어떤 시각이 구멍 안에 있나. **백테스트가 이걸로 진입을 막는다**(LAB-04 PART D).
 *
 * 구멍 목록은 보통 짧아서 선형 탐색으로 충분하다. 길어지면 그때 정렬·이분탐색으로 바꾼다.
 */
export function isInGap(at: Date, gaps: readonly Gap[]): boolean {
  const t = at.getTime();
  return gaps.some((gap) => t >= gap.fromAt.getTime() && t <= gap.toAt.getTime());
}

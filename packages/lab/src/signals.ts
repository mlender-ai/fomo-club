/**
 * LAB-09 PART A — FOMO Club 신호를 **진입 조건**으로.
 *
 * > 지금까지   신호 → 카드 → 사용자가 알아서 판단
 * > 바뀌면     신호 → 진입 조건 → 자동 매매 → 성과 채점
 *
 * ## 이식 경위 — FCE 때와 달리 진짜로 옮길 수 있었다
 *
 * 원본은 `packages/dormant/fomo-core/src/keyword-cards/quiet-signals.ts` 다.
 * **순수 함수였고, 임계가 전부 실측으로 정해져 있었다.** LAB-04 의 FCE 이식은
 * 파이썬을 다시 쓰는 일이었지만 이건 복사에 가깝다 — 규칙과 그 근거를 같이 옮긴다.
 *
 * 옮기지 않은 것: 카드 문구·그림 재료(`indexSeries`·`volumeSeries`·`spikeFrom`).
 * 매매에는 판정만 필요하다. 그림은 카드가 쓰던 것이다.
 *
 * ## 임계를 손대지 않았다
 *
 * 원본의 값은 **배포 후 실측 분포로 정한 것**이고 그 근거가 주석에 남아 있다
 * (5일 연속 초과는 56종목에서 0건 → 3일로 내림 등). 여기서 새로 정하면 그 실측이
 * 버려진다. 매매용으로 조였는지 여부는 **백테스트가 답한다** — 감으로 바꾸지 않는다.
 */

/** 거래일 한 점. 오래된 → 최신 순. */
export interface DailyPoint {
  close: number;
  volume: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 시장 역행 — 시장은 빠지는데 이것만 버틴다
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 지수 대비 초과 연속일 최소치.
 *
 * 원본 주석의 실측: 조건 없이 잰 분포에서 **최대 연속일수가 3일**이었고 4일 이상은
 * 56종목 중 0건이었다. 그래서 5가 아니라 3이다.
 */
export const MARKET_DIVERGENCE_MIN_DAYS = 3;

/**
 * 창 안에서 지수가 **내린 날**의 최소 수.
 *
 * 없으면 지수가 계속 오른 구간에서 조금 더 오른 종목까지 "시장은 빠지는데" 가 된다.
 */
export const MARKET_DIVERGENCE_MIN_DOWN_DAYS = 2;

export interface MarketDivergence {
  /** 지수 대비 연속 초과 일수. */
  days: number;
  /** 창 안 지수 등락률(%). 음수여야 성립한다. */
  indexChangePct: number;
  /** 창 안 종목 등락률(%). */
  stockChangePct: number;
}

function pctChange(series: readonly number[]): number | null {
  const first = series[0];
  const last = series[series.length - 1];
  if (typeof first !== "number" || typeof last !== "number" || !(first > 0)) return null;
  return ((last - first) / first) * 100;
}

/**
 * 지수보다 계속 강했는가.
 *
 * **일별 수익률을 비교한다** — 누적으로만 보면 첫날 한 번 크게 오른 뒤 계속 밀린 종목도
 * 통과한다. "계속 강하다" 는 매일 강했다는 뜻이어야 한다.
 *
 * @param stock 종목 종가(오래된 → 최신)
 * @param index **같은 날짜로 정렬된** 지수 종가. 길이가 다르면 판정하지 않는다 —
 *              어긋난 날짜를 비교하면 결과가 거짓이 된다.
 */
export function detectMarketDivergence(
  stock: readonly number[],
  index: readonly number[]
): MarketDivergence | null {
  if (stock.length !== index.length) return null;
  if (stock.length < MARKET_DIVERGENCE_MIN_DAYS + 1) return null;

  let days = 0;
  for (let i = stock.length - 1; i > 0; i -= 1) {
    const s0 = stock[i - 1] as number;
    const s1 = stock[i] as number;
    const x0 = index[i - 1] as number;
    const x1 = index[i] as number;
    if (!(s0 > 0) || !(x0 > 0)) break;
    if ((s1 - s0) / s0 <= (x1 - x0) / x0) break;
    days += 1;
  }
  if (days < MARKET_DIVERGENCE_MIN_DAYS) return null;

  const stockWindow = stock.slice(-(days + 1));
  const indexWindow = index.slice(-(days + 1));

  let downDays = 0;
  for (let i = 1; i < indexWindow.length; i += 1) {
    if ((indexWindow[i] as number) < (indexWindow[i - 1] as number)) downDays += 1;
  }
  if (downDays < MARKET_DIVERGENCE_MIN_DOWN_DAYS) return null;

  const indexChangePct = pctChange(indexWindow);
  const stockChangePct = pctChange(stockWindow);
  if (indexChangePct === null || stockChangePct === null) return null;
  // 지수가 창 전체로는 올랐다면 "시장은 빠지는데" 가 거짓이다.
  if (indexChangePct >= 0) return null;

  return { days, indexChangePct, stockChangePct };
}

// ─────────────────────────────────────────────────────────────────────────────
// 거래량 각성 — 조용하던 거래가 붙기 시작했다
// ─────────────────────────────────────────────────────────────────────────────

/** 급증 판정 배수 — 최근 거래량이 기준 평균의 이 배 이상. */
export const VOLUME_AWAKENING_MULTIPLE = 3;

/** 기준 평균을 재는 창(거래일). 석 달 ≈ 60거래일. */
export const VOLUME_AWAKENING_BASE_DAYS = 60;

/**
 * "아직 안 움직였다" 의 상한(%) — **급증 시작 직전 → 오늘 순변동**.
 *
 * 원본의 실측: 유니버스 809종목에서 ≤3% 7종목 · ≤5% 12종목 · ≤7% 17종목.
 * 가장 좁은 값에서도 공급이 되므로 가장 좁은 값을 쓴다 — 6.3% 움직인 종목을 두고
 * "아직 안 움직였다" 고 말하면 그 문장이 거짓이다.
 */
export const VOLUME_AWAKENING_MAX_MOVE_PCT = 3;

export interface VolumeAwakening {
  /** 최근 거래량이 기준 평균의 몇 배인가. */
  multiple: number;
  /** 기준 평균을 잰 거래일 수. */
  baseDays: number;
  /** 급증 시작 직전 → 오늘 순변동률(%). 당일 변동이 아니다. */
  movePct: number;
}

/**
 * 오래 조용하다가 거래가 붙었는가. 그리고 **가격은 아직 안 움직였는가.**
 *
 * 오늘을 기준 평균의 분모에서 뺀다 — 넣으면 급증분이 스스로를 희석해 각성을 못 잡는다.
 *
 * @param points 오래된 → 최신. `VOLUME_AWAKENING_BASE_DAYS + 1` 개보다 적으면 판정하지 않는다.
 */
export function detectVolumeAwakening(points: readonly DailyPoint[]): VolumeAwakening | null {
  const usable = points.filter(
    (p) => Number.isFinite(p.close) && Number.isFinite(p.volume) && p.volume >= 0
  );
  if (usable.length < VOLUME_AWAKENING_BASE_DAYS + 1) return null;

  const latest = usable[usable.length - 1] as DailyPoint;
  const base = usable.slice(-(VOLUME_AWAKENING_BASE_DAYS + 1), -1);
  const baseAvg = base.reduce((sum, p) => sum + p.volume, 0) / base.length;
  if (!(baseAvg > 0)) return null;

  const multiple = latest.volume / baseAvg;
  if (multiple < VOLUME_AWAKENING_MULTIPLE) return null;

  const window = usable.slice(-(VOLUME_AWAKENING_BASE_DAYS + 1));
  let spikeFrom = window.length - 1;
  while (
    spikeFrom > 0 &&
    (window[spikeFrom - 1] as DailyPoint).volume >= baseAvg * VOLUME_AWAKENING_MULTIPLE
  ) {
    spikeFrom -= 1;
  }

  const beforeSpike = window[Math.max(0, spikeFrom - 1)] as DailyPoint;
  if (!(beforeSpike.close > 0)) return null;
  const movePct = ((latest.close - beforeSpike.close) / beforeSpike.close) * 100;
  if (Math.abs(movePct) > VOLUME_AWAKENING_MAX_MOVE_PCT) return null;

  return { multiple, baseDays: base.length, movePct };
}

// ─────────────────────────────────────────────────────────────────────────────
// 연속 순매수 — 기관·외국인
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 연속 순매수 일수 하한. 원본 `quiet-pick.ts` 의 `STREAK_MIN_DAYS` 와 같은 값이다.
 */
export const STREAK_MIN_DAYS = 3;

/** 하루치 수급. 오래된 → 최신 순으로 넘긴다. */
export interface FlowPoint {
  /** 외국인 순매수(주). +매수 / −매도. */
  foreignNet: number;
  /** 기관 순매수(주). */
  institutionNet: number;
}

/**
 * 마지막 날 기준 **연속 순매수 일수**. 오늘이 순매수가 아니면 0 이다.
 *
 * 0 과 null 을 구분한다 — 0 은 "오늘 안 샀다", null 은 "모른다"(자료 없음)다.
 * `null` 인 조건은 통과하지 않는다(`conditions.ts`).
 */
export function buyStreak(
  points: readonly FlowPoint[],
  who: "foreign" | "institution"
): number | null {
  if (points.length === 0) return null;
  let streak = 0;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i] as FlowPoint;
    const net = who === "foreign" ? point.foreignNet : point.institutionNet;
    if (!Number.isFinite(net) || net <= 0) break;
    streak += 1;
  }
  return streak;
}

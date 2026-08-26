/**
 * WO-RESET-03 — 「누가 샀나」 말고 다른 흔적들. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 왜 필요한가
 *
 * 컨셉은 그대로다 — **뉴스 나오기 전에 돈이 먼저 들어간 곳.** 다만 지금까지 그것을
 * `누가 샀나` 로만 좁게 봤다. 신호가 한 종류뿐이라 하루 8장이 늘 비슷했다.
 *
 * 뉴스가 되기 전에 남는 흔적은 그것 말고도 있다. 이 모듈은 **가격·거래량에만 있는 흔적**을
 * 찾는다(새 수집이 필요 없는 것들 — WO PART B 1·2번).
 *
 * ## 카드가 하는 일은 하나다
 *
 * **궁금하게 만드는 것.** 그래서 여기서 만드는 것은 결론 한 문장과 그림 재료뿐이고,
 * 답(무슨 회사인가·왜 그런가)은 전부 상세가 가진다.
 */

/** 거래일 종가·거래량 한 점. 오래된 → 최신 순으로 넘긴다. */
export interface DailyPoint {
  close: number;
  volume: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// A-1. 시장은 빠지는데 이것만 버텨요
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 시장 대비 초과 연속일 최소치. 이보다 짧으면 하루 이틀 잡음이라 "버틴다" 고 말할 수 없다.
 *
 * ## 5 → 3 (WO-RESET-04 §0-2, 실측 근거)
 *
 * 5는 WO-RESET-03 A-1 의 예시 문안(`5일 연속 시장보다 강해요`)에서 왔다. 그런데 배포 후
 * 실측에서 **한 종목도 넘지 못했다.** 조건을 걸지 않고 잰 분포가 이랬다:
 *
 * | 값 | 실측(56종목) |
 * |---|---|
 * | 최대 연속일수 | **3일** |
 * | 3일 이상 종목 | 3 |
 * | 4일 이상 종목 | **0** |
 *
 * **5일 연속 매일 지수를 이기는 종목은 실제로 없다.** 3으로 낮춘다.
 * 그래도 3장 안팎인데, 그건 임계가 아니라 **유니버스(66종목)** 문제다(WO-RESET-04 PART D).
 */
export const MARKET_DIVERGENCE_MIN_DAYS = 3;

/**
 * 창 안에서 지수가 **내린 날**이 최소 몇 날이어야 하는가.
 *
 * 이 조건이 없으면 지수가 계속 오른 구간에서 조금 더 오른 종목까지 "시장은 빠지는데" 가 된다 —
 * 문장이 거짓이 된다. WO 가 조건에 `지수가 하락한 날 포함` 을 못박은 이유다.
 */
export const MARKET_DIVERGENCE_MIN_DOWN_DAYS = 2;

export interface MarketDivergence {
  /** 지수 대비 연속 초과 일수. */
  days: number;
  /** 창 안 지수 등락률(%) — 음수여야 "시장은 빠지는데" 가 성립한다. */
  indexChangePct: number;
  /** 창 안 종목 등락률(%). */
  stockChangePct: number;
  /** 그림 재료 — 창 구간의 지수·종목 종가(각자 정규화해서 그린다). */
  indexSeries: number[];
  stockSeries: number[];
}

function pctChange(series: readonly number[]): number | null {
  const first = series[0];
  const last = series.at(-1);
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
 * @param index 같은 날짜에 정렬된 지수 종가. **길이가 다르면 판정하지 않는다** —
 *              어긋난 날짜를 비교하면 결과가 거짓이 된다.
 */
export function detectMarketDivergence(
  stock: readonly number[],
  index: readonly number[]
): MarketDivergence | null {
  if (stock.length !== index.length) return null;
  if (stock.length < MARKET_DIVERGENCE_MIN_DAYS + 1) return null;

  // 뒤에서부터 "종목 일간수익률 > 지수 일간수익률" 이 이어지는 만큼 센다.
  let days = 0;
  for (let i = stock.length - 1; i > 0; i -= 1) {
    const s0 = stock[i - 1]!;
    const s1 = stock[i]!;
    const x0 = index[i - 1]!;
    const x1 = index[i]!;
    if (!(s0 > 0) || !(x0 > 0)) break;
    if ((s1 - s0) / s0 <= (x1 - x0) / x0) break;
    days += 1;
  }
  if (days < MARKET_DIVERGENCE_MIN_DAYS) return null;

  const stockWindow = stock.slice(-(days + 1));
  const indexWindow = index.slice(-(days + 1));

  // 창 안에 지수가 내린 날이 실제로 있어야 "시장은 빠지는데" 다.
  let downDays = 0;
  for (let i = 1; i < indexWindow.length; i += 1) {
    if (indexWindow[i]! < indexWindow[i - 1]!) downDays += 1;
  }
  if (downDays < MARKET_DIVERGENCE_MIN_DOWN_DAYS) return null;

  const indexChangePct = pctChange(indexWindow);
  const stockChangePct = pctChange(stockWindow);
  if (indexChangePct === null || stockChangePct === null) return null;
  // 지수가 창 전체로는 올랐다면 문장이 거짓이다.
  if (indexChangePct >= 0) return null;

  return {
    days,
    indexChangePct,
    stockChangePct,
    indexSeries: [...indexWindow],
    stockSeries: [...stockWindow],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A-6. 조용하던 거래가 붙기 시작했어요
// ─────────────────────────────────────────────────────────────────────────────

/** 급증 판정 배수 — 최근 거래량이 기준 평균의 이 배 이상. WO 예시 문안이 `3배` 다. */
export const VOLUME_AWAKENING_MULTIPLE = 3;

/** 기준 평균을 재는 창(거래일). 석 달 ≈ 60거래일 — WO 문안 `석 달 만에 처음`. */
export const VOLUME_AWAKENING_BASE_DAYS = 60;

/**
 * 가격이 아직 안 움직였다고 말할 수 있는 상한(%) — **급증 시작일부터 오늘까지의 순변동**.
 *
 * ## 창을 바꿨다 (WO-RESET-04 §0-1, 실측 근거)
 *
 * 종전에는 **급증 당일** 가격 변동을 봤다. 배포 후 실측에서 거래량 배수는 최대 **53.8배**
 * (2배 이상 8종목)로 넉넉했는데 카드는 0장이었다 — 전부 이 가격 조건에서 걸렸다.
 * 당연하다: **거래가 53배 터진 날 가격이 3% 안에 머물 리 없다.**
 *
 * 이 카드가 말하려는 것은 "거래는 붙기 시작했는데 **아직** 안 움직였다" 이고, 그건 하루가
 * 아니라 **급증 이후 지금까지**의 이야기다. 그래서 창을 급증 시작일 → 오늘로 바꾼다.
 * 급증일 당일 튀었다가 되돌아왔으면 여전히 "아직 안 움직인" 것이 맞다.
 *
 * 상한 5%: WO 가 준 범위(3~7%)의 가운데다. **잠정값이고**, 순변동 분포를 계측해
 * (`probeQuietSignals.spikeNetMovePct`) 근거가 모이면 확정한다.
 */
export const VOLUME_AWAKENING_MAX_MOVE_PCT = 5;

export interface VolumeAwakening {
  /** 최근 거래량이 기준 평균의 몇 배인가. */
  multiple: number;
  /** 기준 평균을 잰 거래일 수. */
  baseDays: number;
  /** 급증 시작 직전 → 오늘 순변동률(%). 당일 변동이 아니다(WO-RESET-04 §0-1). */
  movePct: number;
  /** 그림 재료 — 창 구간 거래량(오래된 → 최신). */
  volumeSeries: number[];
  /** 급증 구간 시작 인덱스(`volumeSeries` 기준). 이 구간만 accent 로 칠한다. */
  spikeFrom: number;
}

/**
 * 오래 조용하다가 거래가 붙었는가. 그리고 **가격은 아직 안 움직였는가.**
 *
 * @param points 오래된 → 최신. 최소 `VOLUME_AWAKENING_BASE_DAYS + 1` 개가 필요하다 —
 *               기준 평균을 잴 배경이 없으면 "석 달 만에 처음" 을 말할 수 없다.
 */
export function detectVolumeAwakening(points: readonly DailyPoint[]): VolumeAwakening | null {
  const usable = points.filter((p) => Number.isFinite(p.close) && Number.isFinite(p.volume) && p.volume >= 0);
  if (usable.length < VOLUME_AWAKENING_BASE_DAYS + 1) return null;

  const latest = usable.at(-1)!;
  const base = usable.slice(-(VOLUME_AWAKENING_BASE_DAYS + 1), -1);
  const baseAvg = base.reduce((sum, p) => sum + p.volume, 0) / base.length;
  if (!(baseAvg > 0)) return null;

  const multiple = latest.volume / baseAvg;
  if (multiple < VOLUME_AWAKENING_MULTIPLE) return null;

  /**
   * 급증 구간 — 마지막 날부터 거슬러 올라가며 기준 평균의 배수를 넘는 날을 센다.
   * 하루짜리 급증이 대부분이지만 이틀 이어지는 경우도 있어 그대로 칠한다.
   */
  const window = usable.slice(-(VOLUME_AWAKENING_BASE_DAYS + 1));
  let spikeFrom = window.length - 1;
  while (spikeFrom > 0 && window[spikeFrom - 1]!.volume >= baseAvg * VOLUME_AWAKENING_MULTIPLE) {
    spikeFrom -= 1;
  }

  /**
   * **급증 시작 직전** 종가 → 오늘 종가의 순변동. 당일 변동이 아니다(§0-1).
   * 시작 직전이 창 밖이면 시작일 자체를 기준으로 삼는다(그때는 창 첫날이 급증일이다).
   */
  const beforeSpike = window[Math.max(0, spikeFrom - 1)]!;
  if (!(beforeSpike.close > 0)) return null;
  const movePct = ((latest.close - beforeSpike.close) / beforeSpike.close) * 100;
  if (Math.abs(movePct) > VOLUME_AWAKENING_MAX_MOVE_PCT) return null;

  return {
    multiple,
    baseDays: base.length,
    movePct,
    volumeSeries: window.map((p) => p.volume),
    spikeFrom,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 임계 조정용 계측 — **조건을 걸지 않고** 분포만 잰다.
//
// 배포 후 실측에서 D·E 가 0장이었고 계수기가 캐시·지수는 정상임을 보였다(candles 56/66,
// indexKospi 133). 남은 원인은 임계뿐인데, **감으로 낮추면** 이 프로젝트가 계속 경계해온
// "감으로 정한 값" 이 된다. 그래서 먼저 분포를 재고 그 숫자로 고른다.
// ─────────────────────────────────────────────────────────────────────────────

/** 조건 없이 잰 값들 — 임계를 어디 둘지 정하는 근거. */
export interface QuietSignalProbe {
  /** 지수 대비 일별 초과가 이어진 일수(조건 무시). */
  divergenceDays: number;
  /** 창 안 지수 하락일 수. */
  indexDownDays: number;
  /** 창 전체 지수 등락률(%). */
  indexChangePct: number;
  /** 최근 거래량 / 기준 평균. */
  volumeMultiple: number;
  /** 급증일 가격 변동률(%). */
  movePct: number;
}

/** 조건을 걸지 않고 재기만 한다. 어느 조건이 몇 종목을 떨구는지 보려는 용도다. */
export function probeQuietSignals(
  stock: readonly number[],
  index: readonly number[],
  points: readonly DailyPoint[]
): QuietSignalProbe | null {
  if (stock.length !== index.length || stock.length < 2) return null;

  let days = 0;
  for (let i = stock.length - 1; i > 0; i -= 1) {
    const s0 = stock[i - 1]!;
    const x0 = index[i - 1]!;
    if (!(s0 > 0) || !(x0 > 0)) break;
    if ((stock[i]! - s0) / s0 <= (index[i]! - x0) / x0) break;
    days += 1;
  }
  const win = index.slice(-(Math.max(days, 1) + 1));
  let indexDownDays = 0;
  for (let i = 1; i < win.length; i += 1) if (win[i]! < win[i - 1]!) indexDownDays += 1;
  const indexChangePct = pctChange(win) ?? 0;

  const usable = points.filter((p) => Number.isFinite(p.close) && Number.isFinite(p.volume));
  let volumeMultiple = 0;
  let movePct = 0;
  if (usable.length >= VOLUME_AWAKENING_BASE_DAYS + 1) {
    const latest = usable.at(-1)!;
    const base = usable.slice(-(VOLUME_AWAKENING_BASE_DAYS + 1), -1);
    const avg = base.reduce((sum, p) => sum + p.volume, 0) / base.length;
    if (avg > 0) volumeMultiple = latest.volume / avg;
    /**
     * 본 검출과 **같은 창**으로 잰다(급증 시작 직전 → 오늘). 다른 값을 재면 이 숫자로
     * 임계를 고를 수 없다 — 근거가 되려면 같은 것을 재야 한다.
     */
    const win = usable.slice(-(VOLUME_AWAKENING_BASE_DAYS + 1));
    let from = win.length - 1;
    while (from > 0 && win[from - 1]!.volume >= avg * VOLUME_AWAKENING_MULTIPLE) from -= 1;
    const before = win[Math.max(0, from - 1)]!;
    if (before.close > 0) movePct = ((latest.close - before.close) / before.close) * 100;
  }
  return { divergenceDays: days, indexDownDays, indexChangePct, volumeMultiple, movePct };
}

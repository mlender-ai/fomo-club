/**
 * WO-HOOK-01 — 카드 3형 선택기. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 무엇을 푸는가
 *
 * 우리가 파는 것은 "아직 아무 일도 안 일어난 상태"라 호재·급등 같은 자극이 원래 없다. 남은
 * 후킹은 **역행** 하나다 — 주가는 안 움직이는데 안에서는 사고 있다. 종전 카드는 그 긴장을
 * `누가 / 언제 / 얼마나 드문가 / 거래량` 네 줄로 분해해서 없앴다.
 *
 * 그래서 카드를 세 형으로 나눈다. **사람이 고르는 게 아니라 신호가 고른다** — 각 형이 요구하는
 * 데이터가 다르기 때문이다.
 *
 * | 형 | 후킹 | 요구 데이터 |
 * |---|---|---|
 * | A 역행 | 주가는 제자리인데 임원만 사고 있어요 | 매수 누적 시계열 + 같은 기간 주가 |
 * | B 비율 | 하루 거래량의 절반을 사갔어요 | 매수 규모 ÷ 일 거래량 |
 * | C 희소성 | 40거래일 만에 가장 길게 사고 있어요 | 일별 매수 여부 |
 *
 * **어느 형도 성립하지 않으면 `null` 을 돌려준다 — 그 종목은 픽에서 뺀다.** 후킹 없는 카드를
 * 만들지 않는 것이 이 모듈의 존재 이유다(WO-HOOK-01 §1-1·§12).
 *
 * ## 임계값의 근거 — 감으로 정하지 않았다
 *
 * 2026-08-22 정규 도메인 발행 덱 10장 실측(`docs/audit/WO-HOOK-01_THRESHOLDS.md`).
 *
 * | 임계 | 값 | 근거 |
 * |---|---|---|
 * | `FLAT_PCT` | 2.0 | WO §4-1 이 정체 밴드를 ±2% 로 고정 |
 * | `QUIET_UP_PCT` | 3.0 | 덱의 \|신호 후 변동\| **중앙값 2.72%** 를 반올림 — "이 덱의 잡음 범위 안이면 조용한 것" |
 * | `RATIO_PCT` | 10.0 | 실측 분포가 `…2.5` / `22.7…` 로 갈리고 **그 사이가 비어 있다.** 공백 구간 안이면 값에 둔감하다. WO §5-2 카피 하한(<10% 미사용)과도 일치 |
 *
 * `QUIET_UP_PCT` 위(+5.15·+5.99·+15.0%)는 주가가 이미 응답한 것이라 역행이 아니다 — B/C 로 간다.
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 그림을 그리지 않는다. **그림의 재료(정규화 전 원계열)만** 결정에 실어 보내고, 렌더는 화면이
 * 한다. 서버가 픽셀을 계산하면 320px·앱·태블릿이 갈릴 때 서버를 고쳐야 한다.
 */

import type { QuietPickSignalKind } from "./quiet-pick-hook";

// ── 임계값(전부 결정론 상수 — 위 표의 근거를 바꾸지 않고 값만 바꾸지 말 것) ──

/** 정체 밴드(%) — 신호 후 주가 변동이 이 안이면 "제자리". WO §4-1. */
export const FLAT_PCT = 2.0;
/** 소폭 상승 상한(%) — 덱 \|변동\| 중앙값(2.72) 반올림. 이 위는 역행이 아니다. */
export const QUIET_UP_PCT = 3.0;
/** B형 하한(%) — 매수 규모가 일 거래량에서 차지하는 비중. WO §5-2. */
export const RATIO_PCT = 10.0;
/** A형 누적선 최소 표본 — 이보다 짧으면 선이 형태를 못 만든다. */
export const MIN_SERIES_POINTS = 8;
/** 스파크라인 최소 표본 — DS-01 §3-⑤ "20포인트 미만이면 표시하지 않는다". */
export const MIN_SPARKLINE_POINTS = 20;
/** C형 막대 최소 표본 — 창이 이보다 짧으면 "드물다"를 보여줄 배경이 없다. */
export const MIN_BAR_DAYS = 10;

export type CardType = "A" | "B" | "C";

/** A형 그림 재료 — 두 계열을 **각자** 정규화해 그린다(같은 축에 두지 않는다). */
export interface DivergenceFigure {
  kind: "divergence";
  /** 같은 기간 종가. */
  priceSeries: number[];
  /** 날짜별 매수액을 누적한 계열(단조 증가). 단위는 화면에 쓰지 않는다 — 형태만 쓴다. */
  buySeries: number[];
  /** 범례의 매수선 이름 — "임원 매수 누적" / "기관 매수 누적". */
  buyLegend: string;
}

/**
 * B형 그림 재료 — 큰 숫자 + (있으면) 스파크라인.
 *
 * 스파크라인은 **선택**이다. B형에서 후킹을 지는 것은 52px 숫자이고 스파크라인은 보조다.
 * 포인트가 모자라 선을 못 그린다고 카드를 통째로 버리면, 비율이 명백한 픽이 사라진다.
 */
export interface RatioFigure {
  kind: "ratio";
  /** 큰 숫자로 쓸 비율(%). */
  ratioPct: number;
  /** 최근 종가 계열. 20포인트 미만이면 아예 없다(DS-01 §3-⑤ — 형태가 안 보이는 선은 장식). */
  priceSeries?: number[];
  /** 매수 시작 지점 인덱스(`priceSeries` 기준). 범위 밖이면 화면이 마커를 생략한다. */
  markerIndex?: number;
}

/** C형 그림 재료 — 창 안 일별 매수 여부. */
export interface StreakFigure {
  kind: "streak";
  /** 오래된 날 → 최근 날 순. `true` 가 매수일. */
  buyDays: boolean[];
  /** 현재 연속 구간의 시작 인덱스(포함). accent 로 칠할 구간. */
  streakFrom: number;
  /** 현재 연속 구간의 끝 인덱스(포함). */
  streakTo: number;
  /** 캡션에 쓸 주체 — "기관" / "외국인". */
  actor: string;
}

export type CardFigure = DivergenceFigure | RatioFigure | StreakFigure;

export interface CardTypeDecision {
  type: CardType;
  /** 후킹 문장 — 카드에서 가장 큰 텍스트. 최대 2줄. */
  hook: string;
  figure: CardFigure;
  /** 보조 최대 2줄(WO §3-⑤). 칩이 아니라 문장이다. */
  support: string[];
}

export interface CardTypeInput {
  kind: QuietPickSignalKind;
  /** 신호 지속일. */
  days: number;
  /** 신호 시작가 대비 현재가 변동률(%). 없으면 A 판정을 할 수 없다. */
  priceChangeSincePct?: number;
  /**
   * A형 전용 — 누적선과 **같은 날짜에 정렬된** 종가 계열(오래된 → 최근).
   * B형 스파크라인과 다른 계열이다. 섞으면 두 선의 x축이 어긋나 갭이 거짓이 된다.
   */
  priceSeries?: readonly number[];
  /** A형 전용 — 날짜별 매수액 누적 계열(오래된 → 최근). `priceSeries` 와 길이가 맞아야 한다. */
  cumulativeBuySeries?: readonly number[];
  /** 매수 규모 ÷ 20일 평균 거래량 × 100. */
  volumePct?: number;
  /** B형 전용 — 스파크라인용 종가 계열(최근 30거래일). */
  sparkline?: readonly number[];
  /** B형 스파크라인의 매수 시작 지점(`sparkline` 기준). */
  markerIndex?: number;
  /** 창 안 일별 매수 여부(오래된 → 최근). */
  buyDays?: readonly boolean[];
  // ── 보조 2줄 재료 ──
  insiderCount?: number;
  /** 규모 문구 — "$8.3M" / "47만주". */
  scale?: string;
  /** 지난 12개월 임원 매수 건수. */
  priorBuys12mo?: number;
  /** 최근 20일 평균 거래량 ÷ 그 앞 60일 평균. 0.6 이하면 말라 있었다. */
  volumeVacuumRatio?: number;
}

/**
 * 문장 주어 — 신호 종류에서만 만든다(원료 문자열의 금지어 유입 차단).
 *
 * 다중 주체는 `외국인과 기관`(7자)이 아니라 **`외국인·기관`(6자)** 을 쓴다. 후킹은 19px 이라
 * 320px 카드에서 한 줄이 약 15자인데, 긴 형태를 쓰면 `외국인과 기관이 하루 거래량의` 가 16자로
 * 넘쳐 3줄이 된다(§10 완료 기준 12). 기존 훅 빌더(`quiet-pick-hook`)는 24px 한 줄 문장이라
 * 긴 형태를 그대로 쓴다 — 두 곳의 폭 예산이 다르다.
 */
const ACTOR: Record<QuietPickSignalKind, string> = {
  insider_cluster: "임원",
  institution_streak: "기관",
  foreign_streak: "외국인",
  multi_cluster: "외국인·기관",
};

/**
 * 주어 네 개(임원·기관·외국인·외국인과 기관)는 전부 받침으로 끝난다 — 조사가 갈리지 않는다.
 * 그래서 조사 계산 대신 상수를 쓴다. 주어를 늘릴 때는 `josa` 로 바꿀 것.
 */
const ONLY = "만";
const TOPIC = "은";

/**
 * 누적선이 실제로 우상향하는가. **평평하거나 내려가는 누적선으로 A형을 쓰지 않는다**(WO §4-2).
 * 누적 매수는 정의상 단조 증가지만, 표본이 한 점에 몰려 있으면 계단이 아니라 직선이 된다 —
 * 그런 계열은 "안에서는 사고 있다"를 보여주지 못한다.
 */
function risesMeaningfully(series: readonly number[]): boolean {
  if (series.length < MIN_SERIES_POINTS) return false;
  const first = series[0] ?? 0;
  const last = series.at(-1) ?? 0;
  // 계단이 최소 한 번은 있어야 한다. 미국 클러스터는 같은 날 여러 임원이 사는 경우가 흔해
  // 계단이 하나뿐인 것이 정상이다 — 2회 이상을 요구하면 US A형이 통째로 사라진다.
  return last > first;
}

/**
 * 계열이 그릴 수 있는 형태인가 — 길이와 유한성만 본다.
 *
 * **변동을 요구하지 않는다.** 한때 "전부 같은 값이면 버린다"로 짰는데, 완전히 평평한 주가선은
 * A형이 가장 원하는 그림이다 — `주가는 제자리인데`. 값이 하나뿐인 계열을 버리면 이 제품의
 * 최고의 카드가 조용히 사라진다. 정규화에서 0 나누기가 나지 않도록 처리하는 것은 화면 몫이다.
 */
function usableSeries(series: readonly number[] | undefined, min: number): series is number[] {
  if (!series || series.length < min) return false;
  return series.every((v) => Number.isFinite(v));
}

/**
 * A형 후킹 — 주가가 무엇을 하고 있는지에 따라 세 갈래(WO §4-1).
 *
 * 소폭 상승 변형의 `계속` 은 다중 주체에서 뺀다. `외국인·기관이 계속 사고 있어요` 는 17자라
 * 한 줄(약 15자)을 넘긴다. 뺀다고 사실이 달라지지 않는다 — 지속은 보조 줄의 `N일간` 이 말한다.
 */
function divergenceHook(actor: string, changePct: number): string {
  if (changePct < -FLAT_PCT) return `주가는 빠지는데\n${actor}${TOPIC} 사고 있어요`;
  if (changePct > FLAT_PCT) {
    const keeps = actor.length <= 3 ? "계속 " : "";
    return `주가는 조용한데\n${actor}이 ${keeps}사고 있어요`;
  }
  return `주가는 제자리인데\n${actor}${ONLY} 사고 있어요`;
}

/**
 * B형 후킹 — 큰 숫자를 문장으로 **다시 읽어준다**. `51%` 만으로는 무엇의 51% 인지 모른다.
 * 구간별 표현은 WO §5-2 표.
 */
function ratioPhrase(ratioPct: number): string {
  if (ratioPct >= 45) return "하루 거래량의\n절반을 사갔어요";
  if (ratioPct >= 25) return "하루 거래량의\n3분의 1을 사갔어요";
  return "하루 거래량의\n상당 부분을 사갔어요";
}

function ratioHook(actor: string, ratioPct: number): string {
  return `${actor}이 ${ratioPhrase(ratioPct)}`;
}

/** 현재(가장 최근) 연속 매수 구간. 없으면 `null`. */
function currentStreakRange(buyDays: readonly boolean[]): { from: number; to: number } | null {
  const to = buyDays.length - 1;
  if (to < 0 || !buyDays[to]) return null;
  let from = to;
  while (from > 0 && buyDays[from - 1]) from -= 1;
  return { from, to };
}

/** 창 안 최장 연속 구간 길이. */
function longestRun(buyDays: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const day of buyDays) {
    if (day) { run += 1; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

/**
 * 보조 2줄 — 후킹이 말하지 않는 사실만(WO §3-⑤). 칩을 쓰지 않는다.
 *
 * 1줄: 기간·인원·규모  2줄: 희소성 하나. 후킹에 이미 나온 숫자를 되풀이하지 않는다.
 */
function supportLines(input: CardTypeInput, type: CardType, hook: string): string[] {
  const hookNumbers = new Set(hook.match(/\d+/g) ?? []);
  const out: string[] = [];

  const first = [
    input.days > 0 ? `${input.days}일간` : null,
    typeof input.insiderCount === "number" && input.insiderCount > 0 ? `${input.insiderCount}명` : null,
    input.scale?.trim() || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  if (first) out.push(first);

  // 희소성 — 강한 것 하나만. C형은 후킹이 이미 최장 연속을 말하므로 건너뛴다.
  const rarity = ((): string | null => {
    if (typeof input.priorBuys12mo === "number" && input.priorBuys12mo <= 8) {
      if (input.priorBuys12mo === 0) return "지난 1년간 임원이 산 적이 없었어요";
      if (hookNumbers.has(String(input.priorBuys12mo))) return null;
      return `1년 매수는 ${input.priorBuys12mo}건뿐이었어요`;
    }
    if (type !== "C" && typeof input.volumeVacuumRatio === "number" && input.volumeVacuumRatio <= 0.6) {
      return `거래는 평소의 ${Math.round(input.volumeVacuumRatio * 100)}%로 말라 있었어요`;
    }
    return null;
  })();
  if (rarity) out.push(rarity);

  return out.slice(0, 2);
}

/**
 * 카드 형 선택 — WO §1-1 의 규칙을 그대로 옮긴 것.
 *
 * ```
 * if 매수누적 확보 and 주가가 역행         →  A
 * elif 거래량비율 >= RATIO_PCT             →  B
 * elif 일별 매수 여부 확보                  →  C
 * else                                     →  null (픽에서 제외)
 * ```
 *
 * 순서를 바꾸지 말 것. A 가 먼저인 이유는 강해서가 아니라 **요구 데이터가 가장 까다로워서**다 —
 * 뒤로 밀면 A 재료를 가진 종목이 B 로 새어나가 이 제품의 유일한 후킹을 잃는다.
 */
export function selectCardType(input: CardTypeInput): CardTypeDecision | null {
  const actor = ACTOR[input.kind];

  // ── A 역행 ──
  const change = input.priceChangeSincePct;
  const priceOk = usableSeries(input.priceSeries, MIN_SERIES_POINTS);
  const buyOk = input.cumulativeBuySeries !== undefined && risesMeaningfully(input.cumulativeBuySeries);
  const diverges = typeof change === "number" && change <= QUIET_UP_PCT;
  if (priceOk && buyOk && diverges && input.priceSeries && input.cumulativeBuySeries) {
    // 두 계열의 길이를 맞춘다 — 짧은 쪽 기준 뒤에서 자른다(최근이 남아야 한다).
    const n = Math.min(input.priceSeries.length, input.cumulativeBuySeries.length);
    const hook = divergenceHook(actor, change);
    return {
      type: "A",
      hook,
      figure: {
        kind: "divergence",
        priceSeries: input.priceSeries.slice(-n),
        buySeries: input.cumulativeBuySeries.slice(-n),
        buyLegend: `${actor} 매수 누적`,
      },
      support: supportLines(input, "A", hook),
    };
  }

  // ── B 비율 ──
  if (typeof input.volumePct === "number" && input.volumePct >= RATIO_PCT) {
    const sparkOk = usableSeries(input.sparkline, MIN_SPARKLINE_POINTS);
    const hook = ratioHook(actor, input.volumePct);
    return {
      type: "B",
      hook,
      figure: {
        kind: "ratio",
        ratioPct: Math.round(input.volumePct),
        ...(sparkOk && input.sparkline ? { priceSeries: [...input.sparkline] } : {}),
        ...(sparkOk && typeof input.markerIndex === "number" ? { markerIndex: input.markerIndex } : {}),
      },
      support: supportLines(input, "B", hook),
    };
  }

  // ── C 희소성 ──
  const buyDays = input.buyDays;
  if (buyDays && buyDays.length >= MIN_BAR_DAYS) {
    const range = currentStreakRange(buyDays);
    if (range) {
      const runLength = range.to - range.from + 1;
      const isLongest = runLength >= longestRun(buyDays);
      const hook = isLongest
        ? `${buyDays.length}거래일 만에\n가장 길게 사고 있어요`
        : `${actor}이 ${runLength}일째\n조용히 사고 있어요`;
      return {
        type: "C",
        hook,
        figure: { kind: "streak", buyDays: [...buyDays], streakFrom: range.from, streakTo: range.to, actor },
        support: supportLines(input, "C", hook),
      };
    }
  }

  // 세 형 중 어느 것도 성립하지 않는다 — 후킹 없는 카드를 만들지 않는다.
  return null;
}

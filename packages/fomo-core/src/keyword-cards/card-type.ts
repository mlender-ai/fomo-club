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
 * | `RATIO_PCT` | 20.0 | 08-22 표본의 공백 구간(2.5~22.7) 안이라 그때 분류는 그대로다. **08-24 에 14.4(풍산)가 그 공백에서 나왔고**, 그 값이 상세의 `VOLUME_SHARE_FLOOR`(20) 아래라 카드는 히어로로 띄우고 상세는 근거로 안 치는 모순이 드러났다. 두 임계를 20 으로 합친다 |
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
/**
 * B형 하한(%) — 매수 규모가 일 거래량에서 차지하는 비중.
 *
 * ## 왜 10 이 아니라 20 인가 (2026-08-24)
 *
 * 이 값은 **상세의 `VOLUME_SHARE_FLOOR`(`apps/fomo-web/lib/depthSections.ts`)와 같아야 한다.**
 * 둘이 갈려 있으면 앱이 자기 숫자를 스스로 근거로 안 치는 상태가 된다 — 실제로 그랬다:
 * 풍산 `volumePct 14.4` 가 카드에서는 52px 히어로였고, 상세에서는 `20 미만은 소음` 규칙에
 * 걸려 **행 자체가 없었다.** 확인하러 들어간 화면에서 확인할 대상이 사라졌다.
 *
 * 20 을 고른 이유는 상세 쪽이 이미 실측(휴니드 0.5%)으로 그 선을 잡아뒀고, 08-22 표본의
 * 관측 공백(2.5~22.7) **안**이라 그때 분류가 하나도 안 바뀌기 때문이다. 즉 이 변경은
 * 과거 판정을 뒤집지 않고 모순만 걷어낸다.
 *
 * 공백이 비어 보였던 것은 표본이 10장이어서였다 — 14.4 가 나오면서 그 구간이 실재함이 드러났다.
 */
export const RATIO_PCT = 20.0;
/** A형 누적선 최소 표본 — 이보다 짧으면 선이 형태를 못 만든다. */
export const MIN_SERIES_POINTS = 8;

/**
 * A형 그림에 그리는 거래일 수 — **훅이 판정하는 창과 같은 창이다.**
 *
 * ## 왜 이 상수가 생겼나 (2026-08-25)
 *
 * 종전에는 창 길이가 `min(priceSeries.length, cumulativeBuySeries.length)` = 사실상 **40일**
 * 이었고, 훅은 `priceChangeSincePct`(신호 시작가 대비, 보통 **3~6일**)로 판정했다.
 * **두 창이 달랐다.** 결과가 화면에서 이렇게 나왔다:
 *
 * | 종목 | 훅 | 그린 40일 구간 |
 * |---|---|---|
 * | 한글과컴퓨터 | `주가는 제자리인데` | 순변동 **+4.1%** · 진폭 **27.8%** |
 * | 휴니드 | `주가는 빠지는데` | 순변동 **+4.0%** (오히려 상승) |
 * | 퍼스텍 | `주가는 빠지는데` | 순변동 −1.9% · 진폭 **40.4%** |
 *
 * "딱 봐도 차트가 움직이는데 뭔 주가가 제자리냐" 는 지적이 정확했다. 모듈 문서가 이미
 * `A 역행 | 매수 누적 시계열 + **같은 기간** 주가` 라고 적어뒀는데 코드가 그걸 안 지켰다.
 *
 * ## 12를 고른 근거 (실측, 2026-08-25 발행 덱 A형 3장)
 *
 * | 창 | 한글과컴퓨터 | 휴니드 | 퍼스텍 | 판정 |
 * |---|---|---|---|---|
 * | 40(현행) | +4.1 / 27.8 | +4.0 / 22.5 | −1.9 / 40.4 | 2장이 A형 자격 상실, 1장은 진폭 40%에 "제자리" |
 * | **12** | **−7.6 / 11.6** | **+0.1 / 8.0** | **−6.3 / 15.0** | 3장 모두 훅이 그림과 일치 |
 * | 9(=days×3) | −9.8 / 11.6 | **+13.5 / 22.5** | −6.3 / 15.0 | 휴니드가 터진다 |
 * | 10 | −9.3 / 11.6 | −4.3 / 7.8 | −11.2 / 15.0 | 가능하나 12보다 진폭 이득 없음 |
 *
 * 12는 `MIN_SERIES_POINTS`(8) 위로 여유가 있고, 신호 길이(3~11일)를 덮으면서, 관측된 A형
 * 진폭을 8~15%로 묶는다. **표본 3장이다** — 값을 바꾸려면 다시 재고 이 표를 같이 고친다.
 */
export const DIVERGENCE_WINDOW = 12;

/**
 * A형(역행) 최대 상관계수 — **두 선이 이보다 함께 움직이면 역행이 아니다.**
 *
 * ## 왜 생겼나 (WO-RESET-01 B-2, 2026-08-25)
 *
 * 카드가 `주가는 빠지는데 / 기관은 사고 있어요` 라고 쓰는데 그림에서는 회색선(주가)과
 * 라임선(매수 누적)이 **거의 나란히** 움직였다. 글이 말하는 걸 그림이 반박했다.
 *
 * 종전 A형 조건은 "주가가 많이 안 올랐다"(`change <= QUIET_UP_PCT`) 뿐이었다. 그건 **주가
 * 한 계열만** 보는 조건이라, 매수선이 주가와 같이 가든 반대로 가든 통과한다. 역행은 두 선의
 * **관계**인데 관계를 재지 않았다.
 *
 * 그래서 관계를 직접 잰다 — 피어슨 상관계수. 각 계열을 따로 정규화해 그리지만 정규화는
 * 선형변환이라 상관계수를 바꾸지 않는다. 즉 **이 수치가 화면에 보이는 모양과 정확히 일치한다.**
 *
 * ## 0.5 의 근거 (실측, 2026-08-25 발행 덱 A형 5장)
 *
 * | 종목 | 상관계수 | 눈으로 본 것 |
 * |---|---|---|
 * | 한글과컴퓨터 | **+0.81** | "거의 나란히 움직인다" — 지적받은 그 카드 |
 * | 셀바스AI | **+0.56** | 절반 이상 함께 움직인다 |
 * | 퍼스텍 | +0.06 | 무관 |
 * | 풍산 | −0.02 | 무관 |
 * | 휴니드 | **−0.29** | 반대로 간다 — 진짜 역행 |
 *
 * 0.5 는 "절반 이상 함께 움직이면 역행이라 부르지 않는다" 는 뜻이다. 지적받은 0.81 과
 * 그 다음으로 붙어 있던 0.56 이 함께 걸리고, 무관·역행(0.06 이하)만 남는다.
 * **표본 5장이다** — 값을 바꾸려면 다시 재고 이 표를 같이 고친다.
 */
export const DIVERGENCE_MAX_CORRELATION = 0.5;
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
  /**
   * 캡션에 쓸 주체 — "기관" / "외국인" / "임원".
   *
   * A 의 `buyLegend`·C 의 `actor` 와 같은 자리다. 세 형 모두 그림 아래 한 줄이 **accent 가
   * 무엇인지** 말해야 하는데, B 만 그 줄이 없어 52px 숫자가 맨몸으로 서 있었다(실측: 바로 위
   * `+5.7%` 옆에서 수익률로 읽힌다).
   */
  actor: string;
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
/**
 * 피어슨 상관계수. 두 계열 길이가 같아야 하고, 한쪽이라도 분산이 0 이면 `null`.
 *
 * 정규화는 선형변환이라 이 값을 바꾸지 않는다 — 화면에 그려지는 두 선의 모양이 얼마나
 * 닮았는지를 그대로 잰다.
 */
function correlation(a: readonly number[], b: readonly number[]): number | null {
  const n = a.length;
  if (n < 2 || b.length !== n) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (!(da > 0) || !(db > 0)) return null;
  return num / Math.sqrt(da * db);
}

/** 그린 창의 첫 종가 → 마지막 종가 변동률(%). 재료가 모자라면 `null`. */
function windowChangePct(series: readonly number[]): number | null {
  const first = series[0];
  const last = series.at(-1);
  if (typeof first !== "number" || typeof last !== "number" || !(first > 0)) return null;
  return ((last - first) / first) * 100;
}

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
 *
 * ## `상당 부분` 을 지웠다 (2026-08-24)
 *
 * 종전 하한(10)에서 10~25% 구간은 전부 `상당 부분을 사갔어요` 로 뭉뚱그려졌다. 그것은 후킹이
 * 아니라 **말을 안 한 것**이다 — 14%를 상당 부분이라 부르면 사용자는 아무것도 알게 되지 않는다.
 * 하한이 20 으로 올라간 지금 전 구간이 구체적 분수를 말할 수 있으므로 모호한 갈래를 없앤다.
 * 20 미만은 애초에 B형이 아니다(카드에서 빠진다).
 */
function ratioPhrase(ratioPct: number): string {
  if (ratioPct >= 45) return "하루 거래량의\n절반을 사갔어요";
  if (ratioPct >= 25) return "하루 거래량의\n3분의 1을 사갔어요";
  return "하루 거래량의\n5분의 1을 사갔어요";
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
  const priceOk = usableSeries(input.priceSeries, MIN_SERIES_POINTS);
  const buyOk = input.cumulativeBuySeries !== undefined && risesMeaningfully(input.cumulativeBuySeries);
  /**
   * 창은 `DIVERGENCE_WINDOW` 로 자른다: **훅이 판정하는 창과 그리는 창이 같아야 한다.**
   * 두 계열의 길이도 맞춘다 — 짧은 쪽 기준 뒤에서 자른다(최근이 남아야 한다).
   */
  const n =
    priceOk && buyOk && input.priceSeries && input.cumulativeBuySeries
      ? Math.min(input.priceSeries.length, input.cumulativeBuySeries.length, DIVERGENCE_WINDOW)
      : 0;
  const priceWindow = n > 0 ? input.priceSeries!.slice(-n) : [];
  /**
   * 판정 근거는 **그린 창의 순변동**이다. 종전에는 `priceChangeSincePct`(신호 시작가 대비)를
   * 썼는데, 그 창(3~6일)과 그리는 창(40일)이 달라 훅이 그림과 정면으로 어긋났다.
   *
   * 자격 미달이면 **A 만 건너뛴다** — 아래 B·C 가 이어서 판정한다(그래서 여기서 return 하지 않는다).
   */
  const change = n > 0 ? windowChangePct(priceWindow) : null;
  /**
   * 역행은 **두 선의 관계**다 — 주가 한 계열만 봐서는 판정할 수 없다(WO-RESET-01 B-2).
   * 상관계수를 못 구하면(분산 0 등) 통과시킨다: 평평한 주가 옆에서 매수만 오르는 것은
   * A형의 최고 재료이지 탈락 사유가 아니다.
   */
  const buyWindow = n > 0 ? input.cumulativeBuySeries!.slice(-n) : [];
  const corr = n > 0 ? correlation(priceWindow, buyWindow) : null;
  const movesApart = corr === null || corr < DIVERGENCE_MAX_CORRELATION;
  if (n > 0 && change !== null && change <= QUIET_UP_PCT && movesApart && input.cumulativeBuySeries) {
    const hook = divergenceHook(actor, change);
    return {
      type: "A",
      hook,
      figure: {
        kind: "divergence",
        priceSeries: priceWindow,
        buySeries: buyWindow,
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
        actor,
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

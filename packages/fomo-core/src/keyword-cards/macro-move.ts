/**
 * MACRO-01 §C — **언제 거시 카드를 만드나.**
 *
 * ## 아무 날에나 만들지 않는다
 *
 * 지표는 매일 조금씩 움직인다. 그 조금을 다 카드로 만들면 「환율이 0.1% 올랐어요」 같은
 * 소음이 덱을 채운다. 네 가지 사건만 카드가 된다:
 *
 * | 종류 | 무엇 | 왜 사건인가 |
 * |---|---|---|
 * | `streak` | N일 연속 같은 방향 + 누적 변동률 초과 | 하루 튀었다 돌아온 것과 다르다 |
 * | `spike` | 하루에 크게 움직임 | 연속이 아니어도 그 자체가 사건 |
 * | `level` | 심리적 기준선 통과 (환율 1,400원 등) | 숫자가 아니라 선을 넘은 것 |
 * | `inversion` | 장단기 금리차 부호 반전 | 값의 변화가 아니라 관계의 역전 |
 *
 * **임계는 전부 과거 분포에서 잡았다**(`docs/MACRO_THRESHOLDS.md`). 감으로 정하지 않는다 —
 * 그 규칙은 WO-RESET-04 에서 배웠고 여기서도 같다.
 *
 * ## 신선도가 조건이다
 *
 * 오래된 거시 데이터는 정보가 아니다. 6일 전 유가로 「3일째 내리고 있어요」라고 말하면
 * 그건 오늘 이야기가 아니다. **거래일 2일 · 달력 3일을 넘게 묵은 지표는 카드를 만들지
 * 않는다**(§B-3). 두 자를 같이 쓰는 이유는 `MACRO_MAX_STALE_CALENDAR_DAYS` 에 적어 뒀다.
 */

import { josa } from "./josa";
import {
  MACRO_INDICATORS,
  formatMacroValue,
  macroIndicator,
  type MacroCategory,
  type MacroIndicator,
  type MacroIndicatorId,
} from "./macro-indicators";

export type { MacroCategory, MacroIndicator, MacroIndicatorId, MacroUnit } from "./macro-indicators";
export { MACRO_INDICATORS, formatMacroValue, macroIndicator } from "./macro-indicators";

/** 한 지표의 최근 값들(오래된 → 최신). */
export interface MacroSeries {
  id: MacroIndicatorId;
  points: ReadonlyArray<{ date: string; value: number }>;
}

/** 어떤 사건이라 카드가 됐나. 화면 문장이 이걸로 갈린다(§D-3). */
export type MacroMoveKind = "streak" | "spike" | "level" | "inversion";

export interface MacroMove {
  indicator: MacroIndicator;
  kind: MacroMoveKind;
  /** 며칠째 같은 방향인가. `spike`·`level` 은 1일 수 있다. */
  streakDays: number;
  direction: "up" | "down";
  from: number;
  to: number;
  changePct: number;
  /** `level` 일 때 통과한 기준선. */
  crossedLevel?: number;
  /** 그림 재료 — 최근 값들. */
  series: number[];
  /** 최신 관측일. */
  asOf: string;
  /**
   * 정렬용 점수 — **지표별 임계 대비 몇 배로 움직였나.** 환율 2%와 VIX 2%를 같은 자로
   * 재면 언제나 VIX 가 진다. 임계로 나눠야 비교가 성립한다.
   */
  strength: number;
}

/** 연속 방향이 이 일수 이상이어야 「N일째」라고 말한다. */
export const MACRO_MIN_STREAK = 3;

/** 추이선에 쓸 관측 수. */
export const MACRO_SERIES_POINTS = 20;

/**
 * 관측이 이보다 오래되면 카드를 만들지 않는다(§B-3) — **거래일로 센다.**
 *
 * WO 는 「3일 이상 오래되면」이라고 썼다. 그걸 달력일로 그대로 세면 **월요일마다 거시
 * 카드가 전멸한다** — 금요일 종가는 월요일에 달력으로 3일 묵은 값이지만 그사이 시장이
 * 열린 적이 없다. 묵은 게 아니라 그게 최신이다.
 *
 * 그래서 게이트는 거래일(주말 제외)로 세고, **화면 표시는 달력일 그대로** 둔다. 사용자가
 * 세는 것은 달력이므로 `3일 전 기준`이라고 쓰는 게 맞다. 거르는 자와 보여주는 자를
 * 일부러 다르게 뒀다.
 *
 * 공휴일은 세지 않는다 — 우리는 휴장일표를 갖고 있지 않다. 연휴가 길면 하루이틀 더
 * 관대해지는데, 그건 **잘못 버리는 것보다 낫다.**
 */
export const MACRO_MAX_STALE_TRADING_DAYS = 2;

/**
 * 달력일 상한 — **화면에 `4일 전 기준` 이 뜨면 안 된다.**
 *
 * 거래일만 세면 금요일 값이 화요일까지 통과한다(거래일 2일). 그런데 화면에는 `4일 전 기준`
 * 이라고 쓰이고, 그건 사용자가 지적한 「6일 전 데이터」와 같은 종류의 불쾌함이다.
 *
 * 그래서 **두 조건을 다 만족해야** 신선하다:
 *
 * | 조건 | 막는 것 |
 * |---|---|
 * | 거래일 ≤ 2 | 소스가 실제로 며칠 밀린 경우 |
 * | 달력일 ≤ 3 | 화면에 오래돼 보이는 값이 뜨는 경우 |
 *
 * 금 → 월(달력 3일 · 거래일 1일)은 통과하고, 금 → 화(달력 4일)는 걸린다. 월요일 카드를
 * 살리면서도 화면에 넉 달 묵은 듯한 숫자가 안 뜬다.
 */
export const MACRO_MAX_STALE_CALENDAR_DAYS = 3;

/** 하루 거시 카드 상한(§C-2). */
export const MACRO_MAX_CARDS = 3;

/** 같은 분류에서 이 장수를 넘지 않는다(§C-2). 금리 셋이 한 덱에 서면 금리 브리핑이 된다. */
export const MACRO_MAX_PER_CATEGORY = 2;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/**
 * 관측일이 오늘 기준 얼마나 묵었나. 화면에 그대로 쓴다(§B-3).
 *
 * 절대 날짜(`8월 25일 기준`)를 쓰면 사용자가 오늘 날짜와 빼봐야 오래됐다는 걸 안다.
 * **상대 시간은 그 계산을 대신해 준다.**
 */
export function macroFreshnessLabel(asOf: string, today: string): string {
  const gap = daysBetween(asOf, today);
  if (!Number.isFinite(gap) || gap < 0) return "기준일 미상";
  if (gap === 0) return "오늘 기준";
  if (gap === 1) return "어제 기준";
  return `${gap}일 전 기준`;
}

/** 두 날짜 사이의 거래일 수 — 주말만 뺀다(공휴일표는 없다). */
export function tradingDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

/** 카드를 만들 만큼 최근 값인가(§B-3) — 거래일과 달력일 **둘 다** 봐야 한다. */
export function isMacroFresh(asOf: string, today: string): boolean {
  const calendar = daysBetween(asOf, today);
  if (!Number.isFinite(calendar) || calendar < 0 || calendar > MACRO_MAX_STALE_CALENDAR_DAYS) return false;
  return tradingDaysBetween(asOf, today) <= MACRO_MAX_STALE_TRADING_DAYS;
}

/** 최신에서 거슬러 올라가며 같은 방향이 이어진 구간 길이. */
function streakOf(points: ReadonlyArray<{ value: number }>): { streak: number; direction: "up" | "down" | null } {
  let streak = 0;
  let direction: "up" | "down" | null = null;
  for (let i = points.length - 1; i > 0; i -= 1) {
    const now = points[i]!.value;
    const before = points[i - 1]!.value;
    if (now === before) break;
    const step: "up" | "down" = now > before ? "up" : "down";
    if (direction === null) direction = step;
    else if (direction !== step) break;
    streak += 1;
  }
  return { streak, direction };
}

function pctChange(from: number, to: number): number | null {
  if (!(Math.abs(from) > 0)) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * 지표가 「움직였다」고 말할 수 있는가. 네 사건을 **강한 것부터** 본다.
 *
 * 관계 역전 > 기준선 통과 > 급변 > 연속 순이다. 장단기 금리가 뒤집힌 날 그걸
 * 「3일째 내리고 있어요」로 말하면 훨씬 작은 이야기가 된다.
 */
export function detectMacroMove(series: MacroSeries): MacroMove | null {
  const indicator = macroIndicator(series.id);
  if (!indicator) return null;
  const points = series.points.filter((p) => Number.isFinite(p.value));
  if (points.length < 2) return null;

  const latest = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const tail = points.slice(-MACRO_SERIES_POINTS).map((p) => p.value);
  const base = {
    indicator,
    series: tail,
    asOf: latest.date,
  };

  // ① 관계 역전 — 부호가 바뀌었나. 값의 변화가 아니라 관계의 역전이다.
  if (indicator.invertible && Math.sign(latest.value) !== Math.sign(prev.value) && latest.value !== 0) {
    return {
      ...base,
      kind: "inversion",
      streakDays: 1,
      direction: latest.value > prev.value ? "up" : "down",
      from: prev.value,
      to: latest.value,
      changePct: pctChange(prev.value, latest.value) ?? 0,
      // 역전은 언제나 최상위로 올린다 — 임계 배수로 겨루게 두면 묻힌다.
      strength: 100,
    };
  }

  // ② 기준선 통과 — 숫자가 아니라 선을 넘은 것이다.
  for (const level of indicator.levels ?? []) {
    const crossedUp = prev.value < level && latest.value >= level;
    const crossedDown = prev.value > level && latest.value <= level;
    if (!crossedUp && !crossedDown) continue;
    return {
      ...base,
      kind: "level",
      streakDays: 1,
      direction: crossedUp ? "up" : "down",
      from: prev.value,
      to: latest.value,
      changePct: pctChange(prev.value, latest.value) ?? 0,
      crossedLevel: level,
      strength: 50,
    };
  }

  // ③ 급변 — 하루 만에 크게. 연속이 아니어도 사건이다.
  const dayPct = pctChange(prev.value, latest.value);
  if (dayPct !== null && Math.abs(dayPct) >= indicator.spikePct) {
    return {
      ...base,
      kind: "spike",
      streakDays: 1,
      direction: dayPct > 0 ? "up" : "down",
      from: prev.value,
      to: latest.value,
      changePct: dayPct,
      strength: Math.abs(dayPct) / indicator.spikePct,
    };
  }

  // ④ 연속 흐름 — 며칠째 같은 방향이고 누적으로 충분히 움직였나.
  const { streak, direction } = streakOf(points);
  if (!direction || streak < MACRO_MIN_STREAK) return null;
  const start = points[points.length - 1 - streak];
  if (!start) return null;
  const changePct = pctChange(start.value, latest.value);
  if (changePct === null || Math.abs(changePct) < indicator.movePct) return null;

  return {
    ...base,
    kind: "streak",
    streakDays: streak,
    direction,
    from: start.value,
    to: latest.value,
    changePct,
    strength: Math.abs(changePct) / indicator.movePct,
  };
}

/**
 * 하루치 카드를 고른다(§C-2).
 *
 * - 강한 순(임계 배수) 정렬
 * - 같은 분류 최대 `MACRO_MAX_PER_CATEGORY` 장
 * - 전체 최대 `MACRO_MAX_CARDS` 장
 *
 * **조건에 맞는 게 없으면 0장이다.** 채우려고 임계를 낮추지 않는다.
 */
export function selectMacroMoves<T extends { move: MacroMove }>(candidates: readonly T[]): T[] {
  const sorted = [...candidates].sort((a, b) => b.move.strength - a.move.strength);
  const perCategory = new Map<MacroCategory, number>();
  const out: T[] = [];
  for (const candidate of sorted) {
    if (out.length >= MACRO_MAX_CARDS) break;
    const category = candidate.move.indicator.category;
    const used = perCategory.get(category) ?? 0;
    if (used >= MACRO_MAX_PER_CATEGORY) continue;
    perCategory.set(category, used + 1);
    out.push(candidate);
  }
  return out;
}

/**
 * 카드 결론 — **무슨 일이 벌어지고 있나**. 예측하지 않는다(§D-3).
 *
 * 조사는 받침 따라 붙인다. 고정 `이` 를 쓰면 `국제 유가이` 가 나온다(2026-08-30 실측).
 */
export function macroHook(move: MacroMove): string {
  const name = move.indicator.name;
  const subject = `${name}${josa(name, "이가")}`;

  if (move.kind === "inversion") {
    // 부호가 바뀌었다는 사실만 말한다. 무엇의 전조라고 말하지 않는다.
    return move.to < 0 ? `${subject}\n마이너스로 뒤집혔어요` : `${subject}\n다시 플러스로 돌아왔어요`;
  }
  if (move.kind === "level" && move.crossedLevel !== undefined) {
    const level = formatMacroValue(move.indicator, move.crossedLevel);
    /**
     * **목적격 조사를 붙이지 않는다.** `${level}을 넘었어요` 로 쓰면 단위마다 정답이 갈린다 —
     * `1,400원을`(맞음) · `$80.0을`(틀림, 「달러를」) · `4.00%을`(틀림, 「퍼센트를」). 숫자를
     * 소리로 읽어야 받침이 정해지는데 우리는 그 소리를 모른다. 조사가 필요 없는 말로 쓴다.
     */
    return move.direction === "up"
      ? `${subject}\n${level} 위로 올라섰어요`
      : `${subject}\n${level} 아래로 내려왔어요`;
  }
  if (move.kind === "spike") {
    const pct = Math.abs(move.changePct).toFixed(1);
    const dir = move.direction === "up" ? "올랐어요" : "내렸어요";
    return `${subject}\n하루에 ${pct}% ${dir}`;
  }
  const dir = move.direction === "up" ? "오르고" : "내리고";
  return `${subject}\n${move.streakDays}일째 ${dir} 있어요`;
}

/**
 * 1년 밴드 안에서 지금이 어디쯤인가 (DETAIL-01 §A-1).
 *
 * 값 하나만 보면 `$83.9` 가 높은지 낮은지 알 수 없다. **밴드가 있어야 숫자가 뜻을 가진다.**
 *
 * 표본이 모자라면 `null` — 20일치로 "최근 1년 중" 이라고 말하면 거짓이다.
 * 고저가 같으면(움직이지 않은 지표) 위치를 만들지 않는다 — 0으로 나눈 값은 위치가 아니다.
 */
export interface MacroBand {
  low: number;
  high: number;
  /** 0~100. 낮을수록 밴드 바닥에 가깝다. */
  percentile: number;
  /** 화면 문장 — `최근 1년 중 낮은 편이에요`. */
  label: string;
  /** 실제로 쓴 표본 수. "1년" 이라 말할 자격이 있는지 화면이 판단할 근거. */
  points: number;
}

/** 밴드 문장을 만들 최소 표본. 반년치는 있어야 "1년 중" 이 거짓말이 아니다. */
export const MACRO_BAND_MIN_POINTS = 120;

export function macroBand(points: ReadonlyArray<{ value: number }>): MacroBand | null {
  const values = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length < MACRO_BAND_MIN_POINTS) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (!(high > low)) return null;
  const current = values[values.length - 1]!;
  const percentile = Math.round(((current - low) / (high - low)) * 100);
  const label =
    percentile <= 25
      ? "최근 1년 중 낮은 편이에요"
      : percentile >= 75
        ? "최근 1년 중 높은 편이에요"
        : "최근 1년 중 중간쯤이에요";
  return { low, high, percentile, label, points: values.length };
}

/** 상세 차트용 창 — 카드의 20점보다 길게 본다(§A-1). */
export const MACRO_DETAIL_SERIES_POINTS = 60;

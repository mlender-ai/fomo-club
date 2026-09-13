/**
 * LAB-04 — 전략 정의(JSON)의 조건을 지표 값으로 판정한다.
 *
 * 정의에는 코드가 없다(LAB-02 PART B-1). 그래서 여기가 **이름 → 구현** 을 잇는
 * 유일한 자리다. 표현식을 평가하지 않는다 — 비교 연산자도 이름으로 받는다.
 *
 * ## 모르는 것은 참이 아니다
 *
 * 지표가 `null` 을 주면(봉이 모자라거나 데이터가 없으면) 그 조건은 **거짓**이다.
 * "모르니까 통과" 로 두면 시계열 앞머리에서 조건 없이 진입한다.
 */
import type { ConditionGroup, ConditionNode } from "../strategy-definition";
import {
  atr,
  consecutive,
  ma,
  maCross,
  pctFromHigh,
  pctFromLow,
  pctFromMa,
  rsi,
  volumeRatio,
  whaleFlow,
  type IndicatorValue,
  type Window,
} from "./indicators";

/** 지표가 쓸 수 있는, 봉 밖에서 오는 값. */
export interface ExternalContext {
  whaleNetNow: number | null;
  /** `window_hours` 전의 순포지션. 실행기가 채운다. */
  whaleNetPast: number | null;
}

const EMPTY_CONTEXT: ExternalContext = { whaleNetNow: null, whaleNetPast: null };

function numberParam(node: Record<string, unknown>, key: string, fallback: number): number {
  const value = node[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 기간 인자. `period` 와 `window` 를 **둘 다 받는다.**
 *
 * 지시서(LAB-06)는 `"window": 20` 으로 쓰고 이 엔진은 `period` 로 읽고 있었다.
 * 한쪽만 받으면 다른 쪽 이름으로 쓴 정의가 **조용히 기본값으로 돈다** —
 * 정의에 20 이라고 적혀 있는데 엔진은 다른 값을 쓰는 상태가 되고, 아무도 모른다.
 */
function periodParam(node: Record<string, unknown>, fallback: number): number {
  const period = node.period;
  if (typeof period === "number" && Number.isFinite(period)) return period;
  return numberParam(node, "window", fallback);
}

/** 지표 이름 → 값. 모르는 이름은 `null` 이고, 그 조건은 거짓이 된다. */
export function indicatorValue(
  name: string,
  node: Record<string, unknown>,
  window: Window,
  context: ExternalContext
): IndicatorValue {
  switch (name) {
    case "ma":
      return ma(window, periodParam(node, 20));
    case "ma_cross":
      return maCross(window, numberParam(node, "fast", 20), numberParam(node, "slow", 60));
    case "rsi":
      return rsi(window, periodParam(node, 14));
    case "atr":
      return atr(window, periodParam(node, 14));
    case "volume_ratio":
      return volumeRatio(window, periodParam(node, 20));
    case "pct_from_high":
      return pctFromHigh(window, periodParam(node, 20));
    case "pct_from_low":
      return pctFromLow(window, periodParam(node, 20));
    case "pct_from_ma":
      return pctFromMa(window, periodParam(node, 20));
    case "consecutive":
      return consecutive(window);
    case "whale_flow":
      return whaleFlow(context.whaleNetNow, context.whaleNetPast);
    default:
      return null;
  }
}

/**
 * 비교. 정의에 쓸 수 있는 연산자는 **이름뿐**이다 — `min`·`max`·`eq`·`dir`.
 * 표현식 문자열을 평가하는 길을 만들지 않는다.
 */
function compare(value: number, node: Record<string, unknown>): boolean {
  let checked = false;

  const min = node.min;
  if (typeof min === "number") {
    checked = true;
    if (value < min) return false;
  }
  const max = node.max;
  if (typeof max === "number") {
    checked = true;
    if (value > max) return false;
  }
  const eq = node.eq;
  if (typeof eq === "number") {
    checked = true;
    if (value !== eq) return false;
  }
  // 방향 표기. `ma_cross` 는 up/down(1/−1), `whale_flow` 는 long/short(부호).
  const dir = node.dir;
  if (typeof dir === "string") {
    checked = true;
    if (dir === "long") {
      if (!(value > 0)) return false;
    } else if (dir === "short") {
      if (!(value < 0)) return false;
    } else {
      const want = dir === "up" ? 1 : dir === "down" ? -1 : 0;
      if (value !== want) return false;
    }
  }

  // `min_usd` — 금액 임계. **절대값**으로 본다. 방향은 `dir` 이 진다.
  const minUsd = node.min_usd;
  if (typeof minUsd === "number") {
    checked = true;
    if (Math.abs(value) < minUsd) return false;
  }

  // 비교 조건이 하나도 없으면 "값이 있으면 참" 이다 — 지표가 null 이 아닌 것 자체가 조건이다.
  return checked || true;
}

/** 조건 하나. */
function evaluateCondition(
  node: Record<string, unknown>,
  window: Window,
  context: ExternalContext
): boolean {
  const name = node.indicator;
  if (typeof name !== "string") return false;
  const value = indicatorValue(name, node, window, context);
  // **모르는 것은 참이 아니다.**
  if (value === null) return false;
  return compare(value, node);
}

function isGroup(node: ConditionNode): node is ConditionGroup {
  return typeof node === "object" && node !== null && ("all" in node || "any" in node);
}

function evaluateNode(node: ConditionNode, window: Window, context: ExternalContext): boolean {
  if (isGroup(node)) return evaluateGroup(node, window, context);
  return evaluateCondition(node as Record<string, unknown>, window, context);
}

/** `all` 은 전부 참, `any` 는 하나라도 참. */
export function evaluateGroup(
  group: ConditionGroup,
  window: Window,
  context: ExternalContext = EMPTY_CONTEXT
): boolean {
  if (group.all) return group.all.every((node) => evaluateNode(node, window, context));
  if (group.any) return group.any.some((node) => evaluateNode(node, window, context));
  // 조건이 없으면 진입하지 않는다. **빈 조건은 "항상 참" 이 아니다.**
  return false;
}

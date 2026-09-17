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
  rsi,
  volumeRatio,
  whaleFlow,
  type IndicatorValue,
  type Window,
} from "./indicators";

/** 지표가 쓸 수 있는, 봉 밖에서 오는 값. */
export interface ExternalContext {
  whaleNetNow: number | null;
  whaleNetPrev: number | null;
}

const EMPTY_CONTEXT: ExternalContext = { whaleNetNow: null, whaleNetPrev: null };

function numberParam(node: Record<string, unknown>, key: string, fallback: number): number {
  const value = node[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
      return ma(window, numberParam(node, "period", 20));
    case "ma_cross":
      return maCross(window, numberParam(node, "fast", 20), numberParam(node, "slow", 60));
    case "rsi":
      return rsi(window, numberParam(node, "period", 14));
    case "atr":
      return atr(window, numberParam(node, "period", 14));
    case "volume_ratio":
      return volumeRatio(window, numberParam(node, "period", 20));
    case "pct_from_high":
      return pctFromHigh(window, numberParam(node, "period", 20));
    case "pct_from_low":
      return pctFromLow(window, numberParam(node, "period", 20));
    case "consecutive":
      return consecutive(window);
    case "whale_flow":
      return whaleFlow(context.whaleNetNow, context.whaleNetPrev);
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
  // `ma_cross` 전용 표기. up = 골든(1), down = 데드(-1).
  const dir = node.dir;
  if (typeof dir === "string") {
    checked = true;
    const want = dir === "up" ? 1 : dir === "down" ? -1 : 0;
    if (value !== want) return false;
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

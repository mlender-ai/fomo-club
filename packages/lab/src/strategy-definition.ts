/**
 * LAB-02 PART B — 전략 정의 스키마.
 *
 * **정의는 데이터다.** 나중에 UI 에서 조합하려면 코드가 아니어야 한다(§4-2).
 * 그래서 이 파일에는 지표의 *구현*이 없다 — 이름만 있고 구현은 `LAB-04` 가 갖는다.
 *
 * ## 이 파일이 강제하는 것
 *
 *  PART B-1  지표는 이름으로 참조한다 — 함수도 표현식 문자열도 받지 않는다.
 *  PART B-1  조건은 `all` / `any` 로 조합하고 **중첩은 2단계까지**.
 *  PART B-1  저장 전 스키마 검증은 필수다.
 *  완료확인 4 **`stop_pct` 가 없으면 저장을 거부한다.** 손절 없는 전략을
 *            실수로 만들지 않는다. 이건 경고가 아니라 거부다.
 *  LAB-00 §7 레버리지 기본 1배 — 명시하지 않으면 1이 된다. 수익률 부풀림 방지.
 *
 * ## TRADER-02 D-1 에서 더한 것 (전부 **선택**이다 — 없으면 예전과 똑같이 돈다)
 *
 *  `side`            "long"(기본) · "short" · "both". both 면 `entry` 가 롱, `entry_short` 가 숏
 *  `exit.scale_out`  분할 청산. 다리마다 `size`(비율, 합 1) 와 `at_pct`(목표) 또는 `trail`(추적 손절)
 *  `exit.breakeven_after_first`  첫 분할 청산 뒤 손절을 진입가로 올린다
 *  `pause`           연속 손실 N 번이면 M 분 쉰다
 *  조건의 `tf`        "1h" · "4h" · "1d" … — 그 시간봉으로 묶어서 지표를 본다(engine/conditions.ts)
 *
 * 순수 함수다. 네트워크·시각·난수 의존이 없다.
 */

/** 시장. `Market` enum(Prisma) 의 소문자 표기와 1:1 이다. */
export type DefinitionMarket = "crypto" | "stock" | "polymarket";

/** 유니버스. 지금은 명시 목록뿐이다 — 스크리너는 필요해지면 그때 넣는다. */
export interface UniverseList {
  type: "list";
  symbols: string[];
}

export type Universe = UniverseList;

/**
 * 조건 하나. `indicator` 는 **이름**이고, 나머지 키는 그 지표의 인자다.
 * 인자 값은 원시값만 받는다 — 객체·배열·함수가 오면 코드가 섞여 들어올 길이 생긴다.
 */
export interface Condition {
  indicator: string;
  [param: string]: string | number | boolean | null | undefined;
}

/** 조건 조합. 한 노드는 `all` 이나 `any` 중 하나만 갖는다. */
export interface ConditionGroup {
  all?: ConditionNode[];
  any?: ConditionNode[];
}

export type ConditionNode = Condition | ConditionGroup;

/** 분할 청산 한 다리 — 목표가에서 판다. `at_pct` 는 진입가 대비 유리한 방향 %. */
export interface ScaleOutTarget {
  at_pct: number;
  /** 처음 수량 대비 비율(0~1]. 다리들의 합은 1 이다. */
  size: number;
}

/** 분할 청산 한 다리 — 추적 손절. 진입 뒤 최고가(숏은 최저가)에서 `pct` 만큼 밀리면 판다. */
export interface ScaleOutTrail {
  trail: {
    pct: number;
    /** 이만큼 유리해진 뒤부터 추적한다. 없으면 진입 즉시. */
    activate_pct?: number | null;
  };
  size: number;
}

export type ScaleOutLeg = ScaleOutTarget | ScaleOutTrail;

export interface PauseRule {
  /** 연속 손실 거래(포지션 단위) 몇 번이면 쉬나. */
  after_consecutive_losses: number;
  /** 몇 분 쉬나. 마지막 손실 청산 시각부터. */
  minutes: number;
}

export type DefinitionSide = "long" | "short" | "both";

export interface ExitRules {
  /**
   * 손절 퍼센트. **음수여야 한다.** 없으면 정의 자체가 거부된다.
   * `-8` 은 진입가 대비 −8% 다.
   */
  stop_pct: number;
  /** 목표 퍼센트. `null` 은 "목표 없음"이라는 명시적 선택이다. */
  target_pct: number | null;
  /** 최대 보유일. 없으면 시간 청산을 하지 않는다. */
  max_hold_days?: number | null;
  all?: ConditionNode[];
  any?: ConditionNode[];
  /** 분할 청산. 있으면 `target_pct` 는 null 이어야 한다(목표가 두 곳에 있으면 어느 쪽인지 모른다). */
  scale_out?: ScaleOutLeg[];
  /** 첫 분할 청산 뒤 손절을 진입가로. */
  breakeven_after_first?: boolean;
}

export type Sizing =
  | { type: "risk_pct"; risk_pct: number }
  | { type: "fixed_pct"; fixed_pct: number }
  | { type: "fixed_notional"; notional: number };

export interface StrategyDefinition {
  market: DefinitionMarket;
  universe: Universe;
  /** 기본 "long". 예전 정의는 이 키가 없고 롱으로 돈다. */
  side?: DefinitionSide;
  entry: ConditionGroup;
  /** `side: "both"` 일 때 숏 진입 조건. */
  entry_short?: ConditionGroup;
  exit: ExitRules;
  sizing: Sizing;
  /** LAB-00 §7 — 기본 1배. */
  leverage: number;
  max_positions: number;
  pause?: PauseRule | null;
}

/** 검증 실패. `path` 는 정의 안의 위치다 — 어디가 틀렸는지 말해주지 않으면 못 고친다. */
export interface DefinitionError {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; definition: StrategyDefinition }
  | { ok: false; errors: DefinitionError[] };

const MARKETS: readonly DefinitionMarket[] = ["crypto", "stock", "polymarket"];
const SIZING_TYPES = ["risk_pct", "fixed_pct", "fixed_notional"] as const;

/** PART B-1 — 중첩은 2단계까지. `entry.all[].any[]` 가 최대다. */
export const MAX_CONDITION_DEPTH = 2;

/**
 * 지표 이름 허용 문자. 영소문자·숫자·밑줄만.
 * 괄호·연산자·공백을 막으면 `"close > ma(20)"` 같은 **표현식 문자열이 들어올 수 없다**.
 */
const INDICATOR_NAME = /^[a-z][a-z0-9_]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 원시값만 통과. 함수·객체·배열은 인자가 될 수 없다. */
function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function checkCondition(
  node: Record<string, unknown>,
  path: string,
  errors: DefinitionError[]
): void {
  const indicator = node.indicator;
  if (typeof indicator !== "string" || !INDICATOR_NAME.test(indicator)) {
    errors.push({
      path: `${path}.indicator`,
      message:
        "지표는 이름으로만 참조한다. 영소문자·숫자·밑줄만 허용 — 표현식·함수 문자열은 받지 않는다(PART B-1)",
    });
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "indicator") continue;
    if (!isPrimitive(value)) {
      errors.push({
        path: `${path}.${key}`,
        message: "지표 인자는 원시값만 받는다. 정의에 코드가 들어갈 길을 만들지 않는다(PART B-1)",
      });
    }
  }
}

function checkNodes(
  nodes: unknown,
  path: string,
  depth: number,
  errors: DefinitionError[]
): void {
  if (!Array.isArray(nodes)) {
    errors.push({ path, message: "조건 목록은 배열이어야 한다" });
    return;
  }
  if (nodes.length === 0) {
    errors.push({ path, message: "빈 조건 목록은 조건이 없는 것과 다르다. 키를 빼라" });
    return;
  }
  nodes.forEach((node, index) => {
    const at = `${path}[${index}]`;
    if (!isPlainObject(node)) {
      errors.push({ path: at, message: "조건은 객체여야 한다" });
      return;
    }
    const hasAll = "all" in node;
    const hasAny = "any" in node;
    if (hasAll || hasAny) {
      if (hasAll && hasAny) {
        errors.push({ path: at, message: "한 노드는 all 이나 any 중 하나만 갖는다" });
      }
      if (depth + 1 > MAX_CONDITION_DEPTH) {
        errors.push({
          path: at,
          message: `조건 중첩은 ${MAX_CONDITION_DEPTH}단계까지다(PART B-1)`,
        });
        return;
      }
      if (hasAll) checkNodes(node.all, `${at}.all`, depth + 1, errors);
      if (hasAny) checkNodes(node.any, `${at}.any`, depth + 1, errors);
      return;
    }
    checkCondition(node, at, errors);
  });
}

function checkGroup(
  group: unknown,
  path: string,
  errors: DefinitionError[]
): void {
  if (!isPlainObject(group)) {
    errors.push({ path, message: "객체여야 한다" });
    return;
  }
  const hasAll = "all" in group;
  const hasAny = "any" in group;
  if (!hasAll && !hasAny) {
    errors.push({ path, message: "all 또는 any 가 있어야 한다" });
    return;
  }
  if (hasAll && hasAny) {
    errors.push({ path, message: "all 이나 any 중 하나만 갖는다" });
  }
  if (hasAll) checkNodes(group.all, `${path}.all`, 1, errors);
  if (hasAny) checkNodes(group.any, `${path}.any`, 1, errors);
}

function checkUniverse(value: unknown, errors: DefinitionError[]): void {
  if (!isPlainObject(value)) {
    errors.push({ path: "universe", message: "객체여야 한다" });
    return;
  }
  if (value.type !== "list") {
    errors.push({ path: "universe.type", message: '지금은 "list" 만 지원한다' });
    return;
  }
  const symbols = value.symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    errors.push({ path: "universe.symbols", message: "비어 있지 않은 배열이어야 한다" });
    return;
  }
  symbols.forEach((symbol, index) => {
    if (typeof symbol !== "string" || symbol.trim() === "") {
      errors.push({ path: `universe.symbols[${index}]`, message: "빈 문자열이 아닌 문자열이어야 한다" });
    }
  });
}

function checkExit(value: unknown, errors: DefinitionError[]): void {
  if (!isPlainObject(value)) {
    errors.push({ path: "exit", message: "객체여야 한다" });
    return;
  }

  // 완료확인 4 — 손절 없는 전략을 실수로 만들지 않는다. 경고가 아니라 거부다.
  const stop = value.stop_pct;
  if (stop === undefined || stop === null) {
    errors.push({
      path: "exit.stop_pct",
      message: "손절이 없는 전략은 저장하지 않는다. stop_pct 는 필수다(완료확인 4)",
    });
  } else if (typeof stop !== "number" || !Number.isFinite(stop)) {
    errors.push({ path: "exit.stop_pct", message: "유한한 숫자여야 한다" });
  } else if (stop >= 0) {
    errors.push({
      path: "exit.stop_pct",
      message: "손절은 음수여야 한다. -8 은 진입가 대비 −8% 다",
    });
  }

  if (!("target_pct" in value)) {
    errors.push({
      path: "exit.target_pct",
      message: '목표 없음도 선택이다. 생략하지 말고 null 을 적는다',
    });
  } else {
    const target = value.target_pct;
    if (target !== null && (typeof target !== "number" || !Number.isFinite(target) || target <= 0)) {
      errors.push({ path: "exit.target_pct", message: "null 이거나 양수여야 한다" });
    }
  }

  const hold = value.max_hold_days;
  if (hold !== undefined && hold !== null) {
    if (typeof hold !== "number" || !Number.isFinite(hold) || hold <= 0) {
      errors.push({ path: "exit.max_hold_days", message: "양수여야 한다" });
    }
  }

  if ("all" in value) checkNodes(value.all, "exit.all", 1, errors);
  if ("any" in value) checkNodes(value.any, "exit.any", 1, errors);
  if ("all" in value && "any" in value) {
    errors.push({ path: "exit", message: "all 이나 any 중 하나만 갖는다" });
  }

  if ("scale_out" in value && value.scale_out !== undefined) {
    checkScaleOut(value.scale_out, value.target_pct, errors);
  }
  const breakeven = value.breakeven_after_first;
  if (breakeven !== undefined && typeof breakeven !== "boolean") {
    errors.push({ path: "exit.breakeven_after_first", message: "true 나 false 여야 한다" });
  }
}

const SIZE_SUM_TOLERANCE = 1e-6;

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 분할 청산 검증. 다리 합이 1 이 아니면 **남는 물량이 영원히 안 팔리거나 없는 물량을 판다.**
 * 목표 다리는 가까운 것부터, 추적 다리는 하나만 · 맨 끝에 — 그래야 다리 순서가 곧 체결 순서다.
 */
function checkScaleOut(legs: unknown, target: unknown, errors: DefinitionError[]): void {
  if (!Array.isArray(legs) || legs.length === 0) {
    errors.push({ path: "exit.scale_out", message: "비어 있지 않은 배열이어야 한다" });
    return;
  }
  if (target !== null && target !== undefined) {
    errors.push({
      path: "exit.target_pct",
      message: "scale_out 이 있으면 target_pct 는 null 이다 — 목표가 두 곳에 있으면 어느 쪽인지 모른다",
    });
  }
  let sum = 0;
  let lastAt = 0;
  legs.forEach((leg, index) => {
    const at = `exit.scale_out[${index}]`;
    if (!isPlainObject(leg)) {
      errors.push({ path: at, message: "객체여야 한다" });
      return;
    }
    if (!positiveNumber(leg.size) || leg.size > 1) {
      errors.push({ path: `${at}.size`, message: "0 보다 크고 1 이하인 비율이어야 한다" });
    } else {
      sum += leg.size;
    }
    const hasAt = "at_pct" in leg;
    const hasTrail = "trail" in leg;
    if (hasAt === hasTrail) {
      errors.push({ path: at, message: "at_pct 나 trail 중 하나만 갖는다" });
      return;
    }
    if (hasAt) {
      if (!positiveNumber(leg.at_pct)) {
        errors.push({ path: `${at}.at_pct`, message: "양수여야 한다(진입가 대비 유리한 방향 %)" });
      } else if (leg.at_pct <= lastAt) {
        errors.push({ path: `${at}.at_pct`, message: "목표 다리는 가까운 것부터 커지는 순서다" });
      } else {
        lastAt = leg.at_pct;
      }
      return;
    }
    if (index !== legs.length - 1) {
      errors.push({ path: at, message: "추적 다리는 하나만, 맨 끝에 둔다" });
    }
    const trail = leg.trail;
    if (!isPlainObject(trail) || !positiveNumber(trail.pct)) {
      errors.push({ path: `${at}.trail.pct`, message: "양수여야 한다" });
      return;
    }
    const activate = trail.activate_pct;
    if (activate !== undefined && activate !== null && (typeof activate !== "number" || !Number.isFinite(activate) || activate < 0)) {
      errors.push({ path: `${at}.trail.activate_pct`, message: "0 이상이어야 한다" });
    }
  });
  if (Math.abs(sum - 1) > SIZE_SUM_TOLERANCE) {
    errors.push({ path: "exit.scale_out", message: `다리 size 합이 1 이어야 한다(지금 ${sum})` });
  }
}

function checkPause(value: unknown, errors: DefinitionError[]): void {
  if (value === undefined || value === null) return;
  if (!isPlainObject(value)) {
    errors.push({ path: "pause", message: "객체여야 한다" });
    return;
  }
  const n = value.after_consecutive_losses;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
    errors.push({ path: "pause.after_consecutive_losses", message: "1 이상의 정수여야 한다" });
  }
  if (!positiveNumber(value.minutes)) {
    errors.push({ path: "pause.minutes", message: "양수여야 한다" });
  }
}

const SIDES: readonly DefinitionSide[] = ["long", "short", "both"];

function checkSizing(value: unknown, errors: DefinitionError[]): void {
  if (!isPlainObject(value)) {
    errors.push({ path: "sizing", message: "객체여야 한다" });
    return;
  }
  const type = value.type;
  if (typeof type !== "string" || !(SIZING_TYPES as readonly string[]).includes(type)) {
    errors.push({
      path: "sizing.type",
      message: `${SIZING_TYPES.join(" | ")} 중 하나여야 한다`,
    });
    return;
  }
  const field = type === "fixed_notional" ? "notional" : type;
  const amount = value[field];
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    errors.push({ path: `sizing.${field}`, message: "양수여야 한다" });
  }
  if (type !== "fixed_notional" && typeof amount === "number" && amount > 100) {
    errors.push({ path: `sizing.${field}`, message: "퍼센트는 100 을 넘을 수 없다" });
  }
}

/**
 * 정의를 검증해서 통과한 것만 돌려준다. **저장 전에 반드시 통과시킨다**(PART B-1).
 *
 * 실패를 예외로 던지지 않는다 — 오류를 목록으로 받아야 화면에서 전부 보여줄 수 있다.
 * 한 번에 하나만 알려주면 고치는 데 왕복이 늘어난다.
 */
export function parseStrategyDefinition(input: unknown): ParseResult {
  const errors: DefinitionError[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: "", message: "정의는 객체여야 한다" }] };
  }

  if (typeof input.market !== "string" || !MARKETS.includes(input.market as DefinitionMarket)) {
    errors.push({ path: "market", message: `${MARKETS.join(" | ")} 중 하나여야 한다` });
  }

  checkUniverse(input.universe, errors);
  const side = input.side === undefined ? "long" : input.side;
  if (typeof side !== "string" || !SIDES.includes(side as DefinitionSide)) {
    errors.push({ path: "side", message: `${SIDES.join(" | ")} 중 하나여야 한다` });
  }
  checkGroup(input.entry, "entry", errors);
  if (side === "both") {
    checkGroup(input.entry_short, "entry_short", errors);
  } else if (input.entry_short !== undefined) {
    errors.push({ path: "entry_short", message: 'side 가 "both" 일 때만 쓴다' });
  }
  checkPause(input.pause, errors);
  checkExit(input.exit, errors);
  checkSizing(input.sizing, errors);

  // LAB-00 §7 — 레버리지 기본 1배. 명시하지 않으면 1 이다.
  const leverage = input.leverage === undefined ? 1 : input.leverage;
  if (typeof leverage !== "number" || !Number.isFinite(leverage) || leverage < 1) {
    errors.push({ path: "leverage", message: "1 이상이어야 한다. 기본은 1배다(LAB-00 §7)" });
  }

  const maxPositions = input.max_positions;
  if (
    typeof maxPositions !== "number" ||
    !Number.isInteger(maxPositions) ||
    maxPositions < 1
  ) {
    errors.push({ path: "max_positions", message: "1 이상의 정수여야 한다" });
  }

  if (errors.length > 0) return { ok: false, errors };

  const definition: StrategyDefinition = {
    market: input.market as DefinitionMarket,
    universe: input.universe as Universe,
    entry: input.entry as ConditionGroup,
    exit: input.exit as ExitRules,
    sizing: input.sizing as Sizing,
    leverage: leverage as number,
    max_positions: maxPositions as number,
  };
  // 새 키는 **있을 때만** 싣는다 — 예전 정의를 다시 저장해도 모양이 바뀌지 않는다.
  if (input.side !== undefined) definition.side = side as DefinitionSide;
  if (input.entry_short !== undefined) definition.entry_short = input.entry_short as ConditionGroup;
  if (input.pause !== undefined) definition.pause = input.pause as PauseRule | null;
  return { ok: true, definition };
}

/**
 * 저장 직전에 쓰는 형태. 통과하지 못하면 던진다 —
 * **거부가 조용히 지나가면 손절 없는 전략이 DB 에 들어간다.**
 */
export function assertStrategyDefinition(input: unknown): StrategyDefinition {
  const result = parseStrategyDefinition(input);
  if (result.ok) return result.definition;
  const detail = result.errors.map((e) => `${e.path || "<root>"}: ${e.message}`).join("\n  ");
  throw new Error(`전략 정의가 스키마를 통과하지 못했다:\n  ${detail}`);
}

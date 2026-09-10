import { describe, expect, it } from "vitest";

import {
  MAX_CONDITION_DEPTH,
  assertStrategyDefinition,
  parseStrategyDefinition,
} from "../src/strategy-definition";

/** LAB-02 PART B 의 예시 정의 그대로. 이게 통과하지 않으면 지시서와 어긋난 것이다. */
const VALID = {
  market: "crypto",
  universe: { type: "list", symbols: ["BTC", "ETH", "SOL"] },
  entry: {
    all: [
      { indicator: "ma_cross", fast: 20, slow: 60, dir: "up" },
      { indicator: "volume_ratio", min: 1.2 },
    ],
  },
  exit: {
    stop_pct: -8,
    target_pct: null,
    max_hold_days: 30,
    any: [{ indicator: "ma_cross", fast: 20, slow: 60, dir: "down" }],
  },
  sizing: { type: "risk_pct", risk_pct: 2 },
  leverage: 1,
  max_positions: 3,
} as const;

function errorPaths(input: unknown): string[] {
  const result = parseStrategyDefinition(input);
  return result.ok ? [] : result.errors.map((e) => e.path);
}

describe("지시서 예시", () => {
  it("PART B 의 예시가 그대로 통과한다", () => {
    const result = parseStrategyDefinition(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.definition.market).toBe("crypto");
      expect(result.definition.exit.stop_pct).toBe(-8);
    }
  });
});

describe("완료확인 4 — stop_pct 없으면 저장을 거부한다", () => {
  it("stop_pct 가 없으면 거부한다", () => {
    const { exit, ...rest } = VALID;
    const { stop_pct: _drop, ...exitWithoutStop } = exit;
    expect(errorPaths({ ...rest, exit: exitWithoutStop })).toContain("exit.stop_pct");
  });

  it("stop_pct 가 null 이어도 거부한다 — 명시적 null 은 손절 없음이 아니다", () => {
    expect(errorPaths({ ...VALID, exit: { ...VALID.exit, stop_pct: null } })).toContain(
      "exit.stop_pct"
    );
  });

  it("stop_pct 가 0 이상이면 거부한다 — 손절은 음수다", () => {
    expect(errorPaths({ ...VALID, exit: { ...VALID.exit, stop_pct: 8 } })).toContain(
      "exit.stop_pct"
    );
    expect(errorPaths({ ...VALID, exit: { ...VALID.exit, stop_pct: 0 } })).toContain(
      "exit.stop_pct"
    );
  });

  it("assert 형태는 던진다 — 거부가 조용히 지나가면 DB 에 들어간다", () => {
    const { stop_pct: _drop, ...exitWithoutStop } = VALID.exit;
    expect(() => assertStrategyDefinition({ ...VALID, exit: exitWithoutStop })).toThrow(
      /stop_pct/
    );
  });

  it("exit 이 통째로 없으면 거부한다", () => {
    const { exit: _drop, ...rest } = VALID;
    expect(errorPaths(rest)).toContain("exit");
  });
});

describe("PART B-1 — 정의에 코드가 없다", () => {
  it("표현식 문자열을 지표 이름으로 받지 않는다", () => {
    const bad = { ...VALID, entry: { all: [{ indicator: "close > ma(20)" }] } };
    expect(errorPaths(bad)).toContain("entry.all[0].indicator");
  });

  it("대문자·공백이 든 이름을 거부한다", () => {
    expect(errorPaths({ ...VALID, entry: { all: [{ indicator: "maCross" }] } })).toContain(
      "entry.all[0].indicator"
    );
    expect(errorPaths({ ...VALID, entry: { all: [{ indicator: "ma cross" }] } })).toContain(
      "entry.all[0].indicator"
    );
  });

  it("지표 인자로 객체·배열을 받지 않는다", () => {
    const bad = { ...VALID, entry: { all: [{ indicator: "ma_cross", fast: { $gt: 20 } }] } };
    expect(errorPaths(bad)).toContain("entry.all[0].fast");
  });
});

describe("PART B-1 — 조건 조합", () => {
  it("2단계 중첩은 통과한다", () => {
    const nested = {
      ...VALID,
      entry: {
        all: [
          { indicator: "ma_cross", fast: 20, slow: 60 },
          { any: [{ indicator: "volume_ratio", min: 1.2 }, { indicator: "rsi", max: 70 }] },
        ],
      },
    };
    expect(parseStrategyDefinition(nested).ok).toBe(true);
  });

  it(`${MAX_CONDITION_DEPTH + 1}단계 중첩은 거부한다`, () => {
    const tooDeep = {
      ...VALID,
      entry: {
        all: [{ any: [{ all: [{ indicator: "rsi", max: 70 }] }] }],
      },
    };
    expect(errorPaths(tooDeep)).toContain("entry.all[0].any[0]");
  });

  it("한 노드가 all 과 any 를 같이 가지면 거부한다", () => {
    const bad = {
      ...VALID,
      entry: { all: [{ indicator: "rsi", max: 70 }], any: [{ indicator: "rsi", min: 30 }] },
    };
    expect(errorPaths(bad)).toContain("entry");
  });

  it("빈 조건 목록을 거부한다 — 조건 없음과 다르다", () => {
    expect(errorPaths({ ...VALID, entry: { all: [] } })).toContain("entry.all");
  });

  it("entry 에 all·any 가 둘 다 없으면 거부한다", () => {
    expect(errorPaths({ ...VALID, entry: {} })).toContain("entry");
  });
});

describe("LAB-00 §7 — 레버리지 기본 1배", () => {
  it("leverage 를 생략하면 1 이 된다", () => {
    const { leverage: _drop, ...rest } = VALID;
    const result = parseStrategyDefinition(rest);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition.leverage).toBe(1);
  });

  it("1 미만은 거부한다", () => {
    expect(errorPaths({ ...VALID, leverage: 0 })).toContain("leverage");
  });
});

describe("나머지 필드", () => {
  it("모르는 시장을 거부한다", () => {
    expect(errorPaths({ ...VALID, market: "forex" })).toContain("market");
  });

  it("빈 유니버스를 거부한다", () => {
    expect(errorPaths({ ...VALID, universe: { type: "list", symbols: [] } })).toContain(
      "universe.symbols"
    );
  });

  it("target_pct 를 생략하면 거부한다 — 목표 없음도 명시해야 한다", () => {
    const { target_pct: _drop, ...exitWithoutTarget } = VALID.exit;
    expect(errorPaths({ ...VALID, exit: exitWithoutTarget })).toContain("exit.target_pct");
  });

  it("사이징 퍼센트가 100 을 넘으면 거부한다", () => {
    expect(
      errorPaths({ ...VALID, sizing: { type: "risk_pct", risk_pct: 120 } })
    ).toContain("sizing.risk_pct");
  });

  it("max_positions 가 0 이면 거부한다", () => {
    expect(errorPaths({ ...VALID, max_positions: 0 })).toContain("max_positions");
  });

  it("오류를 한 번에 모아서 낸다 — 왕복을 늘리지 않는다", () => {
    const result = parseStrategyDefinition({ market: "forex", max_positions: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(3);
  });
});

/**
 * ENG-02 — 자체 연구 루프의 규칙: 하나만 바꾼다 · 기준은 잠근다 · 누적으로 센다 · 사람이 승인한다.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CRITERIA,
  MAX_RUNNING,
  criteriaFingerprint,
  cumulativeTries,
  hypothesesFrom,
  judge,
  noteFrom,
  pairedDailyP,
  registrationProblem,
  type ExperimentRow,
  type TradeRow,
} from "../lib/lab/experiments";
import { parseNote } from "../lib/lab/research-note";

const obs = {
  costShare: { pct: 85, trades: 264 },
  stopRebound: { pct: 50, of: 72 },
  entryCostR: [0.08, 0.1, 0.12, 0.14, 0.15],
  policy: { version: "crypto-v3", max_entry_cost_r: 0.16, risk_mode: "atr_capped", risk_budget_usdt: 2.5 },
  cryptoCapital: 500,
};

describe("관측 → 가설 (B) — 값은 데이터 규칙", () => {
  it("첫 실험 셋 — 비용 문턱(중앙값) · 손절 방식 · 자본(보고만)", () => {
    const h = hypothesesFrom(obs);
    expect(h.map((x) => `${x.param}=${x.value}`)).toEqual(["max_entry_cost_r=0.12", "risk_mode=structural", "risk_budget_usdt=10"]);
    expect(h.find((x) => x.param === "risk_budget_usdt")?.reportOnly).toBe(true);
    expect(h[0]?.observation).toContain("85%");
  });
  it("관측이 약하면 가설을 안 만든다", () => {
    expect(hypothesesFrom({ ...obs, costShare: { pct: 10, trades: 50 }, stopRebound: { pct: 20, of: 72 } })).toEqual([]);
  });
});

const row = (n: number, over: Partial<ExperimentRow> = {}): ExperimentRow => ({
  number: n,
  key: `k${n}`,
  param: "max_entry_cost_r",
  baseline: 0.16,
  value: 0.12,
  status: "running",
  startedAt: "2026-09-01T00:00:00Z",
  ...over,
});

describe("등록 (C-2)", () => {
  const h = { key: "risk_mode:structural", param: "risk_mode" as const, baseline: "atr_capped", value: "structural" };
  it("허용 목록 밖 · 같은 값 · 모드 밖은 거절", () => {
    expect(registrationProblem({ ...h, param: "min_rr" as never }, [])).toMatch(/파라미터가 아니다/);
    expect(registrationProblem({ ...h, value: "atr_capped" }, [])).toMatch(/같다/);
    expect(registrationProblem({ ...h, value: "yolo" }, [])).toMatch(/모드/);
  });
  it(`동시 ${MAX_RUNNING}개까지`, () => {
    const three = [row(1, { param: "a" }), row(2, { param: "b" }), row(3, { param: "c" })];
    expect(registrationProblem(h, three)).toMatch(/이미 3개/);
    expect(registrationProblem(h, three.slice(0, 2))).toBeNull();
  });
  it("같은 파라미터를 동시에 두 번 · 같은 시도를 다시 — 거절", () => {
    expect(registrationProblem(h, [row(1, { param: "risk_mode" })])).toMatch(/이미 돌고/);
    expect(registrationProblem(h, [row(1, { key: "risk_mode:structural", status: "failed", param: "risk_mode" })])).toMatch(/이미 했다/);
  });
});

describe("누적 시도 (D-2)", () => {
  it("시작한 것 전부 — 실패도 · 걸러진 건 빼고 · 줄어들지 않는다", () => {
    expect(cumulativeTries([row(1, { status: "failed" }), row(2), row(3, { status: "discarded", startedAt: null })])).toBe(2);
  });
});

const start = "2026-09-01T00:00:00Z";
const trades = (n: number, net: number, from = Date.parse(start)): TradeRow[] =>
  Array.from({ length: n }, (_, i) => ({ exitAt: new Date(from + (i % 20) * 86_400_000 + 3_600_000).toISOString(), netPnlUsdt: net * (i % 3 === 0 ? -1 : 1), costsUsdt: 0.2 }));

function base(over: Partial<Parameters<typeof judge>[0]> = {}) {
  const fp = criteriaFingerprint({ param: "max_entry_cost_r", baseline: 0.16, value: 0.12, startedAt: start, criteria: DEFAULT_CRITERIA });
  return {
    criteria: DEFAULT_CRITERIA,
    fingerprint: fp,
    expectedFingerprint: fp,
    startedAt: start,
    now: new Date("2026-09-21T00:00:00Z"),
    extended: false,
    capital: 500,
    main: trades(40, 1),
    shadow: trades(34, 1),
    tries: 1,
    ...over,
  };
}

describe("판정 (D)", () => {
  it("잠금 — 기준이 바뀌면 무효", () => {
    const moved = criteriaFingerprint({ param: "max_entry_cost_r", baseline: 0.16, value: 0.12, startedAt: start, criteria: { ...DEFAULT_CRITERIA, minTrades: 20 } });
    expect(judge(base({ expectedFingerprint: moved })).state).toBe("invalid");
  });
  it("판정 시점 전에는 waiting — 숫자로 판정하지 않는다", () => {
    expect(judge(base({ now: new Date("2026-09-10T00:00:00Z") })).state).toBe("waiting");
  });
  it("14일인데 거래가 모자라면 한 번 연장 · 연장 뒤에도 모자라면 판단 불가", () => {
    expect(judge(base({ shadow: trades(10, 1), now: new Date("2026-09-16T00:00:00Z") })).state).toBe("extend");
    expect(judge(base({ shadow: trades(10, 1), extended: true, now: new Date("2026-09-30T00:00:00Z") })).state).toBe("inconclusive");
  });
  it("셋 다 넘어야 통과 — 누적 시도가 많으면 같은 성적도 떨어진다", () => {
    const good = base({ main: trades(40, 1), shadow: trades(34, 3).map((t) => ({ ...t, netPnlUsdt: Math.abs(t.netPnlUsdt) })) });
    expect(judge(good).state).toBe("passed");
  });
  it("누적 시도가 많으면 같은 성적도 우연 확률이 커져 떨어진다", () => {
    // 조금만 나은 그림자 — 날마다 들쭉날쭉
    const noisy = base({
      main: trades(40, 1),
      shadow: trades(34, 1).map((t, i) => ({ ...t, netPnlUsdt: t.netPnlUsdt + (i % 2 ? 0.9 : -0.5) })),
    });
    const one = judge({ ...noisy, tries: 1 });
    const many = judge({ ...noisy, tries: 50 });
    expect(one.familyP).not.toBeNull();
    expect(many.familyP as number).toBeGreaterThan(one.familyP as number);
    expect(many.familyP as number).toBeCloseTo(1 - (1 - (one.singleP as number)) ** 50, 10);
  });
  it("그림자가 못하면 실패", () => {
    expect(judge(base({ shadow: trades(34, 1).map((t) => ({ ...t, netPnlUsdt: -Math.abs(t.netPnlUsdt) })) })).state).toBe("failed");
  });
  it("짝지은 일별 차이 — 날이 모자라면 확률을 지어내지 않는다", () => {
    expect(pairedDailyP([], [], start, start)).toBeNull();
  });
});

describe("노트 (E) — UI-08 규칙 통과", () => {
  it("판정이 나면 파서가 받는 노트 · 통과는 승인 대기(열림) · 실패는 없음(닫힘)", () => {
    const e = { number: 7, question: "진입 비용 문턱을 죄면 비용 후 손익이 나아지나", observation: "비용 85%", hypothesis: "죄면 낫다", param: "max_entry_cost_r", baseline: 0.16, value: 0.12, startedAt: start, reportOnly: false };
    const failed = noteFrom(e, judge(base({ shadow: trades(34, 1).map((t) => ({ ...t, netPnlUsdt: -Math.abs(t.netPnlUsdt) })) })));
    expect(failed.status).toBe("closed");
    expect(failed.verdict).toBe("no");
    const md = [
      "---",
      `no: "08"`,
      `title: ${failed.title}`,
      `status: ${failed.status}`,
      `verdict: "${failed.verdict}"`,
      `summary: ${failed.summary}`,
      "opened_at: 2026-09-01",
      "closed_at: 2026-09-21",
      "---",
      "## 결정",
      failed.decision,
    ].join("\n");
    expect(() => parseNote(md, "08.md")).not.toThrow();
    const passed = noteFrom(e, judge(base({ shadow: trades(34, 3).map((t) => ({ ...t, netPnlUsdt: Math.abs(t.netPnlUsdt) })) })));
    expect(passed.status).toBe("open");
    expect(passed.decision).toContain("/approve 7");
  });
});

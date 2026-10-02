/**
 * TRADER-02 — 파이썬(`scripts/trader`)이 랩 엔진을 부르는 다리. **엔진을 새로 짓지 않는다.**
 *
 *   npx tsx scripts/trader/engine.ts <입력.json> <출력.json>
 *
 * 입력 · 출력은 비공개 자리(`~/.fomo/trader/work/`)의 파일이다. 여기서는 네트워크 · DB 를 쓰지 않는다.
 *
 * | cmd | 하는 일 |
 * |---|---|
 * | `features` | 조건마다 봉별 값 — `featureSeries` (실행기와 같은 지표 · 같은 창) |
 * | `replay`   | 정의를 봉 위로 돌린다 — `execute` (백테스트 · 페이퍼와 같은 함수). `state` 를 주면 이어서 돈다 |
 * | `validate` | 정의가 스키마를 통과하나 |
 *
 * ## 증거금 → 명목 (replay)
 *
 * 랩 실행기는 증거금 모델이 없다 — 포지션 명목을 현금에서 통째로 뺀다. 그래서 레버리지 L 인 정의를
 * 그대로 넣으면 명목이 현금에 막혀 1배로 줄어든다. 광혁 계좌와 **명목 · 손익(USDT)** 을 맞추려고
 * 자본을 `증거금 자본 × L` 로, 레버리지를 1 로 바꿔 돌린다. 명목 = 자본 × fixed_pct × L 이 그대로다.
 * 바뀌는 것은 % 분모뿐이고, TRADER-00 원칙 3 대로 %는 비교에 쓰지 않는다.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  DEFAULT_EXECUTOR,
  DEFAULT_FILL,
  MultiSymbolSource,
  execute,
  featureSeries,
  parseStrategyDefinition,
  reviveState,
  type Bar,
  type Condition,
  type StrategyDefinition,
} from "@fomo/lab";

type Row = [number, number, number, number, number, number];

function bars(rows: Row[]): Bar[] {
  return rows.map(([at, open, high, low, close, volume]) => ({ at: new Date(at), open, high, low, close, volume }));
}

function series(rows: [number, number][] | undefined): Map<number, number> {
  return new Map((rows ?? []).map(([at, value]) => [at, value]));
}

function bySymbol<T>(input: Record<string, T> | undefined, map: (value: T) => unknown) {
  return Object.fromEntries(Object.entries(input ?? {}).map(([symbol, value]) => [symbol, map(value)]));
}

interface FeaturesInput {
  cmd: "features";
  bars: Record<string, Row[]>;
  whale?: Record<string, [number, number][]>;
  specs: Condition[];
  maxWindowBars?: number;
}

interface ReplayInput {
  cmd: "replay";
  definition: StrategyDefinition;
  bars: Record<string, Row[]>;
  funding?: Record<string, [number, number][]>;
  whale?: Record<string, [number, number][]>;
  /** 증거금 자본(USDT). */
  capital: number;
  /** 한 쪽 수수료율. 광혁 실계좌 평균에서 온다. */
  takerFeeRate?: number;
  minSlippageBps?: number;
  state?: unknown;
  maxWindowBars?: number;
  /**
   * 이 시각(ms) 전 봉은 **지표 창만 채운다** — 거래하지 않는다. 뒤 30% 검증 · 페이퍼 첫 실행이 쓴다.
   * 앞 기간에서 들어간 포지션이 검증 기간으로 넘어오면 검증이 앞 기간을 보게 된다.
   */
  startMs?: number;
}

function features(input: FeaturesInput) {
  return Object.fromEntries(
    Object.entries(input.bars).map(([symbol, rows]) => [
      symbol,
      featureSeries({
        bars: bars(rows),
        specs: input.specs,
        whaleNet: series(input.whale?.[symbol]),
        ...(input.maxWindowBars ? { maxWindowBars: input.maxWindowBars } : {}),
      }),
    ])
  );
}

function replay(input: ReplayInput) {
  const parsed = parseStrategyDefinition(input.definition);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const leverage = parsed.definition.leverage;
  // 증거금 → 명목(위 머리말). 자본이 이어지는 상태가 있으면 그 상태의 현금이 이긴다.
  const definition: StrategyDefinition = { ...parsed.definition, leverage: 1 };
  const maxWindow = input.maxWindowBars ?? 500;
  const all = bySymbol(input.bars, bars) as Record<string, Bar[]>;
  let traded = all;
  let state = input.state ? reviveState(input.state) ?? undefined : undefined;
  if (input.startMs !== undefined && !state) {
    const startMs = input.startMs;
    const windows: Record<string, Bar[]> = {};
    traded = {};
    let barMs = 0;
    for (const [symbol, list] of Object.entries(all)) {
      const warm = list.filter((b) => b.at.getTime() < startMs).slice(-maxWindow);
      windows[symbol] = warm;
      traded[symbol] = list.filter((b) => b.at.getTime() >= startMs);
      const a = warm[warm.length - 2];
      const b = warm[warm.length - 1];
      if (!barMs && a && b) barMs = b.at.getTime() - a.at.getTime();
    }
    const whaleHistory = Object.fromEntries(
      Object.entries(input.whale ?? {}).map(([symbol, points]) => [
        symbol,
        points.filter(([at]) => at < startMs && at >= startMs - 30 * 24 * 3600 * 1000).map(([at, net]) => ({ at: new Date(at), net })),
      ])
    );
    const cash = input.capital * leverage;
    state = { cash, peakEquity: cash, open: [], pending: [], lastExit: {}, windows, whaleHistory, lastPrice: {}, barMs };
  }
  const result = execute({
    definition,
    source: new MultiSymbolSource({
      bySymbol: traded,
      funding: bySymbol(input.funding, series) as Record<string, Map<number, number>>,
      whaleNet: bySymbol(input.whale, series) as Record<string, Map<number, number>>,
    }),
    config: {
      ...DEFAULT_EXECUTOR,
      initialCapital: input.capital * leverage,
      fill: {
        ...DEFAULT_FILL,
        takerFeeRate: input.takerFeeRate ?? DEFAULT_FILL.takerFeeRate,
        minSlippageBps: input.minSlippageBps ?? DEFAULT_FILL.minSlippageBps,
      },
      // 사람 매매를 따라가는 재생이다. 같은 봉 재진입 잠금은 광혁에게 없던 규칙이라 끈다.
      reentryLock: "off",
    },
    ...(state ? { state } : {}),
    maxWindowBars: maxWindow,
  });
  const last = result.equity[result.equity.length - 1];
  return {
    ok: true,
    leverage,
    trades: result.trades.map((t) => ({
      ...t,
      entryAt: t.entryAt.getTime(),
      exitAt: t.exitAt.getTime(),
    })),
    blocked: result.blocked,
    bars: result.bars,
    equity_last: last ? { at: last.at.getTime(), equity: last.equity } : null,
    open: result.state.open.map((p) => ({ symbol: p.symbol, side: p.side, entryAt: p.entryAt.getTime(), entryPrice: p.entryPrice, qty: p.qty })),
    state: result.state,
  };
}

function main(): void {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) throw new Error("사용: engine.ts <입력.json> <출력.json>");
  const input = JSON.parse(readFileSync(inPath, "utf8")) as { cmd: string };
  let output: unknown;
  if (input.cmd === "features") output = features(input as FeaturesInput);
  else if (input.cmd === "replay") output = replay(input as ReplayInput);
  else if (input.cmd === "validate") output = parseStrategyDefinition((input as unknown as { definition: unknown }).definition);
  else throw new Error(`모르는 cmd: ${input.cmd}`);
  writeFileSync(outPath, JSON.stringify(output));
}

main();

/**
 * LAB-04 PART B — 실행기.
 *
 * > **여기서 만든 실행기를 페이퍼(`LAB-07`)가 그대로 쓴다.** 데이터 소스만 갈아 끼운다.
 *
 * 이 파일은 자기가 과거를 도는지 실시간을 도는지 **모른다.** `DataSource` 만 안다.
 * 따로 만들면 백테스트 결과와 페이퍼 결과를 비교할 수 없다 —
 * 이 프로젝트가 피하려는 바로 그 상황이다.
 *
 * ## 봉 하나를 처리하는 순서
 *
 *   1. 보유 포지션의 **청산**을 먼저 본다 (이 봉 안에서)
 *   2. 펀딩비를 차감한다
 *   3. **직전 봉**의 신호로 이번 봉 시가에 **진입**한다
 *   4. 자산을 기록한다
 *   5. 이번 봉으로 다음 봉에 쓸 신호를 계산한다
 *
 * 3번과 5번이 갈라져 있는 것이 **다음 봉 시가 체결**의 구현이다(PART D).
 * 신호를 계산한 봉에서 바로 체결하면 그 봉의 종가를 알고 사는 것이 된다.
 */
import { isInGap, type Gap } from "../candle-quality";
import type { StrategyDefinition } from "../strategy-definition";
import { evaluateGroup, type ExternalContext } from "./conditions";
import { entryFill, exitDecision, exitFill, fundingCost, grossPnl } from "./fills";
import { isRejected, planSize } from "./sizing";
import type {
  Bar,
  ClosedTrade,
  DataSource,
  EquityPoint,
  ExecutorConfig,
  OpenPosition,
  RunResult,
  Side,
} from "./types";

/** 지표가 값을 내려면 최소 이만큼의 봉이 쌓여야 한다. 그 전에는 진입하지 않는다. */
const MIN_WARMUP_BARS = 2;


export interface WhalePoint {
  at: Date;
  net: number;
}

/** 고래 이력을 이보다 오래 들고 있지 않는다. */
const MAX_WHALE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** 기본 창. 정의가 `window_hours` 를 안 주면 이걸 쓴다. */
const DEFAULT_WHALE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 정의에서 `whale_flow` 의 `window_hours` 를 찾는다.
 *
 * 진입·청산 조건 어디에 있든 같은 창을 쓴다 — 한 전략 안에서 창이 둘이면
 * 들어갈 때와 나올 때가 다른 것을 보게 된다.
 */
function whaleWindowFrom(definition: StrategyDefinition): number {
  const nodes = [
    ...(definition.entry.all ?? []),
    ...(definition.entry.any ?? []),
    ...(definition.exit.all ?? []),
    ...(definition.exit.any ?? []),
  ];
  for (const node of nodes) {
    if (typeof node !== "object" || node === null || !("indicator" in node)) continue;
    const record = node as Record<string, unknown>;
    if (record.indicator !== "whale_flow") continue;
    const hours = record.window_hours;
    if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
      return Math.min(hours * 60 * 60 * 1000, MAX_WHALE_WINDOW_MS);
    }
  }
  return DEFAULT_WHALE_WINDOW_MS;
}

/**
 * `targetMs` 시점 **이하**의 가장 최근 값. 없으면 null.
 *
 * 없는 것을 가장 오래된 값으로 대신하지 않는다 — 그러면 시계열 앞머리에서
 * 창 길이와 무관한 차이가 나온다.
 */
function whaleNetAt(history: readonly WhalePoint[], targetMs: number): number | null {
  let found: number | null = null;
  for (const point of history) {
    if (point.at.getTime() <= targetMs) found = point.net;
    else break;
  }
  return found;
}

export interface PendingSignal {
  symbol: string;
  side: Side;
  reason: string;
  /** 신호가 난 봉. 체결은 **다음** 봉이다. */
  signalAt: Date;
}

export interface LastExit {
  at: Date;
  side: Side;
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * 재진입 잠금. **FCE `e363f64` 이식.**
 *
 * 실측: 같은 확정봉 안에서 청산하고 곧바로 같은 방향으로 다시 들어간 9건은
 * gross 우위가 **−0.914R** 이면서 비용만 1.127R 을 냈다. 새 판단이 아니라 왕복이다.
 *
 * **잠금을 넓힐수록 좋아지는 관계가 아니다** — 1봉 간격 재진입 3건은 gross +1.608R
 * 로 양수였다. 그래서 기본이 `same_bar` 이고 더 긴 잠금은 표본 33건의 잡음 적합으로 본다.
 */
function reentryLocked(
  config: ExecutorConfig,
  now: Date,
  side: Side,
  last: LastExit | undefined,
  barMs: number
): boolean {
  if (config.reentryLock === "off" || !last) return false;
  // 방향이 다르면 왕복이 아니다.
  if (last.side !== side) return false;
  if (config.reentryLock === "same_bar") return now.getTime() === last.at.getTime();
  return now.getTime() - last.at.getTime() < config.reentryLockBars * barMs;
}


/**
 * 실행기 상태. **재시작해도 이어지려면 이것만 있으면 된다**(LAB-07 PART B-1).
 *
 * 백테스트는 이걸 쓰지 않는다(한 번에 끝까지 돈다). 페이퍼는 매 실행마다
 * DB 에서 읽어 넣고 결과를 다시 저장한다 — **그래서 실행기가 하나다.**
 * 따로 만들면 백테스트와 페이퍼 결과를 비교할 수 없다(하지 말 것 1).
 *
 * `Date` 는 JSON 을 오가며 문자열이 되므로 `reviveState` 로 되살린다.
 */
export interface ExecutorState {
  cash: number;
  peakEquity: number;
  open: OpenPosition[];
  pending: PendingSignal[];
  lastExit: Record<string, LastExit>;
  /** 지표 워밍업용 최근 봉. `maxWindowBars` 만큼만 들고 있는다. */
  windows: Record<string, Bar[]>;
  whaleHistory: Record<string, WhalePoint[]>;
  lastPrice: Record<string, number>;
  /** 실측한 봉 간격. 재진입 잠금·시간 청산이 쓴다. */
  barMs: number;
}

/**
 * 창을 이만큼만 들고 있는다.
 *
 * 지표가 보는 최대 기간보다 넉넉해야 한다 — 지금 가장 긴 것이 `ma_cross` 의
 * `slow`(기본 60)다. **이 값보다 긴 기간을 쓰는 정의는 조용히 틀린 값을 받는다.**
 * 그래서 넉넉히 잡고, `execute` 가 넘치면 알려준다(`blocked.window_truncated`).
 */
export const DEFAULT_MAX_WINDOW_BARS = 500;

export interface ExecuteInput {
  definition: StrategyDefinition;
  source: DataSource;
  config: ExecutorConfig;
  /** 데이터 구멍. 이 구간에서는 **진입하지 않는다**(PART D). */
  gaps?: Record<string, readonly Gap[]>;
  /** 이어서 돌 상태. 없으면 처음부터다(백테스트). */
  state?: ExecutorState;
  /**
   * **신규 진입을 막는다**(LAB-07 PART C — 시세 stale).
   *
   * 보유는 유지된다. 청산 조건은 그대로 평가받는다 — 끊긴 동안 손절선을 넘었으면
   * 나와야 한다. 막는 것은 **새로 들어가는 것**뿐이다.
   *
   * `config.maxPositions` 를 0 으로 만드는 꼼수를 쓰지 않는다. 실행기는 동시 보유
   * 상한을 **정의에서** 읽으므로(LAB-04) config 를 고쳐도 아무 일도 일어나지 않는다 —
   * 실제로 그렇게 짰다가 stale 인데 진입이 되는 것을 실행 로그에서 봤다.
   */
  blockNewEntries?: boolean;
  /** 창 상한. 기본 `DEFAULT_MAX_WINDOW_BARS`. */
  maxWindowBars?: number;
}

/**
 * 전략 하나를 끝까지 돌린다.
 *
 * 백테스트는 `source.next()` 가 null 을 줄 때까지, 페이퍼는 호출자가 멈출 때까지.
 */
export function execute(input: ExecuteInput): RunResult & { state: ExecutorState } {
  const { definition, source, config, gaps = {}, state } = input;
  const blockNewEntries = input.blockNewEntries === true;
  const maxWindowBars = input.maxWindowBars ?? DEFAULT_MAX_WINDOW_BARS;

  let cash = state?.cash ?? config.initialCapital;
  let peakEquity = state?.peakEquity ?? config.initialCapital;

  const open = new Map<string, OpenPosition>(
    (state?.open ?? []).map((position) => [position.symbol, position])
  );
  const pending = new Map<string, PendingSignal>(
    (state?.pending ?? []).map((signal) => [signal.symbol, signal])
  );
  const lastExit = new Map<string, LastExit>(Object.entries(state?.lastExit ?? {}));
  const windows = new Map<string, Bar[]>(
    Object.entries(state?.windows ?? {}).map(([symbol, bars]) => [symbol, [...bars]])
  );
  const whaleHistory = new Map<string, WhalePoint[]>(
    Object.entries(state?.whaleHistory ?? {}).map(([symbol, points]) => [symbol, [...points]])
  );
  const whaleWindowMs = whaleWindowFrom(definition);

  const trades: ClosedTrade[] = [];
  const equity: EquityPoint[] = [];
  const blocked: Record<string, number> = {};

  const stopPct = definition.exit.stop_pct / 100;
  const targetPct = definition.exit.target_pct === null ? null : definition.exit.target_pct / 100;
  const universe = new Set(definition.universe.symbols);

  // **사이징·레버리지·동시 보유는 전략 정의가 갖는다**(LAB-02 PART B).
  // config 는 정의가 모르는 것만 준다 — 초기 자본, 체결 비용, 재진입 잠금.
  //
  // 처음엔 config.sizing 을 그대로 썼는데 그러면 정의의 `sizing` 이 조용히 무시된다.
  // 매수후보유(fixed_pct 100)를 돌렸더니 자본의 2%(config 기본 risk_pct)만 태워서
  // 193% 가 3.91% 로 나왔다. **G-1 이 그걸 잡았다.**
  const sizing = sizingFromDefinition(definition, config);
  const leverage = definition.leverage;
  const maxPositions = definition.max_positions;

  let bars = 0;
  let barMs = state?.barMs ?? 0;

  /** 종목별 마지막 종가. **다종목 자산 평가가 이걸 쓴다.** */
  const lastPrice = new Map<string, number>(Object.entries(state?.lastPrice ?? {}));

  for (;;) {
    const item = source.next();
    if (!item) break;
    const { symbol, bar } = item;
    bars += 1;
    lastPrice.set(symbol, bar.close);

    if (!universe.has(symbol)) {
      bump(blocked, "symbol_not_in_universe");
      continue;
    }

    const window = windows.get(symbol) ?? [];

    // 봉 간격을 실측한다 — 재진입 잠금과 시간 청산이 이걸 쓴다.
    // **같은 종목 안에서** 잰다. 종목을 섞어 재면 간격이 0 이 나온다.
    const prevBar = window[window.length - 1];
    if (prevBar && barMs === 0) barMs = bar.at.getTime() - prevBar.at.getTime();

    // ── 1. 청산 ────────────────────────────────────────────────────────────
    const position = open.get(symbol);
    if (position) {
      const decision = exitDecision(position, bar);
      if (decision) {
        const fill = exitFill(position.side, decision, bar, position.qty, config.fill);
        const gross = grossPnl(position.side, position.entryPrice, fill.price, position.qty);
        const pnl = gross - position.entryCost - fill.fee - position.funding;
        cash += position.entryPrice * position.qty + pnl;

        trades.push({
          symbol,
          side: position.side,
          entryAt: position.entryAt,
          entryPrice: position.entryPrice,
          entryReason: position.entryReason,
          exitAt: bar.at,
          exitPrice: fill.price,
          exitReason: decision.reason,
          qty: position.qty,
          fee: fill.fee,
          slippage: fill.slippage,
          funding: position.funding,
          pnl,
          pnlPct: (pnl / (position.entryPrice * position.qty)) * 100,
          barsHeld: position.barsHeld + 1,
        });

        open.delete(symbol);
        lastExit.set(symbol, { at: bar.at, side: position.side });
      } else {
        // ── 2. 펀딩비 ──────────────────────────────────────────────────────
        const rate = source.fundingRate(symbol, bar.at);
        if (rate !== 0) {
          position.funding += fundingCost(position.side, rate, bar.close * position.qty);
        }
        position.barsHeld += 1;
      }
    }

    // ── 3. 진입 — **직전 봉의 신호로 이번 봉 시가에** ────────────────────────
    const signal = pending.get(symbol);
    pending.delete(symbol);
    if (signal && !open.has(symbol)) {
      const reasons: string[] = [];
      if (blockNewEntries) reasons.push("feed_stale");
      if (open.size >= maxPositions) reasons.push("max_positions");
      if (isInGap(signal.signalAt, gaps[symbol] ?? [])) reasons.push("data_gap");
      if (source.inGap(symbol, bar.at)) reasons.push("data_gap");
      if (reentryLocked(config, bar.at, signal.side, lastExit.get(symbol), barMs)) {
        reasons.push("reentry_lock");
      }

      if (reasons.length > 0) {
        for (const reason of reasons) bump(blocked, reason);
      } else {
        // 사이징 기준은 **현금이 아니라 자산 전체**다. 다종목에서 현금만 보면
        // 이미 들어간 포지션만큼 배분이 줄어 뒤에 오는 종목이 계속 작아진다.
        let markedEquity = cash;
        for (const position of open.values()) {
          const mark = lastPrice.get(position.symbol) ?? position.entryPrice;
          markedEquity +=
            position.entryPrice * position.qty +
            grossPnl(position.side, position.entryPrice, mark, position.qty) -
            position.funding;
        }
        const equityNow = markedEquity;
        const provisionalEntry = bar.open;
        const stopPrice =
          signal.side === "LONG"
            ? provisionalEntry * (1 + stopPct)
            : provisionalEntry * (1 - stopPct);

        const plan = planSize(equityNow, provisionalEntry, stopPrice, sizing, leverage);

        if (isRejected(plan)) {
          bump(blocked, plan.reason);
        } else {
          // 현금보다 많이 살 수 없다. **거절하지 말고 줄인다** — 실제 브로커가 그렇게 한다.
          //
          // 처음엔 `cost + fee > cash` 면 거절했는데, 그러면 명목 100% 전략(매수후보유)이
          // 수수료 때문에 **한 번도 진입하지 못한다.** G-1 에서 비용 있는 쪽이 0.00% 로
          // 나와서 "비용을 물리면 더 낮다" 가 참이 되는 걸 보고 찾았다 — 맞는 이유로
          // 참이 아니었다. 줄인 사실은 기록한다. 조용히 줄이면 그것도 거짓말이다.
          let qty = plan.qty;
          let fill = entryFill(signal.side, bar, qty, { ...config.fill, leverage });
          const needed = fill.price * qty + fill.fee;
          if (needed > cash) {
            const scale = cash / needed;
            qty = plan.qty * scale * (1 - 1e-9);
            fill = entryFill(signal.side, bar, qty, { ...config.fill, leverage });
            bump(blocked, "size_reduced:cash");
          }
          const cost = fill.price * qty;
          if (!(qty > 0) || cost + fill.fee > cash) {
            bump(blocked, "insufficient_cash");
          } else {
            cash -= cost + fill.fee;
            // 손절·목표는 **실제 체결가** 기준으로 다시 잡는다. 예정가로 두면
            // 슬리피지만큼 손절 거리가 달라진다.
            open.set(symbol, {
              symbol,
              side: signal.side,
              entryAt: bar.at,
              entryPrice: fill.price,
              entryReason: signal.reason,
              qty,
              stopPrice:
                signal.side === "LONG"
                  ? fill.price * (1 + stopPct)
                  : fill.price * (1 - stopPct),
              targetPrice:
                targetPct === null
                  ? null
                  : signal.side === "LONG"
                    ? fill.price * (1 + targetPct)
                    : fill.price * (1 - targetPct),
              entryCost: fill.fee,
              funding: 0,
              // `max_hold_days` 는 **일**이다. 봉 수로 바꿔야 한다 —
              // 안 바꾸면 1시간봉에서 30일이 30시간이 된다(실측 평균 보유 24.9h).
              // 봉 간격은 데이터에서 재고, 못 쟀으면 시간 청산을 걸지 않는다.
              maxHoldBars: holdBars(definition.exit.max_hold_days ?? null, barMs),
              barsHeld: 0,
              exitSignalPending: false,
            });
          }
        }
      }
    }

    // ── 4. 자산 기록 ───────────────────────────────────────────────────────
    //
    // **보유 중인 전부**를 각자의 마지막 종가로 평가한다. 이번 봉의 종목만 보면
    // 다른 종목 포지션이 자산에서 사라져 자산곡선과 낙폭이 거짓이 된다.
    let holdings = 0;
    let unrealized = 0;
    for (const position of open.values()) {
      const mark = lastPrice.get(position.symbol) ?? position.entryPrice;
      holdings += position.entryPrice * position.qty;
      unrealized += grossPnl(position.side, position.entryPrice, mark, position.qty) - position.funding;
    }
    const equityNow = cash + holdings + unrealized;
    peakEquity = Math.max(peakEquity, equityNow);
    const point: EquityPoint = {
      at: bar.at,
      equity: equityNow,
      cash,
      unrealized,
      drawdown: peakEquity > 0 ? ((equityNow - peakEquity) / peakEquity) * 100 : 0,
    };

    // **자산은 시각당 한 점이다.** 다종목이면 같은 시각에 종목 수만큼 봉이 오는데,
    // 그때마다 점을 찍으면 시계열이 3배가 되고 이웃 간격이 0 이 된다 —
    // 샤프 연율화가 `봉 간격` 으로 연 환산하므로 통째로 null 이 된다(실측: 샤프 전부 —).
    // 같은 시각이면 마지막 값으로 덮는다. 그 시각 모든 종목을 처리한 뒤의 값이다.
    const lastPoint = equity[equity.length - 1];
    if (lastPoint && lastPoint.at.getTime() === bar.at.getTime()) {
      equity[equity.length - 1] = point;
    } else {
      equity.push(point);
    }

    // ── 5. 이번 봉으로 다음 봉의 신호를 만든다 ──────────────────────────────
    window.push(bar);
    // 창을 무한히 들고 있지 않는다. 페이퍼는 상태를 DB 에 쓰므로 크기가 곧 비용이다.
    if (window.length > maxWindowBars) window.splice(0, window.length - maxWindowBars);
    windows.set(symbol, window);

    if (window.length >= MIN_WARMUP_BARS) {
      // 고래 순포지션을 시각과 함께 쌓아두고, 정의가 요구하는 `window_hours` 전 값을 찾는다.
      // **직전 봉 값을 쓰면 안 된다** — 봉 주기가 1시간이면 24시간 창이 1시간 창이 된다.
      const whaleNow = source.whaleNet?.(symbol, bar.at) ?? null;
      const history = whaleHistory.get(symbol) ?? [];
      if (whaleNow !== null) {
        history.push({ at: bar.at, net: whaleNow });
        // 창보다 훨씬 오래된 것은 버린다. 안 버리면 메모리가 계속 는다.
        const keepFrom = bar.at.getTime() - MAX_WHALE_WINDOW_MS;
        while (history.length > 0 && (history[0] as WhalePoint).at.getTime() < keepFrom) {
          history.shift();
        }
        whaleHistory.set(symbol, history);
      }
      const context: ExternalContext = {
        whaleNetNow: whaleNow,
        whaleNetPast: whaleNetAt(history, bar.at.getTime() - whaleWindowMs),
      };

      const current = open.get(symbol);
      if (current) {
        // 보유 중이면 **청산 신호**를 본다.
        const exitSignal =
          (definition.exit.all || definition.exit.any) &&
          evaluateGroup(
            definition.exit.all ? { all: definition.exit.all } : { any: definition.exit.any ?? [] },
            window,
            context
          );
        if (exitSignal) {
          // 다음 봉 시가에 신호 청산한다. 이번 봉 종가로 닫지 않는다.
          //
          // 처음엔 `maxHoldBars` 를 당겨서 닫았는데 그러면 **사유가 TIME 으로 찍힌다.**
          // 실측에서 청산 59건이 전부 TIME 이라 찾았다 — `exitReason` 이 있는 이유가
          // 왜 닫혔는지 아는 것인데 그걸 틀리게 적고 있었다.
          current.exitSignalPending = true;
        }
      } else if (evaluateGroup(definition.entry, window, context)) {
        pending.set(symbol, {
          symbol,
          side: "LONG",
          reason: describeEntry(definition),
          signalAt: bar.at,
        });
      }
    }
  }

  return {
    trades,
    equity,
    blocked,
    bars,
    state: {
      cash,
      peakEquity,
      open: [...open.values()],
      pending: [...pending.values()],
      lastExit: Object.fromEntries(lastExit),
      windows: Object.fromEntries(windows),
      whaleHistory: Object.fromEntries(whaleHistory),
      lastPrice: Object.fromEntries(lastPrice),
      barMs,
    },
  };
}

/**
 * JSON 을 오간 상태를 되살린다. `Date` 가 문자열이 되어 돌아온다.
 *
 * **직접 `JSON.parse` 한 것을 그대로 넘기면 안 된다** — `at.getTime()` 이 터지거나,
 * 더 나쁘게는 문자열 비교가 조용히 틀린 답을 낸다.
 */
export function reviveState(raw: unknown): ExecutorState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.cash !== "number") return null;

  const bar = (b: unknown): Bar => {
    const r = b as Record<string, unknown>;
    return {
      at: new Date(r.at as string),
      open: r.open as number,
      high: r.high as number,
      low: r.low as number,
      close: r.close as number,
      volume: r.volume as number,
    };
  };

  return {
    cash: s.cash,
    peakEquity: typeof s.peakEquity === "number" ? s.peakEquity : s.cash,
    open: ((s.open as unknown[]) ?? []).map((p) => {
      const r = p as Record<string, unknown>;
      return { ...(r as unknown as OpenPosition), entryAt: new Date(r.entryAt as string) };
    }),
    pending: ((s.pending as unknown[]) ?? []).map((p) => {
      const r = p as Record<string, unknown>;
      return { ...(r as unknown as PendingSignal), signalAt: new Date(r.signalAt as string) };
    }),
    lastExit: Object.fromEntries(
      Object.entries((s.lastExit as Record<string, LastExit>) ?? {}).map(([k, v]) => [
        k,
        { at: new Date(v.at as unknown as string), side: v.side },
      ])
    ),
    windows: Object.fromEntries(
      Object.entries((s.windows as Record<string, unknown[]>) ?? {}).map(([k, v]) => [
        k,
        v.map(bar),
      ])
    ),
    whaleHistory: Object.fromEntries(
      Object.entries((s.whaleHistory as Record<string, unknown[]>) ?? {}).map(([k, v]) => [
        k,
        v.map((point) => {
          const r = point as Record<string, unknown>;
          return { at: new Date(r.at as string), net: r.net as number };
        }),
      ])
    ),
    lastPrice: (s.lastPrice as Record<string, number>) ?? {},
    barMs: typeof s.barMs === "number" ? s.barMs : 0,
  };
}



/**
 * 보유일 → 봉 수. 봉 간격을 못 쟀으면 **시간 청산을 걸지 않는다** —
 * 모르는 값을 추측해서 청산하면 그 백테스트가 무엇을 잰 것인지 알 수 없다.
 */
function holdBars(maxHoldDays: number | null, barMs: number): number | null {
  if (maxHoldDays === null) return null;
  if (!(barMs > 0)) return null;
  return Math.max(1, Math.round((maxHoldDays * 24 * 60 * 60 * 1000) / barMs));
}

/**
 * 전략 정의의 `sizing` 을 실행기 설정으로 옮긴다.
 *
 * 명목 상한(`maxNotionalMultiple`)은 정의에 없다 — 그건 전략의 성질이 아니라
 * **계좌를 지키는 장치**라 실행기 설정이 갖는다(FCE `439c4e9`).
 */
function sizingFromDefinition(
  definition: StrategyDefinition,
  config: ExecutorConfig
): ExecutorConfig["sizing"] {
  const maxNotionalMultiple = config.sizing.maxNotionalMultiple;
  const sizing = definition.sizing;
  if (sizing.type === "risk_pct") {
    return { mode: "risk_pct", value: sizing.risk_pct, maxNotionalMultiple };
  }
  if (sizing.type === "fixed_pct") {
    return { mode: "fixed_pct", value: sizing.fixed_pct, maxNotionalMultiple };
  }
  return { mode: "fixed_notional", value: sizing.notional, maxNotionalMultiple };
}

/** 진입 사유 한 줄. **`entry_reason` 은 필수다**(LAB-02 PART A-3). */
function describeEntry(definition: StrategyDefinition): string {
  const nodes = definition.entry.all ?? definition.entry.any ?? [];
  const names = nodes
    .map((node) =>
      typeof node === "object" && node !== null && "indicator" in node
        ? String((node as { indicator: unknown }).indicator)
        : "group"
    )
    .join("+");
  const mode = definition.entry.all ? "all" : "any";
  return `${mode}:${names}`;
}

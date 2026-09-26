/**
 * Overview 조립 (UI-04).
 *
 * > 얼마로 시작해서 지금 얼마인가. 무엇이 잘되고 무엇이 안 되나. 지금 무엇을 확인하고 있나.
 *
 * **순수 함수다** — DB 를 모른다. 읽기는 `snapshot.ts` 가 하고 여기는 모양만 만든다.
 * 그래야 테스트가 규칙(정렬·끊김·기준선)을 직접 찌를 수 있다.
 *
 * ## 모든 숫자가 한 기준이다 — "시작 자본 + 실현 손익"
 *
 * FCE 가 다섯 트랙의 자본을 이 기준으로 낸다(`capital.tracks.*.current_capital_basis:
 * realized`). 곡선도 같은 기준으로 되만든다 — FCE 거래별 순손익을 누적한다. 그래서
 * **곡선 끝이 Hero 와 정확히 맞는다.**
 *
 * FCE 의 `scoreboard.equity_curve` 는 쓰지 않는다. 검증 창(07-18~) 안의 거래만 센 곡선이라
 * 끝이 356.05 이고, 전체 거래 기준 자본은 352.51 이다. 두 모집단을 한 화면에 섞지 않는다.
 *
 * ## 선을 끊는 곳과 칠하는 곳을 가른다 (C-2)
 *
 * | | 무엇 | 왜 |
 * |---|---|---|
 * | 회색 띠 | FCE 관측 유실일(커버리지 < 90%) | 전략이 덜 돌았다 — **안 보고 있었다** |
 * | 선 끊김 | 값이 **정말 없는** 곳 | BTC 봉 구멍 |
 *
 * 포트폴리오 선은 끊지 않는다. 실현 기준이라 호스트가 자는 동안에도 값은 확정돼 있다
 * (그날 닫힌 거래가 없으니 그대로다). 거기서 선을 끊으면 "데이터가 없다" 는 거짓말이 된다.
 */
import { reasonLabel, trackGlyph } from "./labels";
import { buildPortfolio, TRACK_BASE_USD, type Portfolio } from "./portfolio";
import type { FcePositionRow, FceTrackRow } from "./fce-board";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** 최근 7일은 1시간, 그 전은 4시간. 1D 에 24점, 전체에 ~600점. */
const FINE_SPAN = 7 * DAY;
const FINE_STEP = HOUR;
const COARSE_STEP = 4 * HOUR;

/** BTC 봉이 이보다 오래되면 그 시각의 벤치마크는 **없다** — 선을 끊는다. */
const BENCH_STALE = 3 * HOUR;

/** FCE 관측 임계. `observation_integrity.min_coverage_pct` 와 같다. */
export const COVERAGE_MIN_PCT = 90;

export interface TradeLite {
  trackKey: string;
  symbol: string;
  direction: string;
  exitAt: Date | null;
  netPnlUsdt: number | null;
  netReturnPct: number | null;
  /** 전략 상세(UI-05 B)만 쓴다 — 평균 보유 · 최근 거래 · 실측 배수. */
  entryAt?: Date | null;
  leverage?: number | null;
  exitReason?: string | null;
}

export interface Bar {
  at: Date;
  close: number;
}

export interface LostDay {
  trackKey: string;
  day: string;
  coveragePct: number;
  reason: string;
}

export interface ResearchLite {
  no: string;
  title: string;
  status: string;
  verdict: string | null;
  summary: string;
  blocks: string | null;
}

export interface OverviewInput {
  tracks: FceTrackRow[];
  trades: TradeLite[];
  positions: FcePositionRow[];
  btc: Bar[];
  lostDays: LostDay[];
  research: ResearchLite[];
  now: Date;
}

/** 운용중 먼저, 나머지는 이 순서로 아래(E-1). */
const REST_ORDER: Record<string, number> = { held: 0, stopped: 1, excluded: 2 };

// ── 곡선 ──────────────────────────────────────────────────────────────────

/** 트랙별 "t 까지 닫힌 거래의 누적 순손익" 을 빠르게 묻기 위한 계단. */
function stepper(trades: TradeLite[]) {
  const byTrack = new Map<string, { at: number; cum: number }[]>();
  const sorted = [...trades]
    .filter((t) => t.exitAt)
    .sort((a, b) => (a.exitAt as Date).getTime() - (b.exitAt as Date).getTime());
  for (const t of sorted) {
    const list = byTrack.get(t.trackKey) ?? [];
    const prev = list[list.length - 1]?.cum ?? 0;
    list.push({ at: (t.exitAt as Date).getTime(), cum: prev + (t.netPnlUsdt ?? 0) });
    byTrack.set(t.trackKey, list);
  }
  return {
    tracks: new Set(byTrack.keys()),
    /** t 시점까지의 누적. 이분 탐색. */
    at(trackKey: string, t: number): number {
      const list = byTrack.get(trackKey);
      if (!list || list.length === 0) return 0;
      let lo = 0;
      let hi = list.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if ((list[mid] as { at: number }).at <= t) {
          ans = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return ans < 0 ? 0 : (list[ans] as { cum: number }).cum;
    },
    first(): number | null {
      let min: number | null = null;
      for (const list of byTrack.values()) {
        const f = list[0]?.at;
        if (f !== undefined && (min === null || f < min)) min = f;
      }
      return min;
    },
  };
}

/** t 이전의 가장 최근 봉. 너무 오래됐으면 null — **잇지 않는다.** */
function barAt(bars: Bar[], t: number): number | null {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((bars[mid] as Bar).at.getTime() <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (ans < 0) return null;
  const bar = bars[ans] as Bar;
  return t - bar.at.getTime() > BENCH_STALE ? null : bar.close;
}

export interface SeriesPoint {
  at: string;
  /** 포트폴리오 환산 자산. */
  value: number;
  /** 같은 돈을 첫날 BTC 에 넣었다면. 봉이 없으면 null — 선이 끊긴다. */
  benchmark: number | null;
}

export interface Band {
  from: string;
  to: string;
  /** 그 구간 최저 커버리지. */
  minCoveragePct: number;
  days: number;
}

/** 크립토 유실일을 붙어 있는 날끼리 묶는다. 하루짜리 띠 49개보다 읽힌다. */
export function mergeBands(days: LostDay[], from: number, to: number): Band[] {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const out: Band[] = [];
  for (const d of sorted) {
    const start = Date.parse(`${d.day}T00:00:00Z`);
    const end = start + DAY;
    if (end <= from || start >= to) continue;
    const last = out[out.length - 1];
    if (last && Date.parse(last.to) === start) {
      last.to = new Date(end).toISOString();
      last.minCoveragePct = Math.min(last.minCoveragePct, d.coveragePct);
      last.days += 1;
    } else {
      out.push({
        from: new Date(Math.max(start, from)).toISOString(),
        to: new Date(Math.min(end, to)).toISOString(),
        minCoveragePct: d.coveragePct,
        days: 1,
      });
    }
  }
  return out;
}

/** 실현 곡선의 최대 낙폭(%). 음수. */
function curveMdd(trades: TradeLite[], trackKey: string, start: number): number | null {
  const own = trades
    .filter((t) => t.trackKey === trackKey && t.exitAt)
    .sort((a, b) => (a.exitAt as Date).getTime() - (b.exitAt as Date).getTime());
  if (own.length === 0) return null;
  let cap = start;
  let peak = start;
  let worst = 0;
  for (const t of own) {
    cap += t.netPnlUsdt ?? 0;
    peak = Math.max(peak, cap);
    worst = Math.min(worst, ((cap - peak) / peak) * 100);
  }
  return worst;
}

/** 트랙 하나의 원장 성적. FCE 엔진 지표와 **같은 공식**(`paper/service.py` — 승 ÷ 전체, 이익 합 ÷ 손실 합). */
export interface LedgerStat {
  count: number;
  wins: number;
  winRatePct: number | null;
  profitFactor: number | null;
}

/**
 * 트랙별 닫힌 거래 성적 — **거래 수의 유일한 출처** (UI-FIX B-5).
 *
 * 전에는 Overview 가 FCE 채점판의 N(검증 창 07-18~ 안에서 닫힌 것만)을 더했고, 복기는 랩이 받아
 * 쌓은 거래 전부를 셌다. 크립토 창 밖 거래 5건 · 주식 US 체결 3건만큼 두 화면이 달랐다(246 vs 248).
 * 자본·곡선·낙폭은 이미 원장 전부로 잰다 — 거래 수·승률·손익비도 같은 모집단에서 잰다.
 */
export function ledgerStats(trades: TradeLite[]): Map<string, LedgerStat> {
  const acc = new Map<string, { count: number; wins: number; profit: number; loss: number }>();
  for (const t of trades) {
    if (!t.exitAt) continue;
    const a = acc.get(t.trackKey) ?? { count: 0, wins: 0, profit: 0, loss: 0 };
    const pnl = t.netPnlUsdt ?? 0;
    a.count += 1;
    if (pnl > 0) {
      a.wins += 1;
      a.profit += pnl;
    } else if (pnl < 0) a.loss += -pnl;
    acc.set(t.trackKey, a);
  }
  const out = new Map<string, LedgerStat>();
  for (const [key, a] of acc) {
    out.set(key, {
      count: a.count,
      wins: a.wins,
      winRatePct: a.count > 0 ? (a.wins / a.count) * 100 : null,
      profitFactor: a.loss > 0 ? a.profit / a.loss : null,
    });
  }
  return out;
}

/** 첫 청산일 하루 전 자정 — 곡선과 기준선이 같이 쓰는 "시작". */
export function startOf(firstExit: number): number {
  return Math.floor(firstExit / DAY) * DAY - DAY;
}

/** BTC 보유의 수익·낙폭(%) — `from` 부터 `to` 까지 H1 종가로. */
function btcHold(bars: Bar[], from: number, to: number): { ret: number; mdd: number } | null {
  const span = bars.filter((b) => b.at.getTime() >= from && b.at.getTime() <= to);
  if (span.length < 2) return null;
  const first = (span[0] as Bar).close;
  const last = (span[span.length - 1] as Bar).close;
  let peak = first;
  let worst = 0;
  for (const b of span) {
    peak = Math.max(peak, b.close);
    worst = Math.min(worst, ((b.close - peak) / peak) * 100);
  }
  return { ret: (last / first - 1) * 100, mdd: worst };
}

// ── 조립 ──────────────────────────────────────────────────────────────────

export function buildOverview(input: OverviewInput) {
  const { tracks, trades, positions, btc, lostDays, research, now } = input;
  const portfolio: Portfolio = buildPortfolio(tracks);
  const step = stepper(trades);
  const nowMs = now.getTime();

  // 시작: 첫 청산일 하루 전 자정. 거래가 없으면 30일 전.
  const firstExit = step.first();
  const t0 = firstExit === null ? nowMs - 30 * DAY : startOf(firstExit);
  const bars = [...btc].sort((a, b) => a.at.getTime() - b.at.getTime());
  const bench0 = barAt(bars, t0) ?? bars.find((b) => b.at.getTime() >= t0)?.close ?? null;

  const byKey = new Map(tracks.map((t) => [t.key, t]));
  const valueAt = (t: number): number => {
    let sum = 0;
    for (const pt of portfolio.tracks) {
      if (pt.normalized === null) continue;
      const tr = byKey.get(pt.key);
      const start = tr?.startingCapital ?? 0;
      if (!tr || start <= 0) continue;
      // 거래 이력이 있는 트랙은 **그 시각까지 닫힌 거래만큼** 움직인다.
      // 없는 트랙(주식·폴리)은 실현 시점을 아직 안 받는다 — 시작값으로 두고 마지막 점에서만 반영한다.
      sum += step.tracks.has(pt.key)
        ? (TRACK_BASE_USD * (start + step.at(pt.key, t))) / start
        : TRACK_BASE_USD;
    }
    return sum;
  };

  const grid: number[] = [];
  const fineFrom = nowMs - FINE_SPAN;
  for (let t = t0; t < Math.min(fineFrom, nowMs); t += COARSE_STEP) grid.push(t);
  for (let t = Math.max(t0, Math.ceil(fineFrom / FINE_STEP) * FINE_STEP); t < nowMs; t += FINE_STEP) grid.push(t);

  const points: SeriesPoint[] = grid.map((t) => {
    const close = barAt(bars, t);
    return {
      at: new Date(t).toISOString(),
      value: valueAt(t),
      benchmark: bench0 && close !== null ? (portfolio.base * close) / bench0 : null,
    };
  });
  // **마지막 점은 측정값이다** — FCE 가 지금 낸 자본의 환산 합(= Hero).
  const lastClose = barAt(bars, nowMs) ?? bars[bars.length - 1]?.close ?? null;
  points.push({
    at: now.toISOString(),
    value: portfolio.total,
    benchmark: bench0 && lastClose !== null ? (portfolio.base * lastClose) / bench0 : null,
  });

  const bands = mergeBands(
    lostDays.filter((d) => d.trackKey === "crypto" && d.coveragePct < COVERAGE_MIN_PCT),
    t0,
    nowMs
  );

  // ── 통계 4칸 (D) — 거래 수·승률은 원장 하나에서 (B-5) ──────────────────────
  const ledger = ledgerStats(trades);
  const running = tracks.filter((t) => t.status === "running");
  const counted = tracks
    .map((t) => ({ t, stat: ledger.get(t.key) }))
    .filter((x): x is { t: FceTrackRow; stat: LedgerStat } => x.stat !== undefined);
  const totalTrades = counted.reduce((s, x) => s + x.stat.count, 0);
  const totalWins = counted.reduce((s, x) => s + x.stat.wins, 0);
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : null;

  const mdds = tracks
    .map((t) => ({ t, mdd: curveMdd(trades, t.key, t.startingCapital) }))
    .filter((x): x is { t: FceTrackRow; mdd: number } => x.mdd !== null);
  const worst = mdds.sort((a, b) => a.mdd - b.mdd)[0] ?? null;

  // ── 트랙 리스트 (E) ─────────────────────────────────────────────────────
  const sparkDays = 30;
  const rows = [...portfolio.tracks]
    .map((pt) => {
      const tr = byKey.get(pt.key) as FceTrackRow;
      const start = tr.startingCapital;
      const hasTrades = step.tracks.has(pt.key);
      // 스파크라인 — 최근 30일 하루 한 점. 거래가 없으면 시작값에서 지금 값까지 평평한 두 점.
      const spark = hasTrades
        ? Array.from({ length: sparkDays + 1 }, (_, i) => {
            const t = nowMs - (sparkDays - i) * DAY;
            return { value: start + step.at(pt.key, t) };
          })
        : [{ value: start }, { value: tr.currentCapital ?? start }];
      return {
        key: pt.key,
        label: pt.label,
        glyph: trackGlyph(pt.key, pt.label),
        status: pt.status,
        statusReason: pt.statusReason,
        subtitle:
          pt.status === "running"
            ? [
                ledger.get(pt.key) ? `N ${ledger.get(pt.key)?.count}` : null,
                ledger.get(pt.key)?.winRatePct == null
                  ? null
                  : `승률 ${(ledger.get(pt.key)?.winRatePct as number).toFixed(1)}%`,
              ]
                .filter(Boolean)
                .join(" · ") || "지표 없음"
            : reasonLabel(pt.status, pt.statusReason),
        normalized: pt.normalized,
        nativeCurrent: pt.nativeCurrent,
        currency: pt.currency,
        returnPct: pt.returnPct,
        spark,
      };
    })
    .sort((a, b) => {
      const ar = a.status === "running";
      const br = b.status === "running";
      if (ar !== br) return ar ? -1 : 1;
      if (ar) return (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity);
      return (REST_ORDER[a.status] ?? 9) - (REST_ORDER[b.status] ?? 9);
    });

  // ── 전략 경쟁 (H · UI-FIX B-4) — 기준선은 **여기 한 곳**에서 잰다 ────────────
  //
  // 트랙마다 **그 트랙이 시작한 날부터** 같은 기간 BTC 보유의 수익 ÷ 낙폭이 기준선이다. 고래 추종은
  // 08-24 에 시작했는데 07-12 부터 잰 BTC 와 비교하면 기간이 다른 두 수를 견준다. 전략 탭도 이 값을
  // 그대로 읽는다 — 전에는 전략 탭이 따로 "기준선 없음" 을 냈다.
  const ratio = (ret: number | null, mdd: number | null) =>
    ret === null || mdd === null || Math.abs(mdd) < 1e-9 ? null : ret / Math.abs(mdd);
  const firstExitOf = (key: string) =>
    trades.reduce<number | null>((min, t) => {
      if (t.trackKey !== key || !t.exitAt) return min;
      const at = t.exitAt.getTime();
      return min === null || at < min ? at : min;
    }, null);
  const contenders = tracks
    .map((t) => {
      const first = firstExitOf(t.key);
      const mdd = curveMdd(trades, t.key, t.startingCapital);
      const value = ratio(t.returnPct, mdd);
      if (first === null || value === null) return null;
      const from = startOf(first);
      const btc = btcHold(bars, from, nowMs);
      const baseline = btc ? ratio(btc.ret, btc.mdd) : null;
      return {
        key: t.key,
        label: t.label,
        value,
        returnPct: t.returnPct,
        mddPct: mdd,
        from: new Date(from).toISOString(),
        baseline: baseline === null ? null : { label: "BTC 보유", value: baseline, returnPct: btc?.ret ?? null, mddPct: btc?.mdd ?? null },
        beats: baseline === null ? null : value > baseline,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const beaten = contenders.filter((c) => c.beats === true).length;
  const outOfRace = tracks.filter((t) => !contenders.some((c) => c.key === t.key)).map((t) => t.label);

  // ── 최근 활동 (I) — 실제 거래와 진입만. 시각을 모르는 사건은 넣지 않는다 ──────
  const labelOf = new Map(tracks.map((t) => [t.key, t.label]));
  const side = (d: string) => (d === "short" || d === "SHORT" ? "숏" : "롱");
  const events = [
    ...trades
      .filter((t) => t.exitAt)
      .map((t) => ({
        at: (t.exitAt as Date).toISOString(),
        kind: "exit" as const,
        text: `${labelOf.get(t.trackKey) ?? t.trackKey} · ${t.symbol} ${side(t.direction)} 청산`,
        pct: t.netReturnPct,
      })),
    ...positions
      .filter((p) => p.entryAt)
      .map((p) => ({
        at: (p.entryAt as Date).toISOString(),
        kind: "entry" as const,
        text: `크립토 · ${p.symbol} ${side(p.direction)} 진입`,
        pct: null as number | null,
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  // ── 연구 (G · UI-FIX C-1) — 열린 것 먼저 3개 ─────────────────────────────
  const rank = (s: string) => (s === "closed" ? 1 : 0);
  const items = [...research].sort((a, b) => rank(a.status) - rank(b.status) || a.no.localeCompare(b.no)).slice(0, 3);

  return {
    hero: {
      total: portfolio.total,
      base: portfolio.base,
      changeUsd: portfolio.changeUsd,
      changePct: portfolio.changePct,
      trackCount: portfolio.tracks.length,
      counted: portfolio.tracks.filter((t) => t.normalized !== null).length,
      startedAt: new Date(t0).toISOString(),
      days: Math.max(1, Math.floor((nowMs - t0) / DAY)),
    },
    series: { points, bands, benchmarkLabel: "BTC 보유", coverageMinPct: COVERAGE_MIN_PCT },
    stats: {
      running: running.length,
      total: tracks.length,
      notRunning: tracks.filter((t) => t.status !== "running").map((t) => t.label),
      trades: totalTrades,
      winRatePct: winRate,
      worstMdd: worst ? { pct: worst.mdd, label: worst.t.label } : null,
    },
    tracks: rows,
    research: {
      open: research.filter((r) => r.status !== "closed").length,
      closed: research.filter((r) => r.status === "closed").length,
      items,
    },
    competition: {
      rows: contenders,
      beaten,
      measured: contenders.length,
      outOfRace,
    },
    /** 트랙별 원장 성적 — 전략 탭이 같은 값을 읽는다(B-5). */
    ledger: Object.fromEntries(ledger),
    activity: events,
    portfolio,
  };
}

export type OverviewPayload = ReturnType<typeof buildOverview>;

/** `LAB-00 §7` — 표본 30 미만은 순위 없음. */
export const MIN_SAMPLE_RANK = 30;

/**
 * 전략 탭의 행 — 기준선·거래 수를 Overview 와 **같은 값**에서 읽는다 (UI-FIX B-4 · B-5).
 *
 * 전에는 전략 탭이 FCE 트랙 행에서 따로 기준선을 찾았다. 크립토에는 FCE 가 벤치마크 값을 안 주니
 * "기준선 없음 — 비교 불가" 가 떴고, 같은 순간 Overview 는 BTC 기준선 4.15 를 말했다.
 */
export function buildStrategyRows(tracks: FceTrackRow[], overview: OverviewPayload) {
  const race = new Map(overview.competition.rows.map((c) => [c.key, c]));
  return tracks.map((t) => {
    const stat = overview.ledger[t.key];
    const c = race.get(t.key);
    // 원장이 있는 트랙(크립토·고래)은 원장에서, 없는 트랙(주식)은 FCE 값 그대로.
    const trades = stat ? stat.count : t.trades;
    return {
      key: t.key,
      label: t.label,
      returnPct: t.returnPct,
      mddPct: c?.mddPct ?? t.mddPct,
      returnOverMdd: c?.value ?? null,
      trades,
      winRatePct: stat ? stat.winRatePct : t.winRatePct,
      profitFactor: stat ? stat.profitFactor : t.profitFactor,
      leverage: t.leverage,
      status: t.status,
      /** 사람 말(`체결 가격 이상`). 원문은 `statusReason` 에 남는다 — 상세의 ⓘ 가 연다. */
      reason: reasonLabel(t.status, t.statusReason),
      statusReason: t.statusReason,
      evidenceNote: t.evidenceNote,
      sampleNote: t.sampleNote,
      elapsedDays: t.elapsedDays,
      calendarDays: t.calendarDays,
      ranked: (trades ?? 0) >= MIN_SAMPLE_RANK,
      benchmarkLabel: t.benchmarkLabel,
      benchmarkReturnPct: t.benchmarkReturnPct,
      /** Overview 전략 경쟁과 같은 기준선. 잴 수 없으면 null. */
      baseline: c?.baseline ?? null,
      baselineFrom: c?.from ?? null,
      beatsBenchmark: c ? c.beats : null,
    };
  });
}

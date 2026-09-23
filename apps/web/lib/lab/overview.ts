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

/** 트랙 한 글자 — 이미지 없이도 행이 선다. 강조색을 새로 만들지 않는다(UI-01 A-2). */
const GLYPH: Record<string, string> = {
  crypto: "₿",
  whale: "🐋",
  stock_us: "US",
  stock_kr: "KR",
  polymarket: "P",
};

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

// ── 조립 ──────────────────────────────────────────────────────────────────

export function buildOverview(input: OverviewInput) {
  const { tracks, trades, positions, btc, lostDays, research, now } = input;
  const portfolio: Portfolio = buildPortfolio(tracks);
  const step = stepper(trades);
  const nowMs = now.getTime();

  // 시작: 첫 청산일 하루 전 자정. 거래가 없으면 30일 전.
  const firstExit = step.first();
  const t0 = firstExit === null ? nowMs - 30 * DAY : Math.floor(firstExit / DAY) * DAY - DAY;
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

  // ── 통계 4칸 (D) ────────────────────────────────────────────────────────
  const running = tracks.filter((t) => t.status === "running");
  const counted = tracks.filter((t) => (t.trades ?? 0) > 0);
  const totalTrades = counted.reduce((s, t) => s + (t.trades ?? 0), 0);
  const weighted = counted.filter((t) => t.winRatePct !== null);
  const weightN = weighted.reduce((s, t) => s + (t.trades ?? 0), 0);
  const winRate =
    weightN > 0
      ? weighted.reduce((s, t) => s + (t.trades ?? 0) * (t.winRatePct ?? 0), 0) / weightN
      : null;

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
        glyph: GLYPH[pt.key] ?? pt.label.slice(0, 1),
        status: pt.status,
        statusReason: pt.statusReason,
        subtitle:
          pt.status === "running"
            ? [
                tr.trades === null ? null : `N ${tr.trades}`,
                tr.winRatePct === null ? null : `승률 ${tr.winRatePct.toFixed(1)}%`,
              ]
                .filter(Boolean)
                .join(" · ") || "지표 없음"
            : (pt.statusReason ?? "사유 없음"),
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

  // ── 전략 경쟁 (H) — 같은 기간 BTC 보유가 기준선 ────────────────────────
  const btcSeries = bars.filter((b) => b.at.getTime() >= t0 && b.at.getTime() <= nowMs);
  let btcRet: number | null = null;
  let btcMdd: number | null = null;
  if (btcSeries.length > 1) {
    const first = (btcSeries[0] as Bar).close;
    const last = (btcSeries[btcSeries.length - 1] as Bar).close;
    btcRet = (last / first - 1) * 100;
    let peak = first;
    let worstDd = 0;
    for (const b of btcSeries) {
      peak = Math.max(peak, b.close);
      worstDd = Math.min(worstDd, ((b.close - peak) / peak) * 100);
    }
    btcMdd = worstDd;
  }
  const ratio = (ret: number | null, mdd: number | null) =>
    ret === null || mdd === null || Math.abs(mdd) < 1e-9 ? null : ret / Math.abs(mdd);
  const baseline = ratio(btcRet, btcMdd);
  const contenders = tracks
    .map((t) => {
      const mdd = curveMdd(trades, t.key, t.startingCapital);
      return { key: t.key, label: t.label, value: ratio(t.returnPct, mdd), returnPct: t.returnPct, mddPct: mdd };
    })
    .filter((c): c is typeof c & { value: number } => c.value !== null);
  const beaten = baseline === null ? 0 : contenders.filter((c) => c.value > baseline).length;
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

  // ── 연구 (G) — 열린 것 먼저 최대 4개 ─────────────────────────────────────
  const rank = (s: string) => (s === "closed" ? 1 : 0);
  const items = [...research].sort((a, b) => rank(a.status) - rank(b.status) || a.no.localeCompare(b.no)).slice(0, 4);

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
      tradesBy: counted.map((t) => ({ label: t.label, n: t.trades ?? 0 })),
      winRatePct: winRate,
      pfBy: counted
        .filter((t) => t.profitFactor !== null)
        .map((t) => ({ label: t.label, pf: t.profitFactor as number })),
      worstMdd: worst ? { pct: worst.mdd, label: worst.t.label } : null,
    },
    tracks: rows,
    research: {
      open: research.filter((r) => r.status !== "closed").length,
      closed: research.filter((r) => r.status === "closed").length,
      items,
    },
    competition: {
      baseline: baseline === null ? null : { label: "BTC 보유", value: baseline, returnPct: btcRet, mddPct: btcMdd },
      from: new Date(t0).toISOString(),
      rows: contenders.map((c) => ({ ...c, beats: baseline === null ? null : c.value > baseline })),
      beaten,
      outOfRace,
    },
    activity: events,
    portfolio,
  };
}

export type OverviewPayload = ReturnType<typeof buildOverview>;

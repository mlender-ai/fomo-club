/**
 * 전략 탭 조립 (UI-05).
 *
 * `buildStrategyRows`(UI-FIX — 기준선·거래 수를 Overview 와 같은 값에서 읽는다) 위에 UI-05 가 요구한
 * 것을 얹는다. **순수 함수다** — DB 는 `snapshot.ts` 가 읽어 넘긴다.
 *
 * | UI-05 | 여기서 |
 * |---|---|
 * | A-2 순위 | 기준선을 넘고 · 표본 30 이상 · 우연 확률 50% 미만일 때만 번호 |
 * | A-3 표 | 샤프 · 평균 보유 · 실측 배수 |
 * | A-4 우연 확률 | `@fomo/lab` `multipleComparison` — 백테스트 전광판과 같은 식 |
 * | A-5 보관함 | 폐기한 랩 전략. **지우지 않는다** |
 * | B-4 해석 | 기준선과 견준 한 줄 |
 * | B-5 분포 | 거래별 손익률 막대 |
 *
 * ## 랩이 새로 재는 것 — 둘
 *
 * FCE 가 내지 않는 값이라 랩이 **원장에서** 잰다. FCE 가 낸 값을 다시 계산하지 않는다.
 *
 * - **샤프** — 일별 실현 자본 변화로. 연율화 √365. 호스트가 잔 날은 변화 0 으로 들어가 샤프를 낮춘다
 * - **평균 보유** — 진입~청산 시각의 평균
 */
import { MIN_SAMPLE, multipleComparison } from "@fomo/lab";

import type { FceTrackRow } from "./fce-board";
import { type OverviewPayload, type TradeLite, buildStrategyRows } from "./overview";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 백테스트 전광판과 같다(`backtest-board.ts` `CHANCE_LIMIT`). 이 이상이면 번호를 주지 않는다. */
export const CHANCE_LIMIT = 0.5;

/** 상세에 싣는 최근 거래 수(B-7). 나머지는 `전체 보기` 가 연다. */
export const RECENT_TRADES = 10;

export interface ArchiveInput {
  name: string;
  version: number;
  stoppedAt: Date | null;
  /** 마지막 백테스트의 거래 수 · 수익 ÷ 낙폭. 돌린 적이 없으면 null. */
  trades: number | null;
  cagrMdd: number | null;
}

export interface ResearchLink {
  no: string;
  title: string;
  status: string;
  trackKeys: unknown;
}

export interface StrategiesInput {
  tracks: FceTrackRow[];
  overview: OverviewPayload;
  trades: TradeLite[];
  research: ResearchLink[];
  archive: ArchiveInput[];
  /** 고래 추종이 지금 따라가는 지갑 수. */
  wallets: number | null;
  now: Date;
}

// ── 원장에서 재는 것 ────────────────────────────────────────────────────────

/** 일별 실현 자본으로 잰 연율화 샤프. 이틀이 안 되거나 변동이 0 이면 null. */
export function dailySharpe(
  trades: TradeLite[],
  start: number,
  from: number,
  to: number
): { sharpe: number | null; years: number } {
  const exits = trades
    .filter((t) => t.exitAt)
    .map((t) => ({ at: (t.exitAt as Date).getTime(), pnl: t.netPnlUsdt ?? 0 }))
    .sort((a, b) => a.at - b.at);
  const days = Math.max(0, Math.floor((to - from) / DAY));
  const years = days / 365;
  if (days < 2 || start <= 0) return { sharpe: null, years };

  const rets: number[] = [];
  let cap = start;
  let i = 0;
  for (let d = 1; d <= days; d += 1) {
    const end = from + d * DAY;
    const prev = cap;
    while (i < exits.length && (exits[i] as { at: number }).at <= end) {
      cap += (exits[i] as { pnl: number }).pnl;
      i += 1;
    }
    rets.push(prev > 0 ? cap / prev - 1 : 0);
  }
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1));
  return { sharpe: sd > 1e-12 ? (mean / sd) * Math.sqrt(365) : null, years };
}

/** 진입~청산 평균(시간). 두 시각을 다 아는 거래만. */
export function avgHoldHours(trades: TradeLite[]): number | null {
  const spans = trades
    .filter((t) => t.entryAt && t.exitAt)
    .map((t) => ((t.exitAt as Date).getTime() - (t.entryAt as Date).getTime()) / HOUR)
    .filter((h) => h >= 0);
  return spans.length > 0 ? spans.reduce((s, h) => s + h, 0) / spans.length : null;
}

const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100];

/**
 * 거래별 손익률 분포(B-5). 막대 ~12개가 되게 폭을 고른다.
 *
 * **0 을 경계로 둔다** — 막대 하나가 −1%~+1% 를 걸치면 진 거래와 이긴 거래가 한 막대에 섞인다.
 */
export function distribution(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[0] as number;
  const hi = sorted[sorted.length - 1] as number;
  const mid = sorted.length / 2;
  const median =
    sorted.length % 2 === 1
      ? (sorted[Math.floor(mid)] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const width = NICE.find((w) => (hi - lo) / w <= 12) ?? NICE[NICE.length - 1] ?? 100;
  const first = Math.floor(lo / width) * width;
  const count = Math.max(1, Math.ceil((hi - first) / width + 1e-9));
  const bins = Array.from({ length: count }, (_, k) => ({
    from: first + k * width,
    to: first + (k + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const k = Math.min(count - 1, Math.floor((v - first) / width));
    (bins[k] as { count: number }).count += 1;
  }
  const wins = values.filter((v) => v > 0);
  const losses = values.filter((v) => v < 0);
  const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgWin = avg(wins);
  const avgLoss = avg(losses);
  return {
    bins,
    width,
    median,
    worst: lo,
    best: hi,
    count: values.length,
    avgWin,
    avgLoss,
    // B-5 — "승률 32%인데 손익비 0.47이면 이긴 거래도 작다". 분포가 말하는 것을 한 줄로.
    reading:
      avgWin === null || avgLoss === null
        ? null
        : avgWin < Math.abs(avgLoss)
          ? "이긴 거래가 진 거래보다 작다"
          : "이긴 거래가 진 거래보다 크다",
  };
}

/**
 * 기준선과 견준 한 줄(B-4 — **숫자만 두고 해석을 빼지 않는다**).
 *
 * 폰 한 줄(32자) 안. 다섯 경우 — 넘었다 · 덜 벌고 더 빠졌다 · 덜 빠졌지만 수익이 음수 · 덜 빠졌지만 덜 벌었다 ·
 * 더 벌었지만 더 빠졌다.
 */
export function verdictLine(
  s: { returnPct: number | null; mddPct: number | null; beats: boolean | null },
  btc: { returnPct: number | null; mddPct: number | null } | null
): string | null {
  if (!btc || s.beats === null || s.returnPct === null || s.mddPct === null) return null;
  if (btc.returnPct === null || btc.mddPct === null) return null;
  if (s.beats) return "BTC 를 들고만 있는 것보다 나았다";
  const earnedLess = s.returnPct < btc.returnPct;
  const fellMore = Math.abs(s.mddPct) > Math.abs(btc.mddPct);
  if (earnedLess && fellMore) return "BTC 보유보다 덜 벌고 더 빠졌다";
  // UI-05 B-4 예시 그대로 — 낙폭이 작아도 수익이 음수면 진 것이다.
  if (earnedLess && s.returnPct < 0) return "낙폭은 BTC보다 작지만 수익이 음수라 기준 미달";
  if (earnedLess) return "덜 빠졌지만 BTC 보유보다 덜 벌었다";
  return "더 벌었지만 더 빠져 BTC 보유에 못 미친다";
}

// ── 조립 ──────────────────────────────────────────────────────────────────

export function buildStrategies(input: StrategiesInput) {
  const { tracks, overview, trades, research, archive, wallets, now } = input;
  const nowMs = now.getTime();
  const base = buildStrategyRows(tracks, overview);
  const byTrack = new Map<string, TradeLite[]>();
  for (const t of trades) {
    if (!t.exitAt) continue;
    const list = byTrack.get(t.trackKey) ?? [];
    list.push(t);
    byTrack.set(t.trackKey, list);
  }
  const portfolio = new Map(overview.portfolio.tracks.map((p) => [p.key, p]));
  const race = new Map(overview.competition.rows.map((c) => [c.key, c]));

  const measured = base.map((r) => {
    const own = byTrack.get(r.key) ?? [];
    const track = tracks.find((t) => t.key === r.key) as FceTrackRow;
    const c = race.get(r.key);
    const from = c ? Date.parse(c.from) : null;
    const sh = from === null ? { sharpe: null, years: 0 } : dailySharpe(own, track.startingCapital, from, nowMs);
    // **배수는 체결에서 실측한다.** FCE 가 고래 추종 트랙에 배수를 안 준다 — 그래서 `—` 가 떴는데
    // 추종 체결 91건이 전부 3배다(UI-05 하지 말 것: 레버리지를 숨기지 말 것).
    const levs = own.map((t) => t.leverage).filter((v): v is number => typeof v === "number");
    const leverage = r.leverage ?? (levs.length > 0 ? Math.max(...levs) : null);
    const firstEntry = own.reduce<number | null>((min, t) => {
      const at = (t.entryAt ?? t.exitAt)?.getTime() ?? null;
      return at === null ? min : min === null || at < min ? at : min;
    }, null);
    const days = r.calendarDays ?? (firstEntry === null ? null : Math.max(1, Math.ceil((nowMs - firstEntry) / DAY)));
    const pt = portfolio.get(r.key);
    const recent = [...own].sort((a, b) => (b.exitAt as Date).getTime() - (a.exitAt as Date).getTime());
    const verdict: "beat" | "under" | "unmeasured" =
      r.status !== "running" || r.beatsBenchmark === null ? "unmeasured" : r.beatsBenchmark ? "beat" : "under";
    return {
      ...r,
      leverage,
      verdict,
      rank: null as number | null,
      sharpe: sh.sharpe,
      years: sh.years,
      avgHoldHours: avgHoldHours(own),
      days,
      wallets: r.key === "whale" ? wallets : null,
      currency: pt?.currency ?? track.currency,
      nativeStart: pt?.nativeStart ?? track.startingCapital,
      nativeCurrent: pt?.nativeCurrent ?? null,
      normalized: pt?.normalized ?? null,
      interpretation: verdictLine(
        { returnPct: r.returnPct, mddPct: r.mddPct, beats: r.beatsBenchmark },
        r.baseline ? { returnPct: r.baseline.returnPct, mddPct: r.baseline.mddPct } : null
      ),
      distribution: distribution(own.map((t) => t.netReturnPct).filter((v): v is number => typeof v === "number")),
      trades_: recent.map((t) => ({
        symbol: t.symbol,
        direction: t.direction,
        exitAt: t.exitAt as Date,
        netPnlUsdt: t.netPnlUsdt,
        netReturnPct: t.netReturnPct,
        exitReason: t.exitReason ?? null,
      })),
      research: research
        .filter((x) => Array.isArray(x.trackKeys) && (x.trackKeys as unknown[]).includes(r.key))
        .map((x) => ({ no: x.no, title: x.title, status: x.status })),
    };
  });

  // ── 우연 확률 (A-4) — **순위를 매기기 전에** 판정한다 ────────────────────
  const comparison = multipleComparison(
    measured
      .filter((r) => r.verdict !== "unmeasured")
      .map((r) => ({ id: r.key, label: r.label, sharpe: r.sharpe, years: r.years, trades: r.trades ?? 0 }))
  );
  const clearsRanks = comparison.familyP === null || comparison.familyP < CHANCE_LIMIT;

  // ── 순위 (A-2) — 기준선을 넘고 · 표본이 차고 · 우연이 아닐 때만 ──────────────
  const order = [...measured].sort((a, b) => (b.returnOverMdd ?? -Infinity) - (a.returnOverMdd ?? -Infinity));
  let next = 1;
  for (const r of order) {
    if (r.verdict === "beat" && (r.trades ?? 0) >= MIN_SAMPLE && clearsRanks) {
      r.rank = next;
      next += 1;
    }
  }
  const winner = order.find((r) => r.rank === 1) ?? null;

  const rows = measured.map(({ trades_, ...r }) => ({
    ...r,
    recent: trades_.slice(0, RECENT_TRADES),
    ledger: trades_,
  }));

  return {
    rows,
    beatCount: overview.competition.beaten,
    measuredCount: overview.competition.measured,
    rankableCount: rows.filter((r) => r.ranked).length,
    minSample: MIN_SAMPLE,
    winner: winner ? { key: winner.key, label: winner.label } : null,
    chance: {
      tested: comparison.tested,
      familyP: comparison.familyP,
      excluded: comparison.excludedForSample,
      clearsRanks,
    },
    archive: archive.map((a) => ({
      label: `${a.name} v${a.version}`,
      stoppedAt: a.stoppedAt,
      trades: a.trades,
      cagrMdd: a.cagrMdd,
      // 백테스트 거래가 0 이면 전략 탓이 아니라 자료가 없던 것이다(BACKTEST_LOG 09-19).
      // 둘은 연구 04 의 답(`진입 우위 없음` · 우연 확률 99%)이 폐기 근거다.
      reason: a.trades === 0 ? "과거 데이터 없음" : "진입 우위 없음",
    })),
  };
}

export type StrategiesCore = ReturnType<typeof buildStrategies>;

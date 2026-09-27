/**
 * 복기 탭 조립 (UI-09).
 *
 * > **어떤 거래가 벌었고 어떤 거래가 잃었나. 왜.**
 *
 * **순수 함수다.** 거래는 FCE 원장(`FceTrade` — 닫힌 것 전부), "왜" 와 사후 채점은 `FceJournal`
 * (`journal-extra.ts`). 합계는 **Overview 누적 거래와 같은 행들**을 같은 식으로 센다(UI-FIX B-5) —
 * 승 = 순손익 > 0, 패 = < 0, 손익비 = 이익 합 ÷ 손실 합.
 */
import {
  CATEGORY_LABEL,
  exitCategory,
  postExitLine,
  type ExitCategory,
  type PostExit,
  type TradeDetail,
} from "./journal-extra";

const HOUR = 3_600_000;

export interface JournalTrade {
  id: string;
  trackKey: string;
  symbol: string;
  direction: string;
  leverage: number | null;
  marginUsdt: number | null;
  entryAt: Date | null;
  entryPrice: number | null;
  exitAt: Date | null;
  exitPrice: number | null;
  grossPnlUsdt: number | null;
  costsUsdt: number | null;
  netPnlUsdt: number | null;
  netReturnPct: number | null;
  exitReason: string | null;
  holdingBars: number | null;
  timeframe: string | null;
}

export interface JournalOpen {
  id: string;
  trackKey: string;
  symbol: string;
  direction: string;
  leverage: number | null;
  entryAt: Date | null;
  netReturnPct: number | null;
}

export function buildJournal(input: {
  trades: JournalTrade[];
  open: JournalOpen[];
  extra: { details: Record<string, TradeDetail>; postExit: Record<string, PostExit | null> } | null;
  trackLabels: Record<string, string>;
}) {
  const { trades, open, extra, trackLabels } = input;
  const closed = trades.filter((t) => t.exitAt).sort((a, b) => (b.exitAt as Date).getTime() - (a.exitAt as Date).getTime());

  // ── 합계 (A-1) ─────────────────────────────────────────────────────────
  let wins = 0;
  let losses = 0;
  let profit = 0;
  let loss = 0;
  let gross = 0;
  let costs = 0;
  let net = 0;
  for (const t of closed) {
    const p = t.netPnlUsdt ?? 0;
    if (p > 0) {
      wins += 1;
      profit += p;
    } else if (p < 0) {
      losses += 1;
      loss += -p;
    }
    gross += t.grossPnlUsdt ?? 0;
    costs += t.costsUsdt ?? 0;
    net += p;
  }
  const count = closed.length;

  const rows = closed.map((t) => {
    const category = exitCategory(t.exitReason);
    const post = extra?.postExit[t.id] ?? null;
    return {
      ...t,
      trackLabel: trackLabels[t.trackKey] ?? t.trackKey,
      category,
      holdHours: t.entryAt && t.exitAt ? Math.max(0, ((t.exitAt as Date).getTime() - t.entryAt.getTime()) / HOUR) : null,
      post: post ? { verdict: post.verdict, movePct: post.movePct, matured: post.matured } : null,
    };
  });

  // ── 청산 사유별 (A-4) ──────────────────────────────────────────────────
  const byExit = exitSummary(rows);

  // ── 청산 품질 (PART C) — 7일이 지난 것만 ────────────────────────────────
  const ratio = (c: ExitCategory) => {
    const matured = rows.filter((r) => r.category === c && r.post?.matured);
    const favorable = matured.filter((r) => r.post?.verdict === "favorable").length;
    return { pct: matured.length ? (favorable / matured.length) * 100 : null, n: favorable, of: matured.length };
  };

  return {
    total: {
      count,
      wins,
      losses,
      flat: count - wins - losses,
      winRatePct: count ? (wins / count) * 100 : null,
      profitFactor: loss > 0 ? profit / loss : null,
      grossUsdt: gross,
      costsUsdt: costs,
      netUsdt: net,
      costSharePct: Math.abs(gross) > 0 ? (costs / Math.abs(gross)) * 100 : null,
    },
    span: { from: closed[closed.length - 1]?.exitAt ?? null, to: closed[0]?.exitAt ?? null },
    rows,
    open: open.map((p) => ({ ...p, trackLabel: trackLabels[p.trackKey] ?? p.trackKey })),
    byExit,
    quality: { horizonDays: 7, stopRebound: ratio("stop"), takeRunUp: ratio("take") },
    /** 옛 모양 — Overview 와 테스트가 `trades` · `total.count` 를 읽는다. */
    trades: rows.slice(0, 60),
    tracks: [...new Set(rows.map((r) => r.trackKey))],
  };
}

export type JournalCore = ReturnType<typeof buildJournal>;

/**
 * 청산 사유별 — 건수 · 평균 손익률 · 순손익. 많은 것부터.
 * 필터를 걸면 화면이 **걸린 거래로 다시** 센다 — 같은 함수다.
 */
export function exitSummary(rows: { category: ExitCategory; netReturnPct: number | null; netPnlUsdt: number | null }[]) {
  const order: ExitCategory[] = ["stop", "take", "signal", "time", "other"];
  return order
    .map((c) => {
      const xs = rows.filter((r) => r.category === c);
      const rets = xs.map((r) => r.netReturnPct).filter((v): v is number => v !== null);
      return {
        category: c,
        label: CATEGORY_LABEL[c],
        count: xs.length,
        avgReturnPct: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
        netUsdt: xs.reduce((a, r) => a + (r.netPnlUsdt ?? 0), 0),
      };
    })
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** 상세 한 건 — 조립본 행 + "왜" + 사후 채점 + 해석 한 줄. */
export function journalDetail(
  row: JournalCore["rows"][number],
  extra: { details: Record<string, TradeDetail>; postExit: Record<string, PostExit | null> } | null
) {
  const post = extra?.postExit[row.id] ?? null;
  return {
    trade: row,
    detail: extra?.details[row.id] ?? null,
    postExit: post,
    postExitLine: postExitLine(row.category, post),
  };
}

export type JournalDetail = ReturnType<typeof journalDetail>;

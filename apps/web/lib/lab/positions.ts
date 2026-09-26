/**
 * 포지션 탭 조립 (UI-06).
 *
 * **순수 함수다** — DB 는 `snapshot.ts` 가 읽어 넘긴다. 숫자는 전부 FCE 값이다. 여기서 하는 일은
 * 줄 세우기 · 경고 판정 · 레일의 **그림 좌표**(어디에 점을 찍을지)뿐이다 — 가격도 손익도 다시 계산하지 않는다.
 *
 * ## 페이퍼만 (광혁 결정 2026-09-26)
 *
 * FCE 로컬 UI 의 라이브 포지션 화면은 **Bitget 실계좌**다. 이 사이트는 로그인 없이 열린다 — 실계좌는
 * 올리지 않는다. 그래서 FCE 가 라이브 계좌에만 붙이는 다섯 가지(건강도 · 지금 볼 것 · 유효 시간 ·
 * 패턴 시간봉 · 고래 추적군)는 **없다고 말한다.** 지어내지 않고, 라이브 계좌 값을 심볼로 빌려 오지도
 * 않는다(빌려 오면 실계좌에 뭘 들고 있는지가 샌다).
 */
import type { FcePositionRow } from "./fce-board";
import type { ChartTimeframe, Candle } from "./fce-payload";

/** FCE 라이브 계좌에만 있고 페이퍼에는 없는 것. 화면이 이름을 그대로 쓴다. */
export const LIVE_ONLY = ["건강도", "지금 볼 것", "유효 시간", "패턴 시간봉", "고래 추적군"] as const;

export interface ResearchLink {
  no: string;
  title: string;
  status: string;
  blocks: string | null;
  trackKeys: unknown;
}

/**
 * 가격 레일 좌표 (UI-06 A-2 · B-3) — `무효화 ← 현재 → 익절1`.
 *
 * 왼쪽 끝이 무효화, 오른쪽 끝이 익절1 이다. **숏이어도 같다** — 숏은 무효화가 위에 있으니
 * `(가격 − 무효화) ÷ (익절 − 무효화)` 가 그대로 0 → 1 로 간다. 레일 밖(이미 선을 넘은 경우)은
 * 끝에 붙이고 `beyond` 로 알린다 — 점이 화면 밖으로 사라지면 가장 중요한 순간이 안 보인다.
 */
export function railOf(p: {
  entryPrice: number | null;
  markPrice: number | null;
  invalidationPrice: number | null;
  stopPrice?: number | null;
  takeProfitPrice: number | null;
}): {
  mark: number;
  entry: number | null;
  beyond: "invalidation" | "take_profit" | null;
  /** 왼쪽 끝 가격 — 지금 걸린 손절선. 무효화에서 옮겨졌으면 `moved`. */
  left: number;
  moved: boolean;
} | null {
  // **왼쪽 끝은 지금 걸린 손절선이다.** 부분 익절 뒤 FCE 가 손절을 본전으로 올린다 — 그때 원래 무효화를
  // 끝으로 두면 FCE 가 낸 거리(−0.55%)와 레일(−3.7%)이 서로 다른 말을 한다. 실제로 ADA 가 그랬다.
  const inv = p.stopPrice ?? p.invalidationPrice;
  const { takeProfitPrice: tp, markPrice: mark, entryPrice: entry } = p;
  if (inv === null || tp === null || mark === null || Math.abs(tp - inv) < 1e-12) return null;
  const at = (price: number) => (price - inv) / (tp - inv);
  const raw = at(mark);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    mark: clamp(raw),
    entry: entry === null ? null : clamp(at(entry)),
    beyond: raw < 0 ? "invalidation" : raw > 1 ? "take_profit" : null,
    left: inv,
    moved: p.stopPrice != null && p.invalidationPrice != null && Math.abs(p.stopPrice - p.invalidationPrice) > 1e-12,
  };
}

/**
 * 줄 세우기 (A-3) — **위험한 것 먼저.**
 *
 * 건강도 낮은 순이 규칙이다. 페이퍼에는 건강도가 없어서 그다음 기준으로 간다:
 * 청산 위험 → 무효화에 가까운 순 → 손익 낮은 순.
 */
export function riskOrder(a: FcePositionRow, b: FcePositionRow): number {
  if (a.healthScore !== null && b.healthScore !== null && a.healthScore !== b.healthScore) {
    return a.healthScore - b.healthScore;
  }
  if (a.liquidationLevel !== b.liquidationLevel) return a.liquidationLevel ? -1 : 1;
  const ad = a.invalidationDistancePct === null ? Infinity : Math.abs(a.invalidationDistancePct);
  const bd = b.invalidationDistancePct === null ? Infinity : Math.abs(b.invalidationDistancePct);
  if (ad !== bd) return ad - bd;
  return (a.netReturnPct ?? Infinity) - (b.netReturnPct ?? Infinity);
}

export function buildPositions(input: {
  positions: FcePositionRow[];
  trackLabels: Record<string, string>;
  research: ResearchLink[];
  lastAt: Date | null;
}) {
  const { positions, trackLabels, research, lastAt } = input;
  const rows = [...positions].sort(riskOrder).map((p) => ({
    ...p,
    strategy: trackLabels[p.trackKey] ?? p.trackKey,
    rail: railOf(p),
    research: research
      .filter((r) => Array.isArray(r.trackKeys) && (r.trackKeys as unknown[]).includes(p.trackKey))
      .map((r) => ({ no: r.no, title: r.title, status: r.status, blocks: r.blocks })),
  }));
  const measured = rows.filter((p) => p.unrealizedUsdt !== null);
  return {
    positions: rows,
    /** 미실현 합계 — FCE `exit_monitor.mark_net_pnl_usdt` 의 합. 비용 포함. */
    unrealizedUsdt: measured.length > 0 ? measured.reduce((s, p) => s + (p.unrealizedUsdt ?? 0), 0) : null,
    measurable: measured.length,
    total: rows.length,
    liquidationLevel: rows.filter((p) => p.liquidationLevel).length,
    lastAt,
    liveOnly: [...LIVE_ONLY],
    caveat:
      "손익은 증거금 대비다. FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다 — 실제 거래소였으면 그 전에 증거금이 없어진다.",
  };
}

export type PositionsCore = ReturnType<typeof buildPositions>;

/** 차트 조립본 — 심볼 → 시간봉 → 캔들. 목록 조립본과 따로 둔다(목록이 150KB 를 끌고 다니지 않게). */
export function buildCharts(rows: { symbol: string; timeframe: string; candles: unknown; asOf: Date }[]) {
  const bySymbol: Record<string, Partial<Record<ChartTimeframe, Candle[]>>> = {};
  let asOf: Date | null = null;
  for (const r of rows) {
    (bySymbol[r.symbol] ??= {})[r.timeframe as ChartTimeframe] = r.candles as Candle[];
    if (!asOf || r.asOf > asOf) asOf = r.asOf;
  }
  return { bySymbol, asOf };
}

/** `GET /api/lab/positions/{id}` 의 `data` (JSON 을 지나기 전). 화면은 `Jsonify<PositionDetail>` 을 받는다. */
export interface PositionDetail {
  position: PositionsCore["positions"][number];
  chart: Partial<Record<ChartTimeframe, Candle[]>>;
  chartAsOf: Date | null;
  caveat: string;
  liveOnly: string[];
  lastAt: Date | null;
}

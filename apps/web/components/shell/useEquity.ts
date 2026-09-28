"use client";

/**
 * 평가 자산 (OPS-03 D) — `/api/lab/equity` 를 **30초마다** 조용히 다시 부른다.
 *
 * Hero · 수익률은 실현 기준 그대로다(FCE 와 같다). 이 값은 그 아래 한 줄 · 차트의 옅은 선 · 포지션 탭 `오늘` 에만 쓴다.
 * 실패하면 마지막 값을 들고 있는다 — 30초마다 화면이 비었다 찼다 하면 안 된다.
 */
import { useEffect, useState } from "react";

export interface EquityWire {
  at: string;
  realized: number;
  marked: number;
  unrealized: number;
  todayChange: number | null;
  todayFrom: string | null;
  /** 크립토 · 고래(USDT) 오늘 평가 변화 — 포지션 탭. */
  todayChangeUsdt: number | null;
  stalePrices: number;
  points: { at: string; realized: number; marked: number }[];
}

export const EQUITY_REFRESH_MS = 30_000;

export function useEquity(): EquityWire | null {
  const [value, setValue] = useState<EquityWire | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/lab/equity", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<EquityWire>) : Promise.reject(new Error(String(r.status)))))
        .then((v) => alive && setValue(v))
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), EQUITY_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return value;
}

/**
 * 실현 곡선 점마다 **그 시각의 평가**를 붙인다 — 그 시각 이전 2시간 안의 가장 가까운 평가 점. 없으면 null(선을 끊는다).
 * 마지막 점에는 지금 평가를 붙인다.
 */
export function withMarked<T extends { at: string }>(points: T[], equity: EquityWire | null): (T & { marked: number | null })[] {
  if (!equity || equity.points.length === 0) return points.map((p) => ({ ...p, marked: null }));
  const eq = equity.points.map((p) => ({ t: Date.parse(p.at), marked: p.marked }));
  let j = 0;
  const out = points.map((p) => {
    const t = Date.parse(p.at);
    while (j + 1 < eq.length && (eq[j + 1] as { t: number }).t <= t) j += 1;
    const hit = eq[j] as { t: number; marked: number };
    return { ...p, marked: hit.t <= t && t - hit.t <= 2 * 3_600_000 ? hit.marked : null };
  });
  if (out.length > 0) (out[out.length - 1] as { marked: number | null }).marked = equity.marked;
  return out;
}

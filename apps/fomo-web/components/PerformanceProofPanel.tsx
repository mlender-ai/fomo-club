"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchDiscoveryPerformancePrices, fetchTrackRecord, type DiscoveryPerformancePrice, type TrackRecordResponse } from "@/lib/fomoApi";
import {
  daysSince,
  formatReturnPct,
  type DiscoverySeenItem,
} from "@/lib/discoveryPerformance";
import { companyScoreBandStats } from "@/lib/companyScorePerformance";

const NEON = "#D8FF3A";

interface PerformanceRow {
  item: DiscoverySeenItem;
  current?: DiscoveryPerformancePrice;
  returnPct?: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  return typeof left === "number" && typeof right === "number" ? (left + right) / 2 : null;
}

function asPrice(value: number, country?: string): string {
  if (country === "KR") return `${Math.round(value).toLocaleString("ko-KR")}원`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 2 : 3 })}`;
}

function shareText(row: PerformanceRow): string {
  const days = daysSince(row.item.firstSeenAt);
  const performance = typeof row.returnPct === "number" ? ` · ${formatReturnPct(row.returnPct)}` : "";
  return `포모클럽이 ${row.item.stock}을 ${days}일 전 먼저 짚었어요${performance}`;
}

async function shareRow(row: PerformanceRow): Promise<void> {
  const text = shareText(row);
  const shareData = {
    title: "포모클럽 먼저 짚었어요",
    text,
    ...(typeof window !== "undefined" ? { url: window.location.href } : {}),
  };
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share(shareData);
      return;
    } catch {
      // Fall through to clipboard when the share sheet is cancelled or unavailable.
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(`${text}\n${"url" in shareData ? shareData.url : ""}`.trim());
  }
}

export function PerformanceProofPanel({ items }: { items: readonly DiscoverySeenItem[] }) {
  const [prices, setPrices] = useState<Record<string, DiscoveryPerformancePrice>>({});
  const [loading, setLoading] = useState(false);
  const [trackRecord, setTrackRecord] = useState<TrackRecordResponse | null>(null);
  const pricedItems = useMemo(
    () => items.filter((item) => typeof item.firstSeenPrice === "number").slice(0, 40),
    [items]
  );

  useEffect(() => {
    if (pricedItems.length === 0) return;
    let cancelled = false;
    setLoading(true);
    fetchDiscoveryPerformancePrices(pricedItems)
      .then((res) => {
        if (!cancelled) setPrices(res.prices);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.warn("[PerformanceProofPanel] price fetch failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pricedItems]);

  useEffect(() => {
    void fetchTrackRecord().then(setTrackRecord).catch(() => {});
  }, []);

  const rows: PerformanceRow[] = useMemo(
    () =>
      items.slice(0, 40).map((item) => {
        const current = prices[item.stock];
        const start = item.firstSeenPrice;
        const returnPct =
          typeof start === "number" && start > 0 && typeof current?.currentPrice === "number"
            ? ((current.currentPrice - start) / start) * 100
            : undefined;
        return {
          item,
          ...(current ? { current } : {}),
          ...(typeof returnPct === "number" ? { returnPct } : {}),
        };
      }),
    [items, prices]
  );
  const returns = rows
    .map((row) => row.returnPct)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const winRate = returns.length > 0 ? Math.round((returns.filter((value) => value > 0).length / returns.length) * 100) : null;
  const medianReturn = median(returns);
  const localScoreBands = companyScoreBandStats(rows);
  const trackedBands = trackRecord?.windows.find((window) => window.days === 30)?.byScoreBand;
  const scoreBands = localScoreBands.map((band, index) => {
    const key = index === 0 ? "80-100" : index === 1 ? "60-79" : "0-59";
    const tracked = trackedBands?.[key];
    return tracked ? { ...band, count: tracked.n, winRate: tracked.winRate } : band;
  });

  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <a href="/track-record" className="text-xs text-muted underline decoration-hairline underline-offset-4">포모클럽의 성적표</a>
        <span className="text-[10px] font-medium text-muted">{returns.length}/{items.length}</span>
      </div>

      <div className="rounded-2xl border border-hairline bg-surface-raised px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] text-muted">상승 비율</span>
            <p className="mt-1 text-2xl font-bold text-whiteout">{winRate === null ? "확인 중" : `${winRate}%`}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted">중앙값 수익</span>
            <p className="mt-1 text-2xl font-bold text-whiteout">
              {medianReturn === null ? "확인 중" : formatReturnPct(medianReturn)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          처음 본 시점 가격과 현재가가 모두 있는 종목 전체 기준입니다.
        </p>
      </div>

      <div className="mt-3 border-y border-hairline py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-whiteout">점수대별 30일 후 승률</p>
          <span className="text-[10px] text-muted">전체 기록 기준</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {scoreBands.map((band) => (
            <div key={band.label}>
              <p className="text-[10px] text-muted">{band.label}</p>
              <p className="mt-1 font-number text-base font-bold text-whiteout">
                {band.winRate === null ? "축적 중" : `${band.winRate}%`}
              </p>
              <p className="text-[9px] text-muted">표본 {band.count}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {rows.slice(0, 10).map((row) => {
          const up = typeof row.returnPct === "number" && row.returnPct > 0;
          const days = daysSince(row.item.firstSeenAt);
          return (
            <article
              key={`${row.item.stock}-${row.item.firstSeenAt}`}
              className="rounded-xl border border-hairline bg-surface px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-base font-semibold text-whiteout">{row.item.stock}</span>
                    {row.item.sector && <span className="shrink-0 text-[11px] text-muted"># {row.item.sector}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {days}일 전 발견
                    {typeof row.item.firstSeenPrice === "number" && (
                      <span> · 발견가 {row.item.firstSeenPriceText ?? asPrice(row.item.firstSeenPrice, row.item.country)}</span>
                    )}
                  </p>
                  {typeof row.item.companyScore === "number" && (
                    <p className="mt-1 text-[11px] text-muted">
                      발견 당시 {row.item.companyScore}점{row.item.companyScoreLabel ? ` · ${row.item.companyScoreLabel}` : ""}
                    </p>
                  )}
                </div>
                <span
                  className="shrink-0 rounded-full border border-hairline-soft px-2.5 py-1 text-sm font-bold tabular-nums"
                  style={{ color: up ? NEON : "#A3A3A0" }}
                >
                  {typeof row.returnPct === "number" ? formatReturnPct(row.returnPct) : loading ? "확인 중" : "현재가 없음"}
                </span>
              </div>
              {row.item.reason && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{row.item.reason}</p>}
              {row.current && (
                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted">
                  <span>현재 {asPrice(row.current.currentPrice, row.item.country)}</span>
                  <button
                    type="button"
                    onClick={() => void shareRow(row)}
                    className="rounded-full border border-hairline-soft px-3 py-1 text-whiteout transition-colors hover:border-muted"
                  >
                    공유
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

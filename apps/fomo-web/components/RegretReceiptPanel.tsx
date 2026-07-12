"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchDiscoveryPerformancePrices, type DiscoveryPerformancePrice } from "@/lib/fomoApi";
import { daysSince, formatReturnPct, type DiscoverySeenItem } from "@/lib/discoveryPerformance";

/**
 * R1 후회 영수증 — "넘긴 카드"(2026-07-12 User Zero 성장 로드맵 R1).
 *
 * 내가 X로 넘긴 카드에 실제 성과를 붙여 손실회피를 "판단 규율"로 전환한다.
 * 정직 규약: 오른 카드는 "그 후 +N%"(놓친 상승), 내린 카드는 "넘기길 잘함 −N%"(옳은 판단) —
 * 양쪽을 똑같이 보여준다. 소급 조작 없음(넘긴 시점 발견가 vs 현재 실시세).
 * 윤리 가드(AGENTS.md): 공포·카운트다운·매매 재촉 금지. 프레임 = "다음 판단을 위한 복기".
 */

const GAIN = "#D8FF3A"; // 놓친 상승(중립적 하이라이트)
const AVOID = "#8FA0A3"; // 넘기길 잘함(차분한 톤)
const WEEK_MS = 7 * 86_400_000;

interface SkipRow {
  item: DiscoverySeenItem;
  returnPct?: number;
}

function asPrice(value: number, country?: string): string {
  if (country === "KR") return `${Math.round(value).toLocaleString("ko-KR")}원`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 2 : 3 })}`;
}

export function RegretReceiptPanel({ items }: { items: readonly DiscoverySeenItem[] }) {
  const [prices, setPrices] = useState<Record<string, DiscoveryPerformancePrice>>({});
  const [loading, setLoading] = useState(false);

  const skipped = useMemo(
    () =>
      items
        .filter((item) => item.action === "skip" && typeof item.firstSeenPrice === "number")
        .sort((a, b) => (b.actionAt ?? b.firstSeenAt) - (a.actionAt ?? a.firstSeenAt))
        .slice(0, 40),
    [items]
  );

  useEffect(() => {
    if (skipped.length === 0) return;
    let cancelled = false;
    setLoading(true);
    fetchDiscoveryPerformancePrices(skipped)
      .then((res) => {
        if (!cancelled) setPrices(res.prices);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.warn("[RegretReceiptPanel] price fetch failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skipped]);

  const rows: SkipRow[] = useMemo(
    () =>
      skipped.map((item) => {
        const current = prices[item.stock];
        const start = item.firstSeenPrice;
        const returnPct =
          typeof start === "number" && start > 0 && typeof current?.currentPrice === "number"
            ? ((current.currentPrice - start) / start) * 100
            : undefined;
        return { item, ...(typeof returnPct === "number" ? { returnPct } : {}) };
      }),
    [skipped, prices]
  );

  // 주간 요약: 최근 7일 넘긴 카드(성과 확인분).
  const weekly = useMemo(() => {
    const now = Date.now();
    const inWeek = rows.filter(
      (r) => typeof r.returnPct === "number" && now - (r.item.actionAt ?? r.item.firstSeenAt) <= WEEK_MS
    );
    if (inWeek.length === 0) return null;
    const returns = inWeek.map((r) => r.returnPct as number);
    const avg = returns.reduce((sum, v) => sum + v, 0) / returns.length;
    const top = inWeek.reduce((best, r) => ((r.returnPct as number) > (best.returnPct as number) ? r : best), inWeek[0]!);
    return { count: inWeek.length, avg, top };
  }, [rows]);

  if (skipped.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs text-muted">넘긴 카드 복기</p>
        <span className="text-[10px] font-medium text-muted">
          {rows.filter((r) => typeof r.returnPct === "number").length}/{skipped.length}
        </span>
      </div>

      {weekly && (
        <div className="mb-3 rounded-2xl border border-hairline bg-surface-raised px-4 py-4">
          <p className="text-sm leading-6 text-whiteout">
            이번 주 넘긴 <span className="font-bold">{weekly.count}장</span> 평균{" "}
            <span className="font-bold" style={{ color: weekly.avg >= 0 ? GAIN : AVOID }}>
              {formatReturnPct(weekly.avg)}
            </span>
            {typeof weekly.top.returnPct === "number" && weekly.top.returnPct > 0 && (
              <>
                {" · "}가장 아까운 <span className="font-semibold">{weekly.top.item.stock}</span>{" "}
                <span className="font-bold" style={{ color: GAIN }}>
                  {formatReturnPct(weekly.top.returnPct)}
                </span>
              </>
            )}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-muted">
            넘긴 시점 가격과 현재가를 비교한 복기예요. 다음 카드를 조금 더 진지하게 보기 위한 기록입니다.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {rows.slice(0, 12).map((row) => {
          const pct = row.returnPct;
          const up = typeof pct === "number" && pct > 0;
          const days = daysSince(row.item.actionAt ?? row.item.firstSeenAt);
          const badge =
            typeof pct !== "number"
              ? loading
                ? "확인 중"
                : "현재가 없음"
              : up
              ? `그 후 ${formatReturnPct(pct)}`
              : `넘기길 잘함 ${formatReturnPct(pct)}`;
          return (
            <article
              key={`${row.item.stock}-${row.item.actionAt ?? row.item.firstSeenAt}`}
              className="rounded-xl border border-hairline bg-surface px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-base font-semibold text-whiteout">{row.item.stock}</span>
                    {row.item.sector && <span className="shrink-0 text-[11px] text-muted"># {row.item.sector}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {days === 0 ? "오늘 넘김" : `${days}일 전 넘김`}
                    {typeof row.item.firstSeenPrice === "number" && (
                      <span> · 넘긴 가격 {row.item.firstSeenPriceText ?? asPrice(row.item.firstSeenPrice, row.item.country)}</span>
                    )}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full border border-hairline-soft px-2.5 py-1 text-sm font-bold tabular-nums"
                  style={{ color: typeof pct === "number" ? (up ? GAIN : AVOID) : "#A3A3A0" }}
                >
                  {badge}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

"use client";

/**
 * 분포 막대 (UI-05 B-5) — 거래별 손익률.
 *
 * Recharts 로 그린다(UI-01 — 차트를 SVG 로 직접 그리지 않는다). 0 보다 아래 칸은 빨강, 위 칸은
 * 초록 — **손익이라 색이 붙는다**(UI-01 A-2). 중앙값은 세로 점선.
 *
 * 애니메이션은 끈다 — 호버마다 렌더가 일어나 막대가 매번 바닥에서 다시 자랐다(UI-04 의 선과 같은 일).
 */
import { useMemo } from "react";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Bin {
  from: number;
  to: number;
  count: number;
}

export function Histogram({
  bins,
  median,
  height = 180,
  format = (v: number) => `${v}%`,
}: {
  bins: Bin[];
  median?: number | null;
  height?: number;
  format?: (v: number) => string;
}) {
  const rows = useMemo(() => bins.map((b) => ({ ...b, mid: (b.from + b.to) / 2 })), [bins]);
  const width = bins[0] ? bins[0].to - bins[0].from : 1;
  return (
    <div className="ui-hist" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <XAxis
            dataKey="mid"
            type="number"
            domain={[(bins[0]?.from ?? 0), (bins[bins.length - 1]?.to ?? 1)]}
            ticks={bins.map((b) => b.from).concat(bins[bins.length - 1]?.to ?? [])}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fill: "var(--ink-3)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => format(v)}
          />
          <YAxis
            allowDecimals={false}
            width={32}
            tick={{ fill: "var(--ink-3)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--bg-2)" }}
            isAnimationActive={false}
            content={({ payload }) => {
              const b = payload?.[0]?.payload as (Bin & { mid: number }) | undefined;
              if (!b) return null;
              return (
                <div className="ui-tip">
                  <span>
                    {format(b.from)} ~ {format(b.to)}
                  </span>
                  <strong>{b.count}건</strong>
                </div>
              );
            }}
          />
          {median !== null && median !== undefined ? (
            <ReferenceLine x={median} stroke="var(--ink)" strokeDasharray="3 3" ifOverflow="extendDomain" />
          ) : null}
          <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]} barSize={Math.max(4, 200 / Math.max(1, bins.length))}>
            {rows.map((b) => (
              <Cell key={b.from} fill={b.mid < 0 ? "var(--dn)" : "var(--up)"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <span className="sh-sr">{`막대 폭 ${format(width)}`}</span>
    </div>
  );
}

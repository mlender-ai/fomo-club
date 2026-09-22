"use client";

/**
 * 영역 차트 — 기준선 + 벤치마크 점선 + 기간 선택 (UI-01 E-1).
 *
 * ## 직접 그리지 않는다
 *
 * `UI-01` 이 "차트를 SVG 로 직접 그리지 말 것" 이라고 못박았다. Recharts 를 쓴다.
 * 전에 자산곡선을 직접 SVG 로 그렸다가 `height` 하나 때문에 폰에서 깨진 적이 있다.
 *
 * ## 벤치마크는 옵션이 아니다
 *
 * `LAB-00 §7` — **벤치마크를 항상 옆에 둔다.** 없이 그리면 `+30%` 가 좋은 건지
 * 모른다. 그래서 벤치마크가 없으면 차트가 그 사실을 말한다.
 *
 * ## 구멍을 잇지 않는다
 *
 * 값이 `null` 인 구간은 선을 끊는다(`connectNulls` 를 켜지 않는다).
 * 이어 그리면 수집이 멈춰 있던 구간이 완만한 상승으로 보인다.
 */
import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SeriesPoint {
  at: string;
  value: number | null;
  benchmark?: number | null;
}

export interface RangeOption {
  key: string;
  label: string;
}

export function AreaChartCard({
  data,
  ranges,
  activeRange,
  onRange,
  baseline,
  benchmarkLabel,
  height = 260,
  format,
}: {
  data: SeriesPoint[];
  ranges?: RangeOption[];
  activeRange?: string;
  onRange?: (key: string) => void;
  /** 시작 자본 같은 수평 기준선. */
  baseline?: number | null;
  benchmarkLabel?: string | null;
  height?: number;
  format?: (value: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const fmt = format ?? ((v: number) => String(v));
  const hasBenchmark = data.some((d) => d.benchmark !== null && d.benchmark !== undefined);

  return (
    <div className="ui-chart">
      {ranges && ranges.length > 0 ? (
        <div className="ui-ranges" role="tablist">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={r.key === activeRange}
              className={`ui-range${r.key === activeRange ? " is-on" : ""}`}
              onClick={() => onRange?.(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onMouseMove={(s) => setHover((s?.activeLabel as string) ?? null)}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              {/* 그라데이션은 차트 영역 채우기에만. 파랑 14% → 0% (UI-01 A-2). */}
              <linearGradient id="ui-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="at"
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              // 통화 기호까지 들어갈 폭. 64 로 잡았다가 `$` 가 잘렸다.
              width={84}
              tickFormatter={(v: number) => fmt(v)}
              domain={["auto", "auto"]}
            />

            {baseline !== null && baseline !== undefined ? (
              <ReferenceLine y={baseline} stroke="var(--line-2)" strokeWidth={1} />
            ) : null}

            <Tooltip
              cursor={{ stroke: "var(--line-2)" }}
              contentStyle={{
                background: "var(--bg)",
                border: "1px solid var(--line-2)",
                borderRadius: "var(--r-row)",
                boxShadow: "var(--shadow-pop)",
                fontSize: "var(--t-caption)",
              }}
              labelStyle={{ color: "var(--ink-3)" }}
              formatter={(v) => (typeof v === "number" ? fmt(v) : "—")}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--blue)"
              strokeWidth={2}
              fill="url(#ui-area-fill)"
              dot={false}
              isAnimationActive
              animationDuration={600}
            />

            {hasBenchmark ? (
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="var(--ink-3)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="ui-chart-legend">
        <span className="ui-legend-item">
          <span className="ui-legend-swatch is-line" aria-hidden /> 자산
        </span>
        {hasBenchmark ? (
          <span className="ui-legend-item">
            <span className="ui-legend-swatch is-dash" aria-hidden /> {benchmarkLabel ?? "벤치마크"}
          </span>
        ) : (
          // **벤치마크가 없으면 없다고 말한다.** 조용히 빼면 화면이 좋아 보인다.
          <span className="ui-legend-item is-missing">벤치마크 없음 — 이 수익률이 좋은지 알 수 없다</span>
        )}
        {hover ? <span className="ui-legend-item is-hover">{hover}</span> : null}
      </p>
    </div>
  );
}

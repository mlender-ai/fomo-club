"use client";

/**
 * 영역 차트 (UI-01 E-1 · UI-04 C).
 *
 * ## 직접 그리지 않는다
 *
 * Recharts 를 쓴다(UI-01). 전에 자산곡선을 직접 SVG 로 그렸다가 `height` 하나 때문에 폰에서 깨졌다.
 *
 * ## 벤치마크는 옵션이 아니다
 *
 * `LAB-00 §7` — 벤치마크를 항상 옆에 둔다. 없으면 **없다고 말한다.**
 *
 * ## 끊는 것과 칠하는 것 (UI-04 C-2)
 *
 * | | |
 * |---|---|
 * | 값이 `null` | 선을 끊는다 — `connectNulls` 를 켜지 않는다 |
 * | `bands` | 연한 회색 띠 — 관측이 부족했던 구간 |
 *
 * ## 시간축
 *
 * x 는 **밀리초 숫자**다. 문자열 범주로 두면 점 간격이 시간 간격과 무관해져서, 1시간 간격과
 * 4시간 간격이 섞인 곡선이 한쪽으로 쏠린다. 띠(`ReferenceArea`)도 숫자 축이어야 제자리에 선다.
 */
import { useMemo, type ReactNode } from "react";

import { kstStamp } from "./format";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SeriesPoint {
  /** ISO 시각. */
  at: string;
  value: number | null;
  benchmark?: number | null;
}

export interface RangeOption {
  key: string;
  label: string;
}

export interface ChartBand {
  from: string;
  to: string;
}

interface Row {
  t: number;
  value: number | null;
  benchmark: number | null;
}

/** 툴팁 시각 — 한국 시간(`format.ts` 의 `kstStamp`). */
const stamp = (t: number) => kstStamp(t);

export function AreaChartCard({
  data,
  ranges,
  activeRange,
  onRange,
  baseline,
  benchmarkLabel,
  seriesLabel = "자산",
  baselineLabel,
  bands = [],
  bandLabel,
  height = 260,
  format,
  compact = false,
  step = false,
}: {
  data: SeriesPoint[];
  ranges?: RangeOption[];
  activeRange?: string;
  onRange?: (key: string) => void;
  /** 시작 금액 같은 수평 기준선. 가는 점선으로 긋는다. */
  baseline?: number | null;
  benchmarkLabel?: string | null;
  seriesLabel?: string;
  /** 기준선의 범례 문구. 예: "점선 = 시작 금액". */
  baselineLabel?: string;
  bands?: ChartBand[];
  /** 띠의 범례 문구. */
  bandLabel?: ReactNode;
  height?: number;
  format?: (value: number) => string;
  /**
   * Overview 모양(UI-04 C) — 축을 숨기고, 기간 선택과 범례를 아래에 두고, 끝점을 찍는다.
   * 축을 숨겨도 값은 호버 툴팁으로 읽힌다.
   */
  compact?: boolean;
  /** 계단으로 그린다. 실현 기준 곡선은 거래가 닫히는 순간에만 변한다 — 사이를 매끈하게 이으면 없던 값이 생긴다. */
  step?: boolean;
}) {
  const fmt = format ?? ((v: number) => String(v));
  // **같은 데이터면 같은 배열을 준다.** 매 렌더 새 배열을 만들면 Recharts 가 "데이터가 바뀌었다"
  // 고 보고 선 애니메이션을 처음부터 다시 돌린다. 호버할 때마다 렌더가 일어나니, 정규 도메인에서
  // 파란 선이 왼쪽 끝만 그려진 채로 멈춰 보였다.
  const rows: Row[] = useMemo(
    () =>
      data.map((d) => ({
        t: Date.parse(d.at),
        value: d.value,
        benchmark: d.benchmark ?? null,
      })),
    [data]
  );
  const hasBenchmark = rows.some((d) => d.benchmark !== null);
  const last = [...rows].reverse().find((r) => r.value !== null) ?? null;
  const base = baseline ?? rows.find((r) => r.value !== null)?.value ?? null;
  const pctOf = (v: number | null) => (v === null || !base ? null : ((v - base) / base) * 100);
  const pct = (v: number | null) => {
    const p = pctOf(v);
    if (p === null) return "—";
    const sign = p > 0 ? "+" : p < 0 ? "−" : "";
    return `${sign}${Math.abs(p).toFixed(2)}%`;
  };
  const curve = step ? "stepAfter" : "monotone";

  const rangeButtons =
    ranges && ranges.length > 0 ? (
      <div className="ui-ranges" role="tablist" aria-label="기간">
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
    ) : null;

  return (
    <div className={`ui-chart${compact ? " is-compact" : ""}`}>
      {!compact ? rangeButtons : null}

      <div style={{ height }} className="ui-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: compact ? 10 : 8, bottom: 0, left: compact ? 0 : 0 }}
          >
            <defs>
              {/* 그라데이션은 차트 영역 채우기에만. 파랑 14% → 0% (UI-01 A-2). */}
              <linearGradient id="ui-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              hide={compact}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tickFormatter={(t: number) => {
                const d = new Date(t);
                return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
              }}
            />
            <YAxis
              hide={compact}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              // 통화 기호까지 들어갈 폭. 64 로 잡았다가 `$` 가 잘렸다.
              width={84}
              tickFormatter={(v: number) => fmt(v)}
              domain={["auto", "auto"]}
            />

            {bands.map((b) => (
              <ReferenceArea
                key={`${b.from}-${b.to}`}
                x1={Date.parse(b.from)}
                x2={Date.parse(b.to)}
                fill="var(--ink-3)"
                fillOpacity={0.08}
                strokeOpacity={0}
                ifOverflow="hidden"
              />
            ))}

            {baseline !== null && baseline !== undefined ? (
              <ReferenceLine y={baseline} stroke="var(--line-2)" strokeWidth={1} strokeDasharray="2 4" />
            ) : null}

            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              // 호버한 점은 Recharts 가 `payload` 로 넘겨준다. 처음엔 `onMouseMove` 의
              // `activeTooltipIndex` 를 숫자로 가정해 직접 찾았는데, Recharts 3 에선 문자열이라
              // 늘 못 찾았고 툴팁이 한 번도 안 떴다. 넘겨주는 걸 그대로 쓴다.
              content={({ active, payload }) => {
                const hover = (payload?.[0]?.payload as Row | undefined) ?? null;
                return active && hover ? (
                  <div className="ui-tip">
                    <p className="ui-tip-when">{stamp(hover.t)}</p>
                    <p className="ui-tip-row">
                      <span className="ui-tip-key is-line">{seriesLabel}</span>
                      <span className="ui-tip-val">{hover.value === null ? "—" : fmt(hover.value)}</span>
                      <span className="ui-tip-pct">{pct(hover.value)}</span>
                    </p>
                    {hasBenchmark ? (
                      <p className="ui-tip-row">
                        <span className="ui-tip-key is-dash">{benchmarkLabel ?? "벤치마크"}</span>
                        <span className="ui-tip-val">{hover.benchmark === null ? "—" : fmt(hover.benchmark)}</span>
                        <span className="ui-tip-pct">{pct(hover.benchmark)}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null;
              }}
            />

            <Area
              type={curve}
              dataKey="value"
              stroke="var(--blue)"
              strokeWidth={compact ? 2.4 : 2}
              fill="url(#ui-area-fill)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--blue)", stroke: "var(--bg)", strokeWidth: 2 }}
              // **그리기 애니메이션을 쓰지 않는다.** UI-01 F 는 "선이 왼쪽에서 그려짐 600ms" 였다.
              // 그런데 Recharts 는 창이 가려지면 프레임을 멈추고, 다시 그려지거나 크기가 바뀌면
              // 처음부터 다시 그린다. 정규 도메인에서 세 번(가려진 창 · 호버 · 폰 전체 캡처)
              // 파란 선이 빈 채로 찍혔다. 가끔 선이 없는 차트는 장식 없는 차트보다 나쁘다.
              isAnimationActive={false}
            />

            {hasBenchmark ? (
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="var(--ink-3)"
                strokeWidth={1.6}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 3.5, fill: "var(--ink-3)", stroke: "var(--bg)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ) : null}

            {/* 끝점 — 파란 원 + 흰 테두리 (UI-04 C). 지금 값이 어디인지. */}
            {compact && last && last.value !== null ? (
              <ReferenceDot x={last.t} y={last.value} r={5} fill="var(--blue)" stroke="var(--bg)" strokeWidth={2.5} />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {compact ? rangeButtons : null}

      <p className="ui-chart-legend">
        <span className="ui-legend-item">
          <span className="ui-legend-swatch is-line" aria-hidden /> {seriesLabel}
        </span>
        {hasBenchmark ? (
          <span className="ui-legend-item">
            <span className="ui-legend-swatch is-dash" aria-hidden /> {benchmarkLabel ?? "벤치마크"}
          </span>
        ) : (
          // **벤치마크가 없으면 없다고 말한다.** 조용히 빼면 화면이 좋아 보인다.
          <span className="ui-legend-item is-missing">벤치마크 없음 — 이 수익률이 좋은지 알 수 없다</span>
        )}
        {baselineLabel ? (
          <span className="ui-legend-item">
            <span className="ui-legend-swatch is-dot" aria-hidden /> {baselineLabel}
          </span>
        ) : null}
        {bands.length > 0 && bandLabel ? (
          <span className="ui-legend-item">
            <span className="ui-legend-swatch is-band" aria-hidden /> {bandLabel}
          </span>
        ) : null}
      </p>
    </div>
  );
}

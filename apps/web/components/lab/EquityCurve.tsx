/**
 * LAB-05 PART C — 자산곡선.
 *
 * | 항목 | 스펙 |
 * |---|---|
 * | 선 | 선택 전략(강조색) + 벤치마크(회색 점선) |
 * | 채우기 | **없음** |
 * | 데이터 구멍 | **선을 끊는다. 잇지 않는다** |
 * | 높이 | 240px |
 *
 * **여러 전략을 겹치지 않는다**(하지 말 것 2). 하나씩 본다 — 비교는 표가 한다.
 *
 * 인라인 SVG 다. 차트 라이브러리를 넣지 않는다 — 선 두 개에 라이브러리는 과하고,
 * 라이브러리는 대개 채우기·애니메이션·그림자를 기본으로 켠다(PART G-1 금지).
 */
import type { Curve, CurvePoint } from "../../lib/lab/backtest-board";

const WIDTH = 1180;
const HEIGHT = 240;
const PAD = { top: 12, right: 56, bottom: 22, left: 8 };

interface Scale {
  x(at: Date): number;
  y(pct: number): number;
}

function buildScale(from: number, to: number, min: number, max: number): Scale {
  const spanX = Math.max(1, to - from);
  // 위아래로 조금 띄운다. 선이 테두리에 붙으면 읽기 어렵다.
  const pad = Math.max(1, (max - min) * 0.08);
  const lo = min - pad;
  const hi = max + pad;
  const spanY = Math.max(1e-9, hi - lo);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  return {
    x: (at) => PAD.left + ((at.getTime() - from) / spanX) * plotW,
    y: (pct) => PAD.top + (1 - (pct - lo) / spanY) * plotH,
  };
}

/** 조각 하나를 path 로. **조각마다 별도 path 라 끊긴 곳이 이어지지 않는다.** */
function toPath(points: readonly CurvePoint[], scale: Scale): string {
  return points
    .map((point, i) => `${i === 0 ? "M" : "L"}${scale.x(point.at).toFixed(1)},${scale.y(point.pct).toFixed(1)}`)
    .join(" ");
}

export interface EquityCurveProps {
  strategy: Curve;
  strategyLabel: string;
  benchmark: Curve;
  benchmarkLabel: string;
}

export function EquityCurve({
  strategy,
  strategyLabel,
  benchmark,
  benchmarkLabel,
}: EquityCurveProps) {
  const curves = [strategy, benchmark].filter((c) => c.segments.length > 0);
  if (curves.length === 0) {
    return <p className="lab-empty-msg">그릴 자산곡선이 없습니다.</p>;
  }

  const from = Math.min(...curves.map((c) => c.from?.getTime() ?? Infinity));
  const to = Math.max(...curves.map((c) => c.to?.getTime() ?? -Infinity));
  const min = Math.min(...curves.map((c) => c.min));
  const max = Math.max(...curves.map((c) => c.max));
  const scale = buildScale(from, to, min, max);

  /**
   * 눈금 (LAB-FIX2 PART F-4).
   *
   * 종전에는 `최대 · 0 · 최소` 셋뿐이라 **가운데 값을 읽을 수 없었다** —
   * 곡선이 +40% 인지 +60% 인지 눈으로 재야 했다. 이제 고른 간격으로 단다.
   *
   * 간격은 범위에 맞춰 고르고, **데이터가 실제로 닿는 값에만** 라벨을 단다 —
   * 닿지도 않는 눈금은 스케일을 넓어 보이게 한다.
   */
  const span = max - min;
  const step = span > 200 ? 50 : span > 100 ? 25 : span > 40 ? 10 : span > 16 ? 5 : 2;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  if (!ticks.includes(0) && min <= 0 && max >= 0) ticks.push(0);
  ticks.sort((a, b) => a - b);

  const zeroY = scale.y(0);

  /**
   * 낙폭 구간 음영 (PART F-4).
   *
   * 전략이 **고점 아래에 있던 동안**을 옅게 칠한다. 곡선만 보면 낙폭이 얼마나
   * 오래갔는지 안 보이는데, MDD 숫자 하나로는 "얼마나 깊었나" 만 알고
   * **"얼마나 오래 물려 있었나" 는 모른다.**
   */
  const underwater: { x1: number; x2: number }[] = [];
  for (const segment of strategy.segments) {
    let peak = -Infinity;
    let start: number | null = null;
    for (const point of segment) {
      if (point.pct >= peak) {
        peak = point.pct;
        if (start !== null) {
          underwater.push({ x1: start, x2: scale.x(point.at) });
          start = null;
        }
      } else if (start === null) {
        start = scale.x(point.at);
      }
    }
    const last = segment[segment.length - 1];
    if (start !== null && last) underwater.push({ x1: start, x2: scale.x(last.at) });
  }

  const segmentCount = strategy.segments.length;

  return (
    <figure className="lab-curve">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        // 높이를 px 로 박으면 폭이 줄 때 비율이 깨져 폰에서 선이 납작해진다.
        // viewBox 가 비율을 갖고 있으니 높이는 CSS 가 정하게 둔다.
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${strategyLabel} 자산곡선과 ${benchmarkLabel} 벤치마크`}
      >
        {/* 낙폭 구간 — 선보다 **먼저** 그린다. 위에 그리면 곡선을 덮는다 */}
        {underwater.map((band, i) => (
          <rect
            key={`uw-${i}`}
            x={band.x1}
            y={PAD.top}
            width={Math.max(0.5, band.x2 - band.x1)}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="var(--down)"
            opacity={0.07}
          />
        ))}

        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={scale.y(value)}
              y2={scale.y(value)}
              stroke={value === 0 ? "var(--line)" : "var(--line)"}
              strokeWidth={value === 0 ? 1 : 0.5}
            />
            <text
              x={WIDTH - PAD.right + 6}
              y={scale.y(value) + 3.5}
              className="lab-curve-tick"
            >
              {value > 0 ? "+" : ""}
              {value.toFixed(0)}%
            </text>
          </g>
        ))}

        {/* 벤치마크 — 회색 점선. 항상 옆에 둔다(LAB-00 §7). */}
        {benchmark.segments.map((segment, i) => (
          <path
            key={`b-${i}`}
            d={toPath(segment, scale)}
            fill="none"
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

        {/* 선택 전략 — 강조색. **강조색은 여기와 1위·최적값에만**(PART G). */}
        {strategy.segments.map((segment, i) => (
          <path
            key={`s-${i}`}
            d={toPath(segment, scale)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.4}
          />
        ))}

        <text x={PAD.left} y={HEIGHT - 6} className="lab-curve-tick">
          {new Date(from).toISOString().slice(0, 10)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="lab-curve-tick">
          {new Date(to).toISOString().slice(0, 10)}
        </text>
        {zeroY > PAD.top && zeroY < HEIGHT - PAD.bottom ? null : null}
      </svg>

      <figcaption className="lab-curve-legend">
        <span className="lab-curve-key accent">━</span> {strategyLabel}
        <span className="lab-curve-key dim">┅</span> {benchmarkLabel}
        {segmentCount > 1 ? (
          <span className="lab-curve-note">
            선이 {segmentCount}조각이다 — 워크포워드 학습 구간과 데이터 구멍은 잇지 않는다.
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

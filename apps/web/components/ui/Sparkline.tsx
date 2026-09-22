"use client";

/**
 * 행 안 작은 추이선 (UI-01 E).
 *
 * 축도 격자도 없다. **모양만 본다** — 정확한 값은 옆 칸에 숫자로 있다.
 * 값이 `null` 인 구간은 끊는다. 이어 그리면 끊긴 수집이 완만한 선으로 보인다.
 */
import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({
  data,
  tone = "mute",
  width = 92,
  height = 32,
}: {
  data: { value: number | null }[];
  tone?: "up" | "dn" | "mute";
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return <span className="ui-spark is-empty" style={{ width, height }} aria-hidden />;
  }
  const stroke = tone === "up" ? "var(--up)" : tone === "dn" ? "var(--dn)" : "var(--ink-3)";
  return (
    <span className="ui-spark" style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </span>
  );
}

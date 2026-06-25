"use client";

import { scoreToColor, assetHeatScore, scoreToFace, type ChartCard } from "@fomo/core";
import { FomoFace } from "@/components/FomoFace";
import { Sparkline } from "@/components/Sparkline";

/** 등락률 표기. */
function pct(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v}%`;
}

function fmtValue(v: number): string {
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

/**
 * 차트 카드 본문 — 포모 코멘트 + 자산명·현재가·등락% + 미니 추이선(있으면).
 * docs/PIVOT_FEED_FIRST.md. 등락 방향색(상승=빨강/하락=파랑). series 없으면 숫자만.
 */
export function ChartCardBody({ chart }: { chart: ChartCard }) {
  const up = chart.changePct >= 0;
  const color = up ? "#FF5A36" : "#38BDF8";
  const face = scoreToFace(assetHeatScore(chart.changePct));

  return (
    <div className="flex h-full flex-col">
      {/* 포모 + 코멘트 */}
      <div className="flex items-start gap-2.5">
        <FomoFace face={face} size={44} glow={color} />
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[11px] text-muted">포모 · 시장 한눈에</p>
          {chart.comment && (
            <p className="fomo-rise mt-1 rounded-2xl rounded-tl-sm border border-hairline bg-elevated px-3 py-2 text-sm leading-5 text-whiteout">
              {chart.comment}
            </p>
          )}
        </div>
      </div>

      {/* 자산명 + 현재가 + 등락 */}
      <div className="mt-5">
        <p className="font-pixel text-sm text-muted">{chart.label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-bold leading-none text-whiteout">{fmtValue(chart.value)}</span>
          <span className="text-sm font-medium" style={{ color }}>
            {pct(chart.changePct)}
          </span>
        </div>
      </div>

      {/* 추이선(있으면) — 없으면 빈 공간으로 두고 숫자 카드 */}
      <div className="mt-4 flex-1">
        {chart.series && chart.series.length >= 2 ? (
          <Sparkline series={chart.series} />
        ) : (
          <p className="mt-2 text-[11px] text-muted">최근 추이는 지금 잠깐 못 가져왔어. 숫자만 볼게.</p>
        )}
      </div>

      <p className="mt-3 border-t border-hairline pt-3 text-[11px] text-muted">
        시장 체감용 지표예요. 투자 조언이 아니에요.
      </p>
    </div>
  );
}

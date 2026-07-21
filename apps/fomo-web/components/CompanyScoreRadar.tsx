"use client";

import { useMemo, useState } from "react";
import type { CompanyScoreAxisKey, CompanyScoreResult } from "@fomo/core";
import { DepthSection } from "@/components/DepthSection";
import { chartTokens } from "@/lib/chartTokens";

const ORDER: CompanyScoreAxisKey[] = ["valuation", "growth", "profitability", "flow", "chart", "quiet"];
const LABEL: Record<CompanyScoreAxisKey, string> = {
  valuation: "밸류",
  growth: "성장",
  profitability: "체력",
  flow: "수급",
  chart: "차트",
  quiet: "조용함",
};

function point(index: number, score: number, radius = 82, center = 110): [number, number] {
  const angle = -Math.PI / 2 + (index * Math.PI) / 3;
  const scaled = radius * (score / 100);
  return [center + Math.cos(angle) * scaled, center + Math.sin(angle) * scaled];
}

function polygon(score: number): string {
  return ORDER.map((_, index) => point(index, score).join(",")).join(" ");
}

export function CompanyScoreRadar({ result }: { result: CompanyScoreResult | null | undefined }) {
  const [selected, setSelected] = useState<CompanyScoreAxisKey | null>(null);
  const states = useMemo(() => {
    if (!result) return [];
    if (Array.isArray(result.axisStates)) return result.axisStates;
    return ORDER.map((key) => {
      const axis = result.axes.find((item) => item.key === key);
      return axis
        ? { ...axis, status: "available" as const }
        : { key, label: LABEL[key], status: "missing" as const, score: null, evidence: [], missingReason: "데이터 없음" as const };
    });
  }, [result]);
  const byKey = useMemo(() => new Map(states.map((axis) => [axis.key, axis])), [states]);
  const active = selected ? byKey.get(selected) : undefined;
  const dataPolygon = ORDER.map((key, index) => point(index, byKey.get(key)?.score ?? 0).join(",")).join(" ");

  if (!result) return null;

  return (
    <DepthSection className="mt-4" ariaLabelledby="company-score-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-pixel text-[11px] text-muted">COMPANY SCORE</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              id="company-score-title"
              className={`font-number font-bold leading-none ${result.score == null ? "text-xl" : "text-4xl"}`}
              style={{ color: chartTokens.up }}
            >
              {result.score ?? "분석 축적 중"}
            </span>
            {result.score != null && <span className="text-sm font-semibold text-muted">/ 100</span>}
          </div>
        </div>
        <span className="max-w-[58%] text-right text-sm font-semibold leading-5 text-whiteout">{result.label}</span>
      </div>

      <div className="mt-4 flex justify-center">
        <svg viewBox="0 0 220 220" className="h-[250px] w-[250px] max-w-full" role="img" aria-label="종합 기업 점수 6축 레이더">
          {[25, 50, 75, 100].map((level) => (
            <polygon key={level} points={polygon(level)} fill="none" stroke={chartTokens.grid} strokeWidth="1" />
          ))}
          {ORDER.map((key, index) => {
            const [x, y] = point(index, 100);
            return <line key={key} x1="110" y1="110" x2={x} y2={y} stroke={chartTokens.grid} strokeWidth="1" />;
          })}
          <polygon points={dataPolygon} fill={chartTokens.zone.accumulation} stroke={chartTokens.up} strokeWidth="2" />
          {ORDER.map((key, index) => {
            const axis = byKey.get(key);
            const available = axis?.status === "available" && axis.score != null;
            const [x, y] = point(index, axis?.score ?? 0);
            const [labelX, labelY] = point(index, 118);
            return (
              <g key={key}>
                {available && <circle cx={x} cy={y} r="3.5" fill={chartTokens.up} />}
                <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fill={available ? chartTokens.marker.event : chartTokens.neutral} fontSize="10">
                  {LABEL[key]}
                </text>
                <text x={labelX} y={labelY + 12} textAnchor="middle" dominantBaseline="middle" fill={available ? chartTokens.up : chartTokens.neutral} fontSize="9">
                  {axis?.score ?? "없음"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-sm leading-6 text-whiteout">{result.interpretation}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted">
        데이터가 없는 축은 명시적으로 제외하고, 가용한 {result.availableAxisCount}개 축을 같은 비중으로 계산했어요.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        {ORDER.map((key) => {
          const axis = byKey.get(key);
          const available = axis?.status === "available" && axis.score != null;
          const isActive = selected === key;
          return (
            <button
              key={key}
              type="button"
              disabled={!available}
              onClick={() => setSelected(isActive ? null : key)}
              className="flex min-h-10 items-center justify-between border-b border-hairline py-2 text-left disabled:opacity-35"
              aria-expanded={isActive}
            >
              <span className="text-xs text-muted">{LABEL[key]}</span>
              <span className="font-number text-sm font-bold" style={{ color: available ? chartTokens.up : chartTokens.neutral }}>
                {axis?.score ?? "데이터 없음"}
              </span>
            </button>
          );
        })}
      </div>

      {active?.status === "available" && active.score != null && (
        <div className="mt-3 border-l-2 pl-3" style={{ borderColor: chartTokens.up }}>
          <p className="text-xs font-semibold text-whiteout">{active.label} {active.score}점 근거</p>
          {active.evidence.map((evidence) => (
            <p key={evidence} className="mt-1 text-xs leading-5 text-muted">{evidence}</p>
          ))}
        </div>
      )}
    </DepthSection>
  );
}

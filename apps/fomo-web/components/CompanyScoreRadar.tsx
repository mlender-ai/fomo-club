"use client";

import { useMemo, useState } from "react";
import type { CompanyScoreAxisKey, CompanyScoreResult } from "@fomo/core";
import { DepthSection } from "@/components/DepthSection";
import { chartTokens } from "@/lib/chartTokens";
import { easyMarketCopy } from "@/lib/easyMarketCopy";

const ORDER: CompanyScoreAxisKey[] = ["valuation", "growth", "profitability", "flow", "chart", "quiet"];

// WO-1 — 유저어 표시 라벨(내부 키는 유지). 리스트엔 풀 네임, 육각형 꼭짓점엔 좁은 자리용 축약.
const LABEL: Record<CompanyScoreAxisKey, string> = {
  valuation: "가격 매력",
  growth: "성장",
  profitability: "돈 버는 힘",
  flow: "큰손 움직임",
  chart: "차트 자리",
  quiet: "덜 알려짐",
};
const HEX_LABEL: Record<CompanyScoreAxisKey, string> = {
  valuation: "가격",
  growth: "성장",
  profitability: "수익력",
  flow: "큰손",
  chart: "차트",
  quiet: "덜알려짐",
};
// 이름 밑에 항상 붙는 한 줄 뜻(툴팁 금지 — 상시 노출).
const MEANING: Record<CompanyScoreAxisKey, string> = {
  valuation: "과거 대비 지금 싼 편인가",
  growth: "매출이 크고 있나",
  profitability: "실제로 이익을 내고 있나",
  flow: "기관·외국인·내부자가 사고 있나",
  chart: "지금 차트 위치가 좋은가",
  quiet: "아직 사람들이 안 보고 있나",
};

type Tone = "strength" | "neutral" | "weakness";

// 점수 → 그 점수의 의미 한 조각. 축마다 좋고 나쁨이 달라 개별 문구 사전으로.
// 모든 축은 점수가 높을수록 좋다(덜 알려짐 100 = 아무도 안 봄 = 강점).
const READING: Record<CompanyScoreAxisKey, Record<Tone, string>> = {
  valuation: { strength: "싼 편", neutral: "보통 수준", weakness: "비싼 편" },
  growth: { strength: "잘 크는 중", neutral: "완만한 편", weakness: "둔한 편" },
  profitability: { strength: "잘 버는 중", neutral: "보통", weakness: "아직 약함" },
  flow: { strength: "큰손이 담는 중", neutral: "뚜렷한 매수세는 아직", weakness: "큰손 이탈 우세" },
  chart: { strength: "자리 좋음", neutral: "눈치보는 자리", weakness: "흐름 약함" },
  quiet: { strength: "거의 아무도 안 보는 중", neutral: "관심 붙는 중", weakness: "이미 주목받는 중" },
};

function toneOf(score: number): Tone {
  if (score >= 65) return "strength";
  if (score <= 40) return "weakness";
  return "neutral";
}

const TONE_COLOR: Record<Tone, string> = {
  strength: chartTokens.up, // 라임 = 강점
  neutral: "#FAFAFA", // 무채색 = 중립
  weakness: chartTokens.neutral, // 회색 = 약점
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
    <DepthSection className="mt-4" {...(result.score != null ? { ariaLabelledby: "company-score-title" } : {})}>
      <div className="flex items-start justify-between gap-4">
        {result.score != null && <div>
          <p className="font-pixel text-[11px] text-muted">COMPANY SCORE</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              id="company-score-title"
              className="font-number text-4xl font-bold leading-none"
              style={{ color: chartTokens.up }}
            >
              {result.score}
            </span>
            <span className="text-sm font-semibold text-muted">/ 100</span>
          </div>
        </div>}
        {result.score != null && <span className="max-w-[58%] text-right text-sm font-semibold leading-5 text-whiteout">{easyMarketCopy(result.label, "detail")}</span>}
      </div>

      {/* 육각형 읽는 법 — 유저는 레이더 읽는 법을 모른다(WO-1). */}
      <p className="mt-4 text-center text-[11px] text-muted">
        여섯 방향으로 <span style={{ color: chartTokens.up }}>바깥쪽까지 넓을수록</span> 좋아요
      </p>

      <div className="mt-1 flex justify-center">
        <svg viewBox="0 0 220 232" className="h-[250px] w-[250px] max-w-full" role="img" aria-label="종합 기업 점수 6축 레이더">
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
            const tone = available ? toneOf(axis!.score!) : null;
            const [x, y] = point(index, axis?.score ?? 0);
            const [labelX, labelY] = point(index, 120);
            return (
              <g key={key}>
                {available && <circle cx={x} cy={y} r="3.5" fill={tone ? TONE_COLOR[tone] : chartTokens.up} />}
                <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fill={available ? chartTokens.marker.event : chartTokens.neutral} fontSize="10">
                  {HEX_LABEL[key]}
                </text>
                <text x={labelX} y={labelY + 12} textAnchor="middle" dominantBaseline="middle" fill={available && tone ? TONE_COLOR[tone] : chartTokens.neutral} fontSize="9" fontWeight="700">
                  {axis?.score ?? "없음"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {result.score != null && <>
        <p className="text-sm leading-6 text-whiteout">{easyMarketCopy(result.interpretation, "detail")}</p>
        <p className="mt-1 text-[10px] leading-4 text-muted">
          데이터가 없는 축은 명시적으로 제외하고, 가용한 {result.availableAxisCount}개 축을 같은 비중으로 계산했어요.
        </p>
      </>}

      {/* 축별: 이름 + 한 줄 뜻(상시) + 점수 + 점수 해석. 강점=라임·약점=회색·중립=무채색. */}
      <div className="mt-4 flex flex-col">
        {ORDER.map((key) => {
          const axis = byKey.get(key);
          const available = axis?.status === "available" && axis.score != null;
          const tone = available ? toneOf(axis!.score!) : null;
          const color = tone ? TONE_COLOR[tone] : chartTokens.neutral;
          const isActive = selected === key;
          return (
            <button
              key={key}
              type="button"
              disabled={!available}
              onClick={() => setSelected(isActive ? null : key)}
              className="flex items-start justify-between gap-3 border-b border-hairline py-2.5 text-left disabled:opacity-45"
              aria-expanded={isActive}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-whiteout">{LABEL[key]}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted">{MEANING[key]}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-number text-base font-bold leading-none" style={{ color }}>
                  {axis?.score ?? "정보 없음"}
                </span>
                {available && tone && (
                  <span className="mt-1 block text-[11px] leading-4" style={{ color }}>
                    {READING[key][tone]}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {active?.status === "available" && active.score != null && (
        <div className="mt-3 border-l-2 pl-3" style={{ borderColor: chartTokens.up }}>
          <p className="text-xs font-semibold text-whiteout">{LABEL[active.key]} {active.score}점 근거</p>
          {active.evidence.map((evidence) => (
            <p key={evidence} className="mt-1 text-xs leading-5 text-muted">{easyMarketCopy(evidence, "detail")}</p>
          ))}
        </div>
      )}
    </DepthSection>
  );
}

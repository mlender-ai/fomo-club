"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatSignalResumeBadge,
  normalizeSignalTypeCodes,
  signalTypeLabel,
  type SignalTypeCode,
} from "@fomo/core";
import { fetchLedgerTimeline, type LedgerTimelineEntry, type TrackMetric } from "@/lib/fomoApi";
import { DepthLine, DepthSection } from "@/components/DepthSection";
import { chartTokens } from "@/lib/chartTokens";

const KIND_LABEL: Record<LedgerTimelineEntry["kind"], string> = {
  signal: "신호",
  verdict: "판단",
  score: "점수",
  selection: "30장 선정",
  user_action: "내 판단",
  outcome: "성과",
};

const KIND_STYLE: Record<LedgerTimelineEntry["kind"], { icon: string; color: string }> = {
  signal: { icon: "●", color: chartTokens.up },
  verdict: { icon: "V", color: chartTokens.ma60 },
  score: { icon: "#", color: chartTokens.up },
  selection: { icon: "✓", color: chartTokens.marker.event },
  user_action: { icon: "★", color: chartTokens.ma120 },
  outcome: { icon: "↗", color: "#C9C9C4" },
};

function summary(entry: LedgerTimelineEntry): string {
  const payload = entry.payload;
  if (entry.kind === "signal") {
    const types = signalTypes(entry).map(signalTypeLabel);
    return [types.join(" · "), typeof payload.headline === "string" ? payload.headline : ""].filter(Boolean).join(" — ");
  }
  if (entry.kind === "verdict") return typeof payload.stanceText === "string" ? payload.stanceText : "결정론 판단 기록";
  if (entry.kind === "score") {
    const score = typeof payload.score === "number" ? `${payload.score}점` : "점수 기록";
    return `${score}${typeof payload.label === "string" ? ` · ${payload.label}` : ""}`;
  }
  if (entry.kind === "selection") return "오늘의 30장에 선정";
  if (entry.kind === "user_action") {
    const action = payload.action;
    return action === "seen" ? "처음 봄" : action === "pass" ? "넘김" : action === "star" ? "관심에 담음" : "상세 확인";
  }
  const days = typeof payload.windowDays === "number" ? `${payload.windowDays}일` : "고정창";
  const value = typeof payload.returnPct === "number" ? `${payload.returnPct > 0 ? "+" : ""}${payload.returnPct.toFixed(1)}%` : "";
  return `${days} 성과 ${value}`.trim();
}

function signalTypes(entry: LedgerTimelineEntry): SignalTypeCode[] {
  if (entry.kind !== "signal") return [];
  const raw = Array.isArray(entry.payload.signalTypes)
    ? entry.payload.signalTypes
    : Array.isArray(entry.payload.types)
      ? entry.payload.types
      : [];
  return normalizeSignalTypeCodes(raw);
}

function price(value: number): string {
  return value >= 1_000 ? value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function JudgmentTimeline({ canonical }: { canonical: string }) {
  const [entries, setEntries] = useState<LedgerTimelineEntry[]>([]);
  const [signalHistory30, setSignalHistory30] = useState<Record<string, TrackMetric>>({});
  useEffect(() => {
    let alive = true;
    void fetchLedgerTimeline(canonical)
      .then((result) => {
        if (alive) {
          setEntries(result.entries);
          setSignalHistory30(result.signalHistory30);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canonical]);
  const visible = useMemo(() => entries.slice(0, 8), [entries]);
  if (visible.length === 0) return null;
  return (
    <DepthSection
      className="mt-4"
      variant="list"
      title="이 종목 판단 기록"
      description="포모클럽이 이 종목을 언제 뭐라 봤는지, 그때 가격과 함께 지워지지 않게 남긴 기록이에요."
      aside={<span className="text-[10px] text-muted">지워지지 않는 시점 기록</span>}
    >
        {visible.map((entry) => {
          const style = KIND_STYLE[entry.kind];
          const resumes = signalTypes(entry).flatMap((code) => {
            const metric = signalHistory30[code];
            return metric ? [{ code, metric }] : [];
          });
          return (
            <DepthLine key={`${entry.id}-${entry.date}`} className="grid grid-cols-[70px_1fr] gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: style.color }}>
                  <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px]" style={{ borderColor: style.color }}>
                    {style.icon}
                  </span>
                  {KIND_LABEL[entry.kind]}
                </p>
                <p className="mt-0.5 font-number text-[10px] text-muted">{entry.date.slice(5)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs leading-5 text-whiteout">{summary(entry)}</p>
                {resumes.map(({ code, metric }) => (
                  <p key={code} className="mt-1 text-[10px] leading-4 text-muted">
                    {formatSignalResumeBadge(code, metric)}
                  </p>
                ))}
                <p className="mt-0.5 text-[10px] text-muted">당시 가격 {price(entry.priceAt)}</p>
              </div>
            </DepthLine>
          );
        })}
    </DepthSection>
  );
}

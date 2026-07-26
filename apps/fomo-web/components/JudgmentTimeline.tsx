"use client";

import { useEffect, useMemo, useState } from "react";
import { formatSignalResumeBadge, SIGNAL_RESUME_MIN_SAMPLE } from "@fomo/core";
import { fetchLedgerTimeline, type LedgerTimelineEntry, type TrackMetric } from "@/lib/fomoApi";
import { collapseRepeats, entrySummary, signalTypes } from "@/lib/judgmentTimeline";
import { DepthLine, DepthSection } from "@/components/DepthSection";
import { chartTokens } from "@/lib/chartTokens";
import { easyMarketCopy } from "@/lib/easyMarketCopy";

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

function kindLabel(entry: LedgerTimelineEntry): string {
  if (entry.kind === "selection" && entry.payload.pickType === "quiet") return "조용한 픽";
  return KIND_LABEL[entry.kind];
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
  // 같은 말이 날짜만 바꿔 반복되면(예: 4일 연속 "조용한 픽으로 선정") 한 줄로 접는다.
  // 사실을 지우는 게 아니라 "며칠부터 몇 번"으로 합친다 — 스크롤만 줄고 기록은 그대로.
  const visible = useMemo(() => collapseRepeats(entries).slice(0, 8), [entries]);
  if (visible.length === 0) return null;
  return (
    <DepthSection
      className="mt-4"
      variant="list"
      title="이 종목 판단 기록"
      description="포모클럽이 이 종목을 언제 뭐라 봤는지, 그때 가격과 함께 지워지지 않게 남긴 기록이에요."
      aside={<span className="text-[10px] text-muted">지워지지 않는 시점 기록</span>}
    >
        {visible.map(({ entry, repeats, since }) => {
          const style = KIND_STYLE[entry.kind];
          const resumes = signalTypes(entry).flatMap((code) => {
            const metric = signalHistory30[code];
            return metric && metric.n >= SIGNAL_RESUME_MIN_SAMPLE && metric.winRate !== null ? [{ code, metric }] : [];
          });
          return (
            <DepthLine key={`${entry.id}-${entry.date}`} className="grid grid-cols-[70px_1fr] gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: style.color }}>
                  <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px]" style={{ borderColor: style.color }}>
                    {style.icon}
                  </span>
                  {kindLabel(entry)}
                </p>
                <p className="mt-0.5 font-number text-[10px] text-muted">
                  {entry.date.slice(5)}
                  {repeats > 1 && since && <span className="block">…{since.slice(5)}</span>}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs leading-5 text-whiteout">
                  {easyMarketCopy(entrySummary(entry), "detail")}
                  {/* "연속 며칠"이 아니라 "몇 번" — 날짜가 붙어 있다고 단정하지 않는다. */}
                  {repeats > 1 && <span className="ml-1 text-muted">· {repeats}번</span>}
                </p>
                {resumes.map(({ code, metric }) => (
                  <p key={code} className="mt-1 text-[10px] leading-4 text-muted">
                    {easyMarketCopy(formatSignalResumeBadge(code, metric), "detail")}
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

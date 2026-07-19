"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchLedgerTimeline, type LedgerTimelineEntry } from "@/lib/fomoApi";

const KIND_LABEL: Record<LedgerTimelineEntry["kind"], string> = {
  signal: "신호",
  verdict: "판단",
  score: "점수",
  selection: "30장 선정",
  user_action: "내 판단",
  outcome: "성과",
};

function summary(entry: LedgerTimelineEntry): string {
  const payload = entry.payload;
  if (entry.kind === "signal") {
    const types = Array.isArray(payload.types) ? payload.types.filter((item): item is string => typeof item === "string") : [];
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

function price(value: number): string {
  return value >= 1_000 ? value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function JudgmentTimeline({ canonical }: { canonical: string }) {
  const [entries, setEntries] = useState<LedgerTimelineEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchLedgerTimeline(canonical)
      .then((result) => {
        if (alive) setEntries(result.entries);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canonical]);
  const visible = useMemo(() => entries.slice(0, 8), [entries]);
  if (visible.length === 0) return null;
  return (
    <section className="mt-4 border-y border-hairline py-4">
      <div className="flex items-center justify-between">
        <p className="font-pixel text-sm text-whiteout">판단 원장</p>
        <span className="text-[10px] text-muted">수정되지 않는 시점 기록</span>
      </div>
      <div className="mt-3 divide-y divide-hairline">
        {visible.map((entry) => (
          <div key={`${entry.id}-${entry.date}`} className="grid grid-cols-[70px_1fr] gap-3 py-2.5">
            <div>
              <p className="text-[10px] font-semibold text-muted">{KIND_LABEL[entry.kind]}</p>
              <p className="mt-0.5 font-number text-[10px] text-muted">{entry.date.slice(5)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs leading-5 text-whiteout">{summary(entry)}</p>
              <p className="mt-0.5 text-[10px] text-muted">당시 가격 {price(entry.priceAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

"use client";

import type { CSSProperties } from "react";
import type { DeckContent } from "@/lib/discoveryDeck";

function clampStyle(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
  };
}

function typeLabel(type: DeckContent["contentType"]): string {
  switch (type) {
    case "index":
      return "지수";
    case "macro":
      return "거시";
    case "whale":
      return "고래";
    case "briefing":
      return "브리핑";
    case "buzz":
      return "버즈";
    case "recap":
      return "주간";
    case "macro-issue":
      return "거시 이슈";
    case "coin-issue":
      return "코인";
    case "hot-issue":
      return "이슈";
    case "term":
      return "용어";
    case "event":
      return "일정";
    default:
      return "노트";
  }
}

function scopeLabel(scope: DeckContent["scope"]): string {
  switch (scope) {
    case "domestic":
      return "국내";
    case "world":
      return "미국";
    case "global":
      return "글로벌";
  }
}

function cardLabel(type: DeckContent["contentType"]): string {
  if (type === "briefing") return "DAILY BRIEFING";
  if (type === "buzz") return "BUZZ STORY";
  if (type === "recap") return "WEEKLY RECAP";
  if (type === "coin-issue") return "COIN ISSUE";
  if (type === "hot-issue") return "HOT ISSUE";
  if (type === "term") return "오늘의 용어";
  if (type === "event") return "MARKET CALENDAR";
  return "MARKET NOTE";
}

function valueTone(value: string): string {
  const number = Number.parseFloat(value.replace(/,/g, ""));
  if (!Number.isFinite(number)) return "rgba(250,250,250,0.78)";
  if (number > 0) return "#FF4D4D";
  if (number < 0) return "#3B82F6";
  return "#8A8A86";
}

export function ContentCard({ card, progress }: { card: DeckContent; progress?: string | undefined }) {
  const rich = card.contentType === "briefing" || card.contentType === "buzz" || card.contentType === "recap";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <span className="font-pixel text-[10px] uppercase tracking-wide text-muted">{cardLabel(card.contentType)}</span>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={`${rich ? "text-xl leading-7" : "text-2xl leading-8"} font-bold text-whiteout`} style={clampStyle(3)}>
              {card.headline}
            </h3>
            <p className="mt-1 font-pixel text-xs text-muted">
              {scopeLabel(card.scope)} · {typeLabel(card.contentType)}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-hairline-soft px-3 py-1 text-xs font-bold text-whiteout">
            {typeLabel(card.contentType)}
          </span>
        </div>
      </div>

      <div className="mt-5 grid min-h-0 gap-2 overflow-hidden">
        {card.facts.slice(0, rich ? 7 : 5).map((fact) => (
          <div key={`${card.id}:${fact.label}`} className="border-b border-hairline-soft pb-2.5 last:border-b-0">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-whiteout">{fact.label}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: valueTone(fact.value) }}>
                {fact.value}
              </span>
            </div>
            {fact.detail && (
              <p className="mt-1 text-xs leading-4 text-muted" style={clampStyle(2)}>
                {fact.detail}
              </p>
            )}
          </div>
        ))}
      </div>

      {card.note && (
        <div className="mt-3 shrink-0 rounded-xl px-3.5 py-3" style={{ backgroundColor: "rgba(216,255,58,0.12)" }}>
          <p className="font-pixel text-[10px] uppercase tracking-wide" style={{ color: "#D8FF3A" }}>
            Editor&apos;s Note
          </p>
          <p className="mt-1 text-sm leading-5 text-whiteout" style={clampStyle(4)}>
            {card.note}
          </p>
        </div>
      )}

      <div className="mt-auto flex shrink-0 items-center justify-between pt-3">
        <span className="font-pixel text-[11px] text-muted">
          {card.source} · {card.asOf}
        </span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
    </div>
  );
}

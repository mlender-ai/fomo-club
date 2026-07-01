"use client";

import type { CSSProperties } from "react";
import type { DeckSectorCardData } from "@/lib/discoveryDeck";
import { CaretDownIcon, CaretUpIcon } from "@/components/icons";

const DIR_COLOR: Record<string, string> = { up: "#FF4D4D", down: "#3B82F6", flat: "#8A8A86" };

function clampStyle(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
  };
}

function stanceLabel(stance: DeckSectorCardData["stance"]): string {
  switch (stance) {
    case "bull-dominant":
      return "강세 우세";
    case "bear-dominant":
      return "약세 우세";
    case "balanced":
      return "혼조";
    case "insufficient":
    default:
      return "관찰 중";
  }
}

function stanceTone(stance: DeckSectorCardData["stance"]): string {
  switch (stance) {
    case "bull-dominant":
      return DIR_COLOR.up ?? "#FF4D4D";
    case "bear-dominant":
      return DIR_COLOR.down ?? "#3B82F6";
    default:
      return "rgba(250,250,250,0.78)";
  }
}

function changeParts(changePct: number | undefined): { text: string; dir: "up" | "down" | "flat" } {
  if (typeof changePct !== "number") return { text: "확인 중", dir: "flat" };
  const dir = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  return { text: `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`, dir };
}

export function SectorCard({ card, progress }: { card: DeckSectorCardData; progress?: string | undefined }) {
  const tone = stanceTone(card.stance);
  const countryLabel = card.country === "US" ? "미국" : "국내";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <span className="font-pixel text-[10px] uppercase tracking-wide text-muted">SECTOR</span>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-3xl font-bold leading-9 text-whiteout" style={clampStyle(2)}>
              {card.sector}
            </h3>
            <p className="mt-1 font-pixel text-xs text-muted">{countryLabel} 섹터 흐름</p>
          </div>
          <span className="shrink-0 rounded-full border border-hairline-soft px-3 py-1 text-xs font-bold" style={{ color: tone }}>
            {stanceLabel(card.stance)}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted" style={clampStyle(2)}>
          {card.stanceNote}
        </p>
      </div>

      <div className="mt-5 grid min-h-0 gap-2 overflow-hidden">
        {card.stocks.slice(0, 5).map((stock) => {
          const change = changeParts(stock.changePct);
          const secondary = card.country === "KR" ? stock.flowSignal : stock.volumeSignal;
          return (
            <div key={`${card.id}:${stock.canonical}`} className="border-b border-hairline-soft pb-2 last:border-b-0">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-base font-bold text-whiteout">{stock.canonical}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums" style={{ color: DIR_COLOR[change.dir] ?? DIR_COLOR.flat }}>
                  {change.dir === "up" && <CaretUpIcon size={11} />}
                  {change.dir === "down" && <CaretDownIcon size={11} />}
                  {change.text}
                </span>
              </div>
              {secondary && (
                <p className="mt-1 text-xs leading-5 text-muted" style={clampStyle(1)}>
                  {secondary}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex shrink-0 items-center justify-between pt-3">
        <span className="font-pixel text-[11px] text-muted">
          {card.country === "KR" ? "가격 · 수급 · 뉴스" : "가격 · 거래량 · 뉴스"}
        </span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
    </div>
  );
}

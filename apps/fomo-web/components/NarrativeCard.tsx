"use client";

import type { CSSProperties } from "react";
import type { DeckNarrative } from "@/lib/discoveryDeck";
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

function relationLabel(relation: DeckNarrative["stocks"][number]["relation"]): string {
  switch (relation) {
    case "trigger":
      return "트리거";
    case "customer":
      return "수요처";
    case "supplier":
      return "공급사";
    case "material":
      return "원재료";
    case "beneficiary":
      return "확산 수혜";
    case "peer":
    default:
      return "동행주";
  }
}

function changeParts(changePct: number): { text: string; dir: "up" | "down" | "flat" } {
  const dir = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  return { text: `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`, dir };
}

export function NarrativeCard({ card, progress }: { card: DeckNarrative; progress?: string | undefined }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <span className="font-pixel text-[10px] uppercase tracking-wide text-muted">STORY</span>
        <h3 className="mt-3 text-2xl font-bold leading-8 text-whiteout" style={clampStyle(3)}>
          {card.headline}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted" style={clampStyle(2)}>
          {card.trigger.headline}
        </p>
      </div>

      <div className="mt-5 grid min-h-0 gap-2 overflow-hidden">
        {card.stocks.slice(0, 4).map((stock) => {
          const change = changeParts(stock.changePct);
          return (
            <div key={`${card.id}:${stock.ticker}`} className="rounded-xl border border-hairline bg-white/[0.035] px-3 py-2.5">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-base font-bold text-whiteout">{stock.name}</span>
                    <span className="shrink-0 rounded-full border border-hairline-soft px-2 py-0.5 text-[10px] text-muted">
                      {relationLabel(stock.relation)}
                    </span>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums" style={{ color: DIR_COLOR[change.dir] }}>
                  {change.dir === "up" && <CaretUpIcon size={11} />}
                  {change.dir === "down" && <CaretDownIcon size={11} />}
                  {change.text}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted" style={clampStyle(1)}>
                {stock.relationReason}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex shrink-0 items-center justify-between pt-3">
        <span className="font-pixel text-[11px] text-muted">
          {card.source} · {card.asOf}
        </span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
    </div>
  );
}

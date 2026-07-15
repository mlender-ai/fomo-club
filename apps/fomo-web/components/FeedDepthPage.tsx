"use client";

import { useEffect, useState } from "react";
import { CalendarCard } from "@/components/CalendarCard";
import { StockInsightView } from "@/components/KeywordDepthPage";
import type { FeedHubItem, FeedHubSectorStockRef } from "@/lib/fomoApi";
import { sparklinePath } from "@fomo/core";

/**
 * 피드 범용 뎁스 (WO 피드 통합 §3 — "탭했는데 안 가는 항목 0").
 * 브리핑·회고·버즈·지수·거시·고래·거시이슈·섹터·종목이슈를 한 컴포넌트가 커버:
 * 사실 전체 + 해석 + (있으면) 추이 미니차트 + 원문 링크, 종목 행 탭 → 종목 뎁스 중첩.
 * 내러티브는 기존 NarrativeDepthPage 소관.
 */

const NEON = "#D8FF3A";

function valueTone(value: string): string {
  const number = Number.parseFloat(value.replace(/,/g, ""));
  if (!Number.isFinite(number)) return "rgba(250,250,250,0.78)";
  if (number > 0) return "#FF4D4D";
  if (number < 0) return "#3B82F6";
  return "#8A8A86";
}

function TrendChart({ series }: { series: number[] }) {
  const pts = series.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;
  const W = 320;
  const H = 64;
  const paths = sparklinePath(pts, W, H);
  if (!paths) return null;
  return (
    <div className="mt-4 rounded-xl border border-hairline bg-white/[0.03] p-3">
      <p className="font-pixel text-[10px] uppercase tracking-wide text-muted">추이 (최근 구간)</p>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-hidden>
        <path d={paths.line} fill="none" stroke={NEON} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

interface StockRef {
  name: string;
  naverCode?: string | undefined;
  symbol?: string | undefined;
  market?: string | undefined;
  country?: string | undefined;
  reason?: string | undefined;
}

function sectorStockRef(stock: FeedHubSectorStockRef, note: string): StockRef {
  return {
    name: stock.canonical,
    naverCode: stock.naverCode,
    symbol: stock.symbol,
    market: stock.market,
    country: stock.country,
    reason: note,
  };
}

/** 브리핑/회고 무버 라벨 → 종목 뎁스 컨텍스트(이름만으로 열기 — StockInsightView가 자체 조회). */
function factStockRef(label: string, detail: string | undefined): StockRef | null {
  const name = label.replace(/\s+/g, " ").trim();
  if (!name || /지수$|환율|금리|유가|VIX|시총/.test(name)) return null; // 지수·거시 행은 종목이 아님
  return { name, reason: detail };
}

export function FeedDepthPage({ item, onClose, inline = false }: { item: FeedHubItem; onClose: () => void; inline?: boolean }) {
  const [stockRef, setStockRef] = useState<StockRef | null>(null);

  useEffect(() => {
    if (inline) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [inline]);

  if (stockRef) {
    return (
      <StockInsightView
        stock={stockRef.name}
        context={{
          ...(stockRef.reason ? { reason: stockRef.reason } : {}),
          ...(stockRef.naverCode ? { naverCode: stockRef.naverCode } : {}),
          ...(stockRef.symbol ? { symbol: stockRef.symbol } : {}),
          ...(stockRef.market ? { market: stockRef.market } : {}),
          ...(stockRef.country ? { country: stockRef.country } : {}),
        }}
        onClose={() => setStockRef(null)}
        inline={inline}
        inlineBackLabel="피드로"
      />
    );
  }

  const body = (() => {
    if (item.type === "sector") {
      const sector = item.sector;
      return (
        <>
          <p className="font-pixel text-[10px] uppercase tracking-wide text-muted">SECTOR DEPTH</p>
          <h2 className="mt-2 text-2xl font-bold leading-8 text-whiteout">
            {sector.country === "US" ? "미국 " : ""}
            {sector.sector}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">{sector.stanceNote}</p>
          <div className="mt-5 grid gap-2">
            {sector.stocks.map((stock) => (
              <button
                key={stock.canonical}
                type="button"
                onClick={() => setStockRef(sectorStockRef(stock, sector.stanceNote))}
                className="flex items-center justify-between rounded-xl border border-hairline bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-whiteout/25"
              >
                <span className="text-sm font-semibold text-whiteout">{stock.canonical}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: valueTone(`${stock.changePct ?? ""}`) }}>
                  {typeof stock.changePct === "number" ? `${stock.changePct > 0 ? "+" : ""}${stock.changePct.toFixed(2)}%` : "—"}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">종목을 누르면 종목 상세로 이어져요.</p>
        </>
      );
    }
    if (item.type === "stock-issue") {
      const issue = item.stockIssue;
      return (
        <>
          <p className="font-pixel text-[10px] uppercase tracking-wide text-muted">STOCK ISSUE</p>
          <h2 className="mt-2 text-xl font-bold leading-7 text-whiteout">{issue.headline}</h2>
          <button
            type="button"
            onClick={() =>
              setStockRef({
                name: issue.stock,
                naverCode: issue.naverCode,
                symbol: issue.symbol,
                market: issue.market,
                country: issue.country,
                reason: issue.headline,
              })
            }
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-hairline bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-whiteout/25"
          >
            <span className="text-sm font-semibold text-whiteout">{issue.stock} 상세 보기</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: valueTone(`${issue.changePct ?? ""}`) }}>
              {typeof issue.changePct === "number" ? `${issue.changePct > 0 ? "+" : ""}${issue.changePct.toFixed(2)}%` : "→"}
            </span>
          </button>
          <p className="mt-3 font-pixel text-[11px] text-muted">
            {issue.source} · {issue.asOf}
          </p>
          {issue.url && (
            <a href={issue.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline" style={{ color: NEON }}>
              공시 원문 보기
            </a>
          )}
        </>
      );
    }
    // 내러티브는 NarrativeDepthPage 소관 — 방어적 빈 렌더(호출부가 분기함).
    if (item.type === "narrative") return null;
    // 캘린더는 카드 자체가 완결 정보 — 뎁스에서도 같은 카드를 그대로(PC 우측 클릭 경로).
    if (item.type === "calendar") return <CalendarCard calendar={item.calendar} />;
    // content 계열(briefing·recap·buzz·index·macro·whale·macro-issue) — 사실 전체 + 노트 + 추이.
    const card = item.content;
    const label =
      item.type === "briefing" ? "BRIEFING DEPTH" : item.type === "macro-issue" ? "MACRO ISSUE" : item.type === "buzz" ? "BUZZ STORY" : item.type === "recap" ? "WEEKLY RECAP" : "MARKET DEPTH";
    return (
      <>
        <p className="font-pixel text-[10px] uppercase tracking-wide text-muted">{label}</p>
        <h2 className="mt-2 text-xl font-bold leading-7 text-whiteout">{card.headline}</h2>
        <div className="mt-5 grid gap-2">
          {card.facts.map((fact) => {
            const ref = item.type === "briefing" || item.type === "recap" || item.type === "buzz" ? factStockRef(fact.label, fact.detail) : null;
            const row = (
              <>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-whiteout">{fact.label}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: valueTone(fact.value) }}>
                    {fact.value}
                  </span>
                </div>
                {fact.detail && <p className="mt-1 text-xs leading-4 text-muted">{fact.detail}</p>}
              </>
            );
            return ref ? (
              <button
                key={`${card.id}:${fact.label}`}
                type="button"
                onClick={() => setStockRef(ref)}
                className="rounded-xl border border-hairline bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-whiteout/25"
              >
                {row}
              </button>
            ) : (
              <div key={`${card.id}:${fact.label}`} className="rounded-xl border border-hairline bg-white/[0.03] px-4 py-3">
                {row}
              </div>
            );
          })}
        </div>
        {card.series && card.series.length >= 2 && <TrendChart series={card.series} />}
        {card.note && (
          <div className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(216,255,58,0.12)" }}>
            <p className="font-pixel text-[10px] uppercase tracking-wide" style={{ color: NEON }}>
              Editor&apos;s Note
            </p>
            <p className="mt-1 text-sm leading-6 text-whiteout">{card.note}</p>
          </div>
        )}
        <p className="mt-4 font-pixel text-[11px] text-muted">
          {card.source} · {card.asOf}
        </p>
        {card.sourceUrl && (
          <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline" style={{ color: NEON }}>
            원문 보기
          </a>
        )}
        {(item.type === "briefing" || item.type === "recap" || item.type === "buzz") && (
          <p className="mt-3 text-xs text-muted">종목 줄을 누르면 종목 상세로 이어져요.</p>
        )}
      </>
    );
  })();

  if (inline) {
    return (
      <div className="h-full overflow-y-auto px-6 py-6">
        <button type="button" onClick={onClose} className="mb-4 font-pixel text-xs text-muted underline">
          ← 피드로
        </button>
        {body}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-xl px-6 pb-16 pt-6">
        <button type="button" onClick={onClose} className="mb-5 font-pixel text-xs text-muted underline">
          ← 피드로
        </button>
        {body}
      </div>
    </div>
  );
}

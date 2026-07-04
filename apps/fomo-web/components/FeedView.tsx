"use client";

import { useEffect, useState } from "react";
import { ContentCard } from "@/components/ContentCard";
import { NarrativeCard } from "@/components/NarrativeCard";
import { NarrativeDepthPage } from "@/components/NarrativeDepthPage";
import { SectorCard } from "@/components/SectorCard";
import { FeedDepthPage } from "@/components/FeedDepthPage";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { fetchFeedHub, type FeedHubItem } from "@/lib/fomoApi";
import type { DeckCard, DeckNarrative, DeckSectorCardData } from "@/lib/discoveryDeck";

/**
 * 피드 표면(WO 피드 통합) — 소스는 feed-hub 단일(브리핑·버즈·회고·내러티브·섹터·지수·거시·고래·종목이슈·거시이슈).
 * ⚠️ daily-30 만 읽던 배선이 피드 다양성 붕괴의 원인이었다 — feed-hub 외 소스로 되돌리지 말 것.
 * 모든 항목은 탭 → 뎁스 도달(막다른 탭 0): 내러티브→스토리 뎁스, 나머지→FeedDepthPage.
 */

function valueTone(value: number | undefined): string {
  if (typeof value !== "number") return "rgba(250,250,250,0.78)";
  if (value > 0) return "#FF4D4D";
  if (value < 0) return "#3B82F6";
  return "#8A8A86";
}

export function sectorCardData(item: Extract<FeedHubItem, { type: "sector" }>): DeckSectorCardData {
  return {
    id: item.sector.id,
    sector: item.sector.sector,
    country: item.sector.country,
    stance: item.sector.stance,
    stanceNote: item.sector.stanceNote,
    stocks: item.sector.stocks.map((stock) => ({
      canonical: stock.canonical,
      market: stock.market as DeckSectorCardData["stocks"][number]["market"],
      country: stock.country as DeckSectorCardData["stocks"][number]["country"],
      ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
      ...(stock.symbol ? { symbol: stock.symbol } : {}),
      ...(typeof stock.changePct === "number" ? { changePct: stock.changePct } : {}),
    })),
  };
}

export function StockIssueCard({ item }: { item: Extract<FeedHubItem, { type: "stock-issue" }> }) {
  const issue = item.stockIssue;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="font-pixel text-[10px] uppercase tracking-wide text-muted">
          STOCK ISSUE · {issue.country === "US" ? "미국" : "국내"}
        </span>
        <p className="mt-2 text-base font-bold leading-6 text-whiteout">{issue.stock}</p>
        <p className="mt-1 text-sm leading-5 text-muted">{issue.headline}</p>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: valueTone(issue.changePct) }}>
        {typeof issue.changePct === "number" ? `${issue.changePct > 0 ? "+" : ""}${issue.changePct.toFixed(2)}%` : ""}
      </span>
    </div>
  );
}

export function FeedView() {
  const [items, setItems] = useState<FeedHubItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<FeedHubItem | null>(null);
  const [narrative, setNarrative] = useState<DeckNarrative | null>(null);

  useEffect(() => {
    let alive = true;
    fetchFeedHub()
      .then((d) => alive && setItems(d.items))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="mt-16 px-8 text-center text-sm leading-6 text-muted">
        오늘 피드를 불러오지 못했어요. 잠시 후 다시 열어주세요.
      </div>
    );
  }
  if (!items) {
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  }
  if (items.length === 0) {
    return (
      <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout">
        오늘은 콘텐츠가 잠깐 비었어요.
        <br />
        조용한 날도 있는 거예요.
      </div>
    );
  }

  const cardShell =
    "block w-full rounded-2xl border border-hairline bg-surface px-5 py-5 text-left transition-colors hover:border-whiteout/20";

  return (
    <div className="space-y-3 pb-4">
      {items.map((item) => {
        if (item.type === "narrative") {
          return (
            <button key={item.narrative.id} type="button" onClick={() => setNarrative(item.narrative)} className={cardShell}>
              <NarrativeCard card={item.narrative} />
            </button>
          );
        }
        if (item.type === "sector") {
          return (
            <button key={item.sector.id} type="button" onClick={() => setSelected(item)} className={cardShell}>
              <SectorCard card={sectorCardData(item)} />
            </button>
          );
        }
        if (item.type === "stock-issue") {
          return (
            <button key={item.stockIssue.id} type="button" onClick={() => setSelected(item)} className={cardShell}>
              <StockIssueCard item={item} />
            </button>
          );
        }
        return (
          <button key={item.content.id} type="button" onClick={() => setSelected(item)} className={cardShell}>
            <ContentCard card={item.content} />
          </button>
        );
      })}

      {narrative && <NarrativeDepthPage card={narrative} onClose={() => setNarrative(null)} />}
      {selected && <FeedDepthPage item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** 메인 덱 필터(WO-GNB) — daily-30 카드에서 종목 카드만. 콘텐츠·섹터·내러티브는 피드(feed-hub) 소관. */
export function stockOnlyDeckCards(cards: readonly DeckCard[]): DeckCard[] {
  return cards.filter((card) => card.type === "stock");
}

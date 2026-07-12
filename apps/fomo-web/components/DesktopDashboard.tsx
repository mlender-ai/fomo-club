"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardVerdict } from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { ContentCard } from "@/components/ContentCard";
import { NarrativeCard } from "@/components/NarrativeCard";
import { NarrativeDepthPage } from "@/components/NarrativeDepthPage";
import { PerformanceProofPanel } from "@/components/PerformanceProofPanel";
import { RegretReceiptPanel } from "@/components/RegretReceiptPanel";
import { FlickerSpinner } from "@/components/FlickerSpinner";
import { fetchDaily30, fetchFeedHub, type Daily30Response, type FeedHubItem } from "@/lib/fomoApi";
import { stockDeckCards, type DeckCard, type DeckStock, type DiscoveryDeckCard } from "@/lib/discoveryDeck";
import { getDiscoverySeen } from "@/lib/discoveryPerformance";
import type { FrontEntry } from "@/components/StockSwipeDeck";
import { FeedDepthPage } from "@/components/FeedDepthPage";
import { SectorCard } from "@/components/SectorCard";
import { StockIssueCard, sectorCardData } from "@/components/FeedView";

/**
 * PC(≥1024px) 3컬럼 대시보드 — WO-PC-VERSION.
 * 좌=오늘의 30장 리스트(태그 필터), 중앙=선택 종목 뎁스(StockInsightView inline), 우=콘텐츠·시장·성과.
 * 새 API 없음 — daily-30·기존 컴포넌트 재배치만. 모바일 UI(틴더 덱)는 HomeView 분기에서 불변.
 */

const NEON = "#D8FF3A";

/** CSS 브레이크포인트(lg=1024px) 감지 — UA 스니핑 아님, Tailwind lg 와 동일 기준. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

type FilterTag = "all" | "kr" | "us" | "coin" | "macro";

// 좌 리스트는 종목 전용(WO-GNB) — 매크로는 우측 콘텐츠 컬럼 소관이라 필터에서 뺀다.
const FILTER_TABS: Array<{ key: FilterTag; label: string }> = [
  { key: "all", label: "전체" },
  { key: "kr", label: "국장" },
  { key: "us", label: "미장" },
  { key: "coin", label: "코인" },
];

/** 카드 → 필터 태그 분류(daily-30 assetClass 규칙과 동일 기준, 클라 재계산). */
function cardTag(card: DeckCard): FilterTag {
  if (card.type === "content") {
    return card.data.contentType === "whale" || card.data.scope === "global" ? "coin" : "macro";
  }
  if (card.type === "narrative") return card.data.scope === "US" ? "us" : "kr";
  if (card.type === "sector") return "kr";
  const stock = card.data;
  if (stock.market === "COIN") return "coin";
  return stock.country === "US" ? "us" : "kr";
}

const STANCE_BADGE: Record<CardVerdict["stance"], { label: string; color: string }> = {
  enter: { label: "진입 검토", color: NEON },
  watch: { label: "관망", color: "#C9C9C4" },
  avoid: { label: "회피", color: "#8A8A86" },
};

function cardId(card: DeckCard): string {
  if (card.type === "stock") return `stock:${card.data.canonical}`;
  return `${card.type}:${card.data.id}`;
}

/** 좌측 리스트 한 줄 — 모바일 카드의 축약형(종목·훅·판단 뱃지). */
function CardListRow({
  card,
  front,
  active,
  onSelect,
}: {
  card: DeckCard;
  front: FrontEntry | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const verdict = front?.verdict;
  const badge = verdict ? STANCE_BADGE[verdict.stance] : undefined;
  const title =
    card.type === "stock" ? card.data.canonical : card.type === "sector" ? `${card.data.sector} 섹터` : card.data.headline;
  const hook = card.type === "stock" ? card.data.headline ?? card.data.reason : card.type === "content" ? card.data.facts[0]?.label : undefined;
  const kicker =
    card.type === "stock"
      ? [card.data.market, front?.priceText].filter(Boolean).join(" · ")
      : card.type === "content"
        ? "MARKET NOTE"
        : card.type === "narrative"
          ? "STORY"
          : "SECTOR";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="w-full rounded-xl border px-3.5 py-3 text-left transition-colors"
      style={{
        borderColor: active ? NEON : "var(--hairline, #2a2a2a)",
        backgroundColor: active ? "rgba(216,255,58,0.06)" : "rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-bold text-whiteout">{title}</span>
        {badge && (
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold"
            style={{ borderColor: badge.color, color: badge.color }}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{kicker}</div>
      {hook && (
        <p className="mt-1 truncate text-xs leading-5 text-muted">{hook}</p>
      )}
    </button>
  );
}

export function DesktopDashboard() {
  const [daily, setDaily] = useState<Daily30Response | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<FilterTag>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 우측 컬럼(feed-hub) 항목 선택 — 중앙에 해당 뎁스 렌더(WO 피드 통합 §3: 막다른 클릭 0).
  const [feedItem, setFeedItem] = useState<FeedHubItem | null>(null);
  const [feedItems, setFeedItems] = useState<FeedHubItem[]>([]);
  const [seenItems] = useState(() => getDiscoverySeen());

  useEffect(() => {
    let alive = true;
    fetchDaily30()
      .then((d) => alive && setDaily(d))
      .catch(() => alive && setFailed(true));
    fetchFeedHub()
      .then((d) => alive && setFeedItems(d.items))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const allCards = useMemo<DeckCard[]>(() => {
    if (!daily) return [];
    const raw = ((daily.cards?.length ? daily.cards : daily.stocks) ?? []) as DiscoveryDeckCard[];
    return stockDeckCards(raw);
  }, [daily]);

  // 좌 리스트 = 종목 30장(WO-GNB 메인과 동일). 우 컬럼 = 콘텐츠·내러티브(피드와 동일 소스).
  const cards = useMemo(() => allCards.filter((card) => card.type === "stock").slice(0, 30), [allCards]);

  const fronts = (daily?.fronts ?? {}) as Record<string, FrontEntry>;
  const filtered = useMemo(
    () => (filter === "all" ? cards : cards.filter((card) => cardTag(card) === filter)),
    [cards, filter]
  );
  const contentCards = allCards.filter((card): card is Extract<DeckCard, { type: "content" }> => card.type === "content");
  const narrativeCards = allCards.filter((card): card is Extract<DeckCard, { type: "narrative" }> => card.type === "narrative");
  const selectableCards = useMemo(() => [...filtered, ...narrativeCards], [filtered, narrativeCards]);

  // 첫 진입 — 1번 카드 뎁스 자동 표시(빈 화면 금지). 필터로 목록이 바뀌어 선택이 사라지면 첫 항목로.
  useEffect(() => {
    if (filtered.length === 0) return;
    if (selectedId && selectableCards.some((card) => cardId(card) === selectedId)) return;
    setSelectedId(cardId(filtered[0]!));
  }, [filtered, selectableCards, selectedId]);

  const selected = selectableCards.find((card) => cardId(card) === selectedId) ?? filtered[0];

  const depthContext = (stock: DeckStock) => ({
    fromTheme: stock.sector,
    ...(stock.reason ?? stock.whyShown ? { reason: stock.reason ?? stock.whyShown } : {}),
    ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
    ...(stock.sourceUrl ? { sourceUrl: stock.sourceUrl } : {}),
    ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
    ...(stock.symbol ? { symbol: stock.symbol } : {}),
    market: stock.market,
    country: stock.country,
    ...(fronts[stock.canonical] ? { frontSeed: fronts[stock.canonical] } : {}),
  });

  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        오늘의 30장을 불러오지 못했어요. 새로고침해 주세요.
      </div>
    );
  }
  if (!daily) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <FlickerSpinner size={36} />
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_340px] gap-4">
      {/* ① 좌 — 오늘의 30장 리스트 + 태그 필터 */}
      <section className="flex min-h-0 flex-col rounded-2xl border border-hairline bg-surface">
        <div className="border-b border-hairline px-4 py-3">
          <p className="font-pixel text-sm text-whiteout">오늘의 30장</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="tablist" aria-label="시장 필터">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.key)}
                  className="rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: active ? NEON : "var(--hairline, #2a2a2a)",
                    color: active ? "#0a0a0a" : "#8a8a8a",
                    backgroundColor: active ? NEON : "transparent",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {filtered.map((card) => (
            <CardListRow
              key={cardId(card)}
              card={card}
              front={card.type === "stock" ? fronts[card.data.canonical] : undefined}
              active={cardId(card) === selectedId}
              onSelect={() => setSelectedId(cardId(card))}
            />
          ))}
          {filtered.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-muted">이 필터에 해당하는 카드가 오늘은 없어요.</p>
          )}
        </div>
      </section>

      {/* ② 중앙 — 선택 카드 뎁스(병렬 보기 = PC 핵심 가치). 우측 항목 클릭 시 해당 뎁스가 우선. */}
      <section className="min-h-0 overflow-hidden rounded-2xl border border-hairline bg-surface">
        {feedItem?.type === "narrative" ? (
          <NarrativeDepthPage key={feedItem.narrative.id} card={feedItem.narrative} onClose={() => setFeedItem(null)} inline />
        ) : feedItem ? (
          <FeedDepthPage key={feedItemId(feedItem)} item={feedItem} onClose={() => setFeedItem(null)} inline />
        ) : selected?.type === "stock" ? (
          <StockInsightView
            key={selected.data.canonical}
            stock={selected.data.canonical}
            context={depthContext(selected.data)}
            onClose={() => undefined}
            inline
          />
        ) : selected?.type === "narrative" ? (
          <NarrativeDepthPage key={selected.data.id} card={selected.data} onClose={() => filtered[0] && setSelectedId(cardId(filtered[0]))} inline />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">종목을 선택해 주세요.</div>
        )}
      </section>

      {/* ③ 우 — feed-hub(피드 탭과 동일 소스·이원화 금지) + 성과 되짚기. 클릭 → 중앙 뎁스. */}
      <section className="scrollbar-none min-h-0 space-y-3 overflow-y-auto">
        {(feedItems.length > 0 ? feedItems : []).slice(0, 8).map((item) => {
          const id = feedItemId(item);
          const active = feedItem ? feedItemId(feedItem) === id : false;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFeedItem(item)}
              aria-pressed={active}
              className="block w-full rounded-2xl border bg-surface px-5 py-5 text-left transition-colors hover:border-whiteout/20"
              style={{ borderColor: active ? NEON : "var(--hairline, #2a2a2a)" }}
            >
              {item.type === "narrative" ? (
                <NarrativeCard card={item.narrative} />
              ) : item.type === "sector" ? (
                <SectorCard card={sectorCardData(item)} />
              ) : item.type === "stock-issue" ? (
                <StockIssueCard item={item} />
              ) : (
                <ContentCard card={item.content} />
              )}
            </button>
          );
        })}
        {feedItems.length === 0 &&
          contentCards.slice(0, 4).map((card) => (
            <div key={card.data.id} className="rounded-2xl border border-hairline bg-surface px-5 py-5">
              <ContentCard card={card.data} />
            </div>
          ))}
        {feedItems.length === 0 &&
          narrativeCards.slice(0, 2).map((card) => (
            <button
              key={card.data.id}
              type="button"
              onClick={() => setSelectedId(cardId(card))}
              aria-pressed={cardId(card) === selectedId}
              className="block w-full rounded-2xl border bg-surface px-5 py-5 text-left transition-colors hover:border-whiteout/20"
              style={{ borderColor: cardId(card) === selectedId ? NEON : "var(--hairline, #2a2a2a)" }}
            >
              <NarrativeCard card={card.data} />
            </button>
          ))}
        <div className="rounded-2xl border border-hairline bg-surface px-4 py-4">
          <RegretReceiptPanel items={seenItems} />
          <PerformanceProofPanel items={seenItems} />
        </div>
      </section>
    </div>
  );
}

function feedItemId(item: FeedHubItem): string {
  if (item.type === "narrative") return item.narrative.id;
  if (item.type === "sector") return item.sector.id;
  if (item.type === "stock-issue") return item.stockIssue.id;
  return item.content.id;
}

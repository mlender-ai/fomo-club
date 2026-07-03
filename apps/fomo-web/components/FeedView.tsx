"use client";

import { useEffect, useMemo, useState } from "react";
import { ContentCard } from "@/components/ContentCard";
import { NarrativeCard } from "@/components/NarrativeCard";
import { NarrativeDepthPage } from "@/components/NarrativeDepthPage";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { fetchDaily30, type Daily30Response } from "@/lib/fomoApi";
import { stockDeckCards, type DeckCard, type DeckContent, type DeckNarrative, type DiscoveryDeckCard } from "@/lib/discoveryDeck";

/**
 * 피드 표면(WO-GNB-TWO-SURFACES ②) — 콘텐츠 전용 세로 스크롤.
 * 소스 = daily-30(메인 덱·PC 우측 컬럼과 동일 — 이원화 금지). 종목 카드는 제외, 콘텐츠만 모은다.
 * 내러티브 = 사건→스토리 뎁스→종목 뎁스, 매크로/지수/고래 = 사실 카드.
 */

/** 피드에 담기는 콘텐츠 카드(내러티브·매크로/지수/고래). 종목·섹터 카드는 메인 덱 소관. */
type FeedItem =
  | { type: "narrative"; data: DeckNarrative }
  | { type: "content"; data: DeckContent };

function feedItemsFromDaily30(discovery: Daily30Response): FeedItem[] {
  const raw = ((discovery.cards?.length ? discovery.cards : discovery.stocks) ?? []) as DiscoveryDeckCard[];
  // daily-30 cards 순서 = quietScore 랭킹 = 중요도순. 그 순서를 보존하며 콘텐츠만 추린다.
  const items: FeedItem[] = [];
  for (const card of stockDeckCards(raw)) {
    if (card.type === "narrative") items.push({ type: "narrative", data: card.data });
    else if (card.type === "content") items.push({ type: "content", data: card.data });
  }
  return items;
}

export function FeedView() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<DeckNarrative | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDaily30()
      .then((d) => alive && setItems(feedItemsFromDaily30(d)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const content = useMemo(() => items ?? [], [items]);

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
  if (content.length === 0) {
    return (
      <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout">
        오늘은 콘텐츠가 잠깐 비었어요.
        <br />
        조용한 날도 있는 거예요.
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      {content.map((item) => {
        if (item.type === "narrative") {
          return (
            <button
              key={item.data.id}
              type="button"
              onClick={() => setSelected(item.data)}
              className="block w-full rounded-2xl border border-hairline bg-surface px-5 py-5 text-left transition-colors hover:border-whiteout/20"
            >
              <NarrativeCard card={item.data} />
            </button>
          );
        }
        return (
          <div key={item.data.id} className="rounded-2xl border border-hairline bg-surface px-5 py-5">
            <ContentCard card={item.data} />
          </div>
        );
      })}

      {selected && <NarrativeDepthPage card={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** 메인 덱 필터(WO-GNB) — daily-30 카드에서 종목 카드만. 콘텐츠·섹터·내러티브는 피드로 이관. */
export function stockOnlyDeckCards(cards: readonly DeckCard[]): DeckCard[] {
  return cards.filter((card) => card.type === "stock");
}

"use client";

import { useEffect, useState } from "react";
import { StockSwipeDeck } from "@/components/StockSwipeDeck";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { fetchDaily30, fetchJudgmentReview, fetchMyRequests, fetchTrackRecord, type Daily30Response, type MyRequestRow, type TrackMetric } from "@/lib/fomoApi";
import { stockDeckCards, type DeckCard, type DeckStock, type DiscoveryDeckCard } from "@/lib/discoveryDeck";
import { stockOnlyDeckCards } from "@/components/FeedView";
import { getSessionId } from "@/lib/session";
import { prioritizeStrongSignalCards } from "@/lib/judgmentReview";
import type { FrontEntry } from "@/components/StockSwipeDeck";

interface UnifiedDailyDeckProps {
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

/**
 * 무로그인 대기함(WO 검색 요청→다음날 카드) — 확인한 요청은 다시 맨 앞에 고정하지 않는다(1회 노출).
 * localStorage 귀속 = 요청과 같은 기기에서만 의미(무로그인 원칙, 기기 변경 시 유실은 요청 시 안내).
 */
const REQUEST_ACK_KEY = "fomo_request_ack";

function readRequestAcks(): Record<string, true> {
  try {
    return JSON.parse(window.localStorage.getItem(REQUEST_ACK_KEY) ?? "{}") as Record<string, true>;
  } catch {
    return {};
  }
}

function ackRequests(queries: string[]): void {
  try {
    const acks = readRequestAcks();
    for (const q of queries) acks[q] = true;
    window.localStorage.setItem(REQUEST_ACK_KEY, JSON.stringify(acks));
  } catch {
    // 저장 실패는 치명 아님 — 다음 방문에 한 번 더 보일 뿐
  }
}

/** ready 요청 → 덱 맨 앞 고정 카드(1회). StockSwipeDeck 이 lazy hydrate 로 가격·차트·verdict 를 채운다. */
function requestDeckCard(row: MyRequestRow): DeckStock | null {
  const r = row.resolved;
  if (!r) return null;
  return {
    kind: "stock",
    canonical: r.canonical,
    market: r.market as DeckStock["market"],
    country: r.country,
    marquee: false,
    sector: r.sector ?? (r.market === "COIN" ? "코인" : r.country === "US" ? "미국주식" : "기타 업종"),
    ...(r.naverCode ? { naverCode: r.naverCode } : {}),
    ...(r.country !== "KR" ? { symbol: r.symbol } : {}),
    headline: "어제 요청하신 종목이에요 — 카드로 준비했어요.",
    whyShown: `"${row.query}" 검색 요청으로 만들어진 카드예요.`,
    reason: `"${row.query}" 검색 요청으로 만들어진 카드예요.`,
    insightTag: "내 요청",
  };
}

const RETRY_DELAYS_MS = [1_200, 2_400] as const;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function Daily30Empty({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout" role="status">
      <p>
        오늘의 30장을 불러오지 못했어요.
        <br />
        다시 불러오는 중이에요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full border border-hairline bg-surface px-5 py-2 text-xs font-semibold text-whiteout transition-colors hover:border-whiteout/30"
      >
        지금 다시 불러오기
      </button>
    </div>
  );
}

function cardsFromDaily30(discovery: Daily30Response, strongSignalCodes: readonly string[] = []): { cards: DeckCard[]; fronts: Record<string, FrontEntry> } {
  const rawCards = ((discovery.cards?.length ? discovery.cards : discovery.stocks) ?? []) as DiscoveryDeckCard[];
  const metaById = new Map((discovery.meta?.cards ?? []).map((card) => [card.id, card]));
  const fronts = Object.fromEntries(Object.entries(discovery.fronts).map(([canonical, front]) => {
    const stock = discovery.stocks.find((item) => item.canonical === canonical);
    if (!stock) return [canonical, front as FrontEntry];
    const id = `stock:${stock.country}:${stock.symbol ?? stock.naverCode ?? stock.canonical}:${stock.canonical}`;
    const signalTypes = metaById.get(id)?.signalTypes;
    return [canonical, { ...front, ...(signalTypes?.length ? { signalTypes } : {}) } as FrontEntry];
  }));
  // 메인 덱 = 종목 발굴 전용(WO-GNB). 콘텐츠·내러티브는 피드 표면으로 이관.
  const cards = stockOnlyDeckCards(stockDeckCards(rawCards)).slice(0, 30);
  return { cards: prioritizeStrongSignalCards(cards, fronts, strongSignalCodes), fronts };
}

export function UnifiedDailyDeck({ loggedIn = true, onRequireLogin }: UnifiedDailyDeckProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | {
        kind: "ready";
        cards: DeckCard[];
        fronts: Record<string, FrontEntry>;
        strongSignalCodes: string[];
        stale?: "committee-yesterday" | "engine-direct";
      }
  >({ kind: "loading" });
  // 무로그인 대기함 배너 — ready N개 / not_found 안내(각 1회).
  const [requestBanner, setRequestBanner] = useState<{ ready: number; notFound: string[] } | null>(null);
  const [signalHistory30, setSignalHistory30] = useState<Record<string, TrackMetric>>({});

  useEffect(() => {
    let alive = true;
    void fetchTrackRecord()
      .then((record) => {
        if (alive) setSignalHistory30(record.signalHistory30);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    (async () => {
      // 내 요청(익명 deviceId=sessionId) — 실패해도 덱은 정상(fail-open).
      const myRequests = await fetchMyRequests(getSessionId())
        .then((d) => d.requests)
        .catch((): MyRequestRow[] => []);
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const [discovery, review] = await Promise.all([
            fetchDaily30(),
            fetchJudgmentReview().catch(() => null),
          ]);
          if (!alive) return;
          const strongSignalCodes = review?.strongSignals.map((signal) => signal.code) ?? [];
          const next = cardsFromDaily30(discovery, strongSignalCodes);
          if (next.cards.length === 0) {
            setState({ kind: "error" });
            return;
          }
          // 재방문 전달(알림 대체) — ready 요청 카드를 덱 맨 앞에 1회 고정, not_found 는 1회 안내.
          const acks = readRequestAcks();
          const fresh = myRequests.filter((row) => !acks[row.query]);
          const readyRows = fresh.filter((row) => row.status === "fulfilled" && row.resolved);
          const notFoundRows = fresh.filter((row) => row.status === "not-found");
          const inDeck = new Set(next.cards.map((card) => (card.type === "stock" ? card.data.canonical : "")));
          const requestCards: DeckCard[] = readyRows
            .map(requestDeckCard)
            .filter((card): card is DeckStock => card !== null && !inDeck.has(card.canonical))
            .map((data) => ({ type: "stock" as const, data }));
          if (requestCards.length > 0 || notFoundRows.length > 0) {
            setRequestBanner({ ready: readyRows.length, notFound: notFoundRows.map((row) => row.query) });
            ackRequests([...readyRows, ...notFoundRows].map((row) => row.query));
          }
          setState({
            kind: "ready",
            cards: [...requestCards, ...next.cards],
            fronts: next.fronts,
            strongSignalCodes,
            ...(discovery.meta?.stale ? { stale: discovery.meta.stale } : {}),
          });
          return;
        } catch (err) {
          lastError = err;
          if (attempt < RETRY_DELAYS_MS.length) {
            await wait(RETRY_DELAYS_MS[attempt] ?? 0);
            if (!alive) return;
          }
        }
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn("[UnifiedDailyDeck] fetch failed", lastError);
      }
      if (alive) setState({ kind: "error" });
    })();
    return () => {
      alive = false;
    };
  }, [retryKey]);

  useEffect(() => {
    if (state.kind !== "error") return;
    const retry = window.setTimeout(() => setRetryKey((value) => value + 1), 3_500);
    return () => window.clearTimeout(retry);
  }, [state.kind]);

  if (state.kind === "loading") {
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  }
  if (state.kind === "error") {
    return <Daily30Empty onRetry={() => setRetryKey((value) => value + 1)} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {state.stale && (
        <p className="mb-2 shrink-0 px-1 text-[11px] leading-4 text-muted" role="status">
          {state.stale === "committee-yesterday"
            ? "어제 기준 카드예요 · 갱신 중"
            : "검수 갱신 중인 카드예요"}
        </p>
      )}
      {requestBanner && (
        <div className="mb-2 shrink-0 rounded-xl border border-hairline px-3.5 py-2" style={{ backgroundColor: "rgba(216,255,58,0.10)" }}>
          <p className="text-xs leading-5 text-whiteout">
            {requestBanner.ready > 0 && (
              <>
                요청하신 카드 <span className="font-bold" style={{ color: "#D8FF3A" }}>{requestBanner.ready}개</span>가 준비됐어요 — 맨 앞에서 기다려요.
              </>
            )}
            {requestBanner.ready > 0 && requestBanner.notFound.length > 0 && <br />}
            {requestBanner.notFound.length > 0 && (
              <span className="text-muted">&ldquo;{requestBanner.notFound.join(", ")}&rdquo;는 찾지 못했어요 — 티커나 이름을 다시 확인해 주세요.</span>
            )}
          </p>
        </div>
      )}
      <StockSwipeDeck
        cards={state.cards}
        initialFronts={state.fronts}
        contextLabel="오늘의 30장"
        loggedIn={loggedIn}
        onRequireLogin={onRequireLogin}
        signalHistory30={signalHistory30}
        strongSignalCodes={state.strongSignalCodes}
      />
    </div>
  );
}

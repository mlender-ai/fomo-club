"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  scoreToColor,
  scoreToEmoji,
  SECTORS,
  type KeywordCard,
  type KeywordConfidence,
  type StockSector,
  type SurpriseStock,
} from "@fomo/core";
import { KeywordDepthPage, StockInsightView } from "@/components/KeywordDepthPage";
import { SectorStockDeck } from "@/components/SectorStockDeck";
import { fetchKeywords, fetchThemeInsight, recordTaste } from "@/lib/fomoApi";
import { recordInterest } from "@/lib/keywordInterest";
import { recordViewed, getHistory } from "@/lib/keywordHistory";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";

/**
 * 키워드 카드 덱 — 섹터(키워드) 카드 + 그 사이에 "주목해볼만한 종목" 카드를 끼워 보여준다.
 * KEYWORD_CARD_FEED_DEV_SPEC v3. 오른쪽=관심 / 왼쪽=덜관심. 탭/관심 → 자세히(뎁스).
 * 섹터 카드는 테마 뎁스, 종목 카드는 종목 뎁스(stock-insight)로 연결.
 */
const THRESHOLD = 90;
const EXIT_MS = 320;
const UP = "#FF5A36";

/** 덱 한 장 — 섹터 카드 또는 종목 카드. */
type DeckItem =
  | { kind: "sector"; id: string; card: KeywordCard }
  | { kind: "stock"; id: string; stock: SurpriseStock; fromKeyword: string };

/** 섹터 카드 뒤에 그 섹터의 주목 종목 카드를 끼운다(있을 때만). */
function toDeckItems(cards: readonly KeywordCard[]): DeckItem[] {
  const out: DeckItem[] = [];
  for (const card of cards) {
    out.push({ kind: "sector", id: card.id, card });
    if (card.surpriseStock) {
      out.push({
        kind: "stock",
        id: `stock:${card.keyword}:${card.surpriseStock.canonical}`,
        stock: card.surpriseStock,
        fromKeyword: card.keyword,
      });
    }
  }
  return out;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** 섹터(키워드) 카드 앞면. */
function SectorFace({ card, progress }: { card: KeywordCard; progress?: string }) {
  const color = scoreToColor(card.fomoScore);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-whiteout">{card.keyword}</span>
        <span className="text-xl" aria-hidden>{card.emoji}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-pixel text-5xl leading-none" style={{ color }}>
          {card.fomoScore}
        </span>
        <span className="font-pixel text-sm text-muted">{scoreToEmoji(card.fomoScore)} 포모 점수</span>
      </div>
      <p className="mt-6 text-lg leading-8 text-whiteout">{card.comment}</p>
      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="font-pixel text-[11px] text-muted">{progress}</span>}
      </div>
    </div>
  );
}

/** 종목 카드 앞면 — 섹터 카드와 같은 틀. 카피는 임시(광혁 조정). */
function StockFace({
  stock,
  fromKeyword,
  progress,
}: {
  stock: SurpriseStock;
  fromKeyword: string;
  progress?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-whiteout">{stock.canonical}</span>
        <span className="text-xl" aria-hidden>💡</span>
      </div>
      <p className="mt-3 font-pixel text-sm" style={{ color: UP }}>
        주목해볼만한 종목
      </p>
      <p className="mt-6 text-lg leading-8 text-whiteout">
        ‘{fromKeyword}’ 흐름에서 대장주 말고 같이 움직인 종목이에요.
        <br />
        왜 같이 떴는지 한번 볼까요?
      </p>
      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="font-pixel text-[11px] text-muted">{progress}</span>}
      </div>
    </div>
  );
}

function FaceOf({ item, progress }: { item: DeckItem; progress?: string }) {
  const p = progress !== undefined ? { progress } : {};
  return item.kind === "sector" ? (
    <SectorFace card={item.card} {...p} />
  ) : (
    <StockFace stock={item.stock} fromKeyword={item.fromKeyword} {...p} />
  );
}

/** 카드 좌측 색 띠 — 섹터는 포모색, 종목은 강조색. */
function colorOf(item: DeckItem): string {
  return item.kind === "sector" ? scoreToColor(item.card.fomoScore) : UP;
}

/** 덱 한 장 → 취향 적재용 (subjectType, subject). 섹터=테마(키워드), 종목=종목명. */
function tasteOf(item: DeckItem): { type: "theme" | "stock"; subject: string } {
  return item.kind === "sector"
    ? { type: "theme", subject: item.card.keyword }
    : { type: "stock", subject: item.stock.canonical };
}

/** 담담한 빈 상태(수집 실패/데이터 없음) — 무한 로딩 금지. */
function DeckEmpty() {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 px-8 text-center">
      <p className="text-sm leading-6 text-whiteout">
        오늘은 보여줄 게 잠깐 비었어요.
        <br />
        조용한 날도 있는 거예요. 이따 다시 와주세요.
      </p>
    </div>
  );
}

/**
 * 데이터 로딩 래퍼 — /api/fomo/keywords 실데이터를 받아 덱에 넘긴다.
 * 로딩=전체화면 프로그레스, 실패=담담한 빈 상태(무한 로딩 금지). confidence 는 덱 상단 한마디로.
 */
/** 카드 클릭 → 로그인 게이트(트랙 B). 비로그인 시 뎁스 대신 로그인 페이지로 보낸다. */
interface FeedGate {
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

/**
 * 섹터 카테고리 칩 네비(SECTOR_STRUCTURE §1) — "오늘"(쏠림 피드) + 섹터들.
 * 비주얼(칩 디자인·국기 등)은 광혁 — 여기선 구조/선택 동작만(§4).
 */
function SectorChips({
  active,
  onSelect,
}: {
  active: StockSector | null;
  onSelect: (s: StockSector | null) => void;
}) {
  const chip = (label: string, value: StockSector | null) => {
    const on = active === value;
    return (
      <button
        key={label}
        onClick={() => onSelect(value)}
        className={`shrink-0 rounded-full border px-3 py-1 font-pixel text-xs transition-colors ${
          on ? "border-transparent bg-whiteout text-black" : "border-hairline text-muted hover:text-whiteout"
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
      {chip("오늘", null)}
      {SECTORS.map((s) => chip(s, s))}
    </div>
  );
}

export function KeywordCardFeed({ loggedIn, onRequireLogin }: FeedGate = {}) {
  // 섹터 네비: null = "오늘"(기존 쏠림 피드, 무변경). 섹터 선택 시 그 섹터 종목 무한 스와이프.
  const [activeSector, setActiveSector] = useState<StockSector | null>(null);
  return (
    <div className="w-full">
      <SectorChips active={activeSector} onSelect={setActiveSector} />
      {activeSector === null ? (
        <TodayFeed loggedIn={loggedIn} onRequireLogin={onRequireLogin} />
      ) : (
        <SectorStockDeck
          key={activeSector}
          sector={activeSector}
          loggedIn={loggedIn}
          onRequireLogin={onRequireLogin}
        />
      )}
    </div>
  );
}

/** "오늘" 탭 — 기존 쏠림(키워드) 피드(무변경). */
function TodayFeed({ loggedIn, onRequireLogin }: FeedGate) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; cards: readonly KeywordCard[]; confidence: KeywordConfidence }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetchKeywords()
      .then((res) => {
        if (!alive) return;
        if (!res.cards || res.cards.length === 0) setState({ kind: "error" });
        else setState({ kind: "ready", cards: res.cards, confidence: res.confidence });
      })
      .catch((err) => {
        console.warn("[KeywordCardFeed] fetch failed", err);
        if (alive) setState({ kind: "error" });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === "loading")
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  if (state.kind === "error") return <DeckEmpty />;
  return <KeywordDeck cards={state.cards} loggedIn={loggedIn} onRequireLogin={onRequireLogin} />;
}

function KeywordDeck({
  cards,
  loggedIn,
  onRequireLogin,
}: { cards: readonly KeywordCard[] } & FeedGate) {
  // 마운트 시점의 "오늘 이미 본" 집합 — 본 섹터 카드는 덱에서 제외(종목 카드는 섹터를 따라간다).
  const viewedIds = useState(() => {
    const kstDay = (ms: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(ms));
    const today = kstDay(Date.now());
    return new Set(getHistory().filter((h) => kstDay(h.ts) === today).map((h) => h.id));
  })[0];
  const [replay, setReplay] = useState(false);
  const sectorCards = replay ? [...cards] : cards.filter((c) => !viewedIds.has(c.id));
  const deck = toDeckItems(sectorCards);

  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<DeckItem | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  // 뎁스 프리페치 — 보이는 섹터 카드의 theme-insight 를 백그라운드로 미리 데운다(350ms 머문 것만, 중복 제거).
  const prefetched = useRef(new Set<string>());
  useEffect(() => {
    const top = deck[idx];
    if (!top || top.kind !== "sector" || prefetched.current.has(top.card.keyword)) return;
    const t = window.setTimeout(() => {
      prefetched.current.add(top.card.keyword);
      fetchThemeInsight(top.card.keyword).catch(() => prefetched.current.delete(top.card.keyword));
    }, 350);
    return () => window.clearTimeout(t);
  }, [deck, idx]);

  const flingNext = useCallback((dir: "left" | "right") => {
    if (prefersReducedMotion()) {
      setDx(0);
      setIdx((i) => i + 1);
      return;
    }
    setExiting(dir);
    window.setTimeout(() => {
      setExiting(null);
      setDx(0);
      setIdx((i) => i + 1);
    }, EXIT_MS);
  }, []);

  const advance = useCallback(
    (dir: "left" | "right") => {
      const item = deck[idx];
      if (item) {
        recordInterest(item.id, dir === "right" ? "more" : "less", Date.now());
        const t = tasteOf(item);
        recordTaste(t.type, t.subject, dir === "right" ? "more" : "less"); // 트랙 B: 서버 적재
        if (item.kind === "sector") recordViewed(item.card, Date.now()); // 종목 카드는 섹터를 따라가므로 별도 기록 X
      }
      flingNext(dir);
    },
    [deck, idx, flingNext]
  );

  const openItem = (item: DeckItem) => {
    // 카드 클릭 → 비로그인이면 뎁스 대신 로그인 페이지로(트랙 B 게이트).
    if (!loggedIn && onRequireLogin) {
      onRequireLogin();
      return;
    }
    if (item.kind === "sector") recordViewed(item.card, Date.now());
    const t = tasteOf(item);
    recordTaste(t.type, t.subject, "view_depth"); // 트랙 B: 뎁스 열람 = 강한 관심
    setSelected(item);
  };
  // CTA "관심" — "이거 더 볼래" → 관심 기록 + 자세히. 다음 카드 넘김은 닫을 때.
  const openInterest = (item: DeckItem) => {
    if (!loggedIn && onRequireLogin) {
      onRequireLogin();
      return;
    }
    recordInterest(item.id, "more", Date.now());
    const t = tasteOf(item);
    recordTaste(t.type, t.subject, "more"); // 트랙 B: 명시적 관심
    openItem(item);
  };
  const closeDepth = () => {
    setSelected(null);
    window.setTimeout(() => flingNext("left"), 40);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = e.clientX - startX.current;
    if (Math.abs(d) > 6) moved.current = true;
    setDx(d);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx > THRESHOLD) advance("right");
    else if (dx < -THRESHOLD) advance("left");
    else setDx(0);
  };

  if (idx >= deck.length) {
    return (
      <div className="mt-16 flex flex-col items-center gap-4 px-8 text-center">
        <p className="text-sm leading-6 text-whiteout">
          오늘 사람들 시선은 여기까지였어요.
          <br />
          내일은 또 어디로 쏠릴지 같이 봐요.
        </p>
        <button
          onClick={() => {
            setReplay(true);
            setIdx(0);
          }}
          className="rounded-full border border-hairline px-4 py-2 font-pixel text-xs text-muted transition-colors hover:text-whiteout"
        >
          처음부터 다시
        </button>
        <p className="mt-2 text-[11px] leading-5 text-muted">
          FOMO Index는 감정 체감 지표예요. 투자 조언이 아니에요.
          <br />
          도박문제로 힘들 땐 <span className="text-whiteout">1336</span>(한국도박문제예방치유원) 무료 상담.
        </p>
      </div>
    );
  }

  const top = deck[idx]!;
  const color = colorOf(top);
  const topTransform = exiting
    ? `translateX(${exiting === "right" ? 140 : -140}%) rotate(${exiting === "right" ? 16 : -16}deg)`
    : `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
  const topTransition = dragging.current ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.22,1,0.36,1)`;
  const behind = [deck[idx + 1], deck[idx + 2]].filter(Boolean) as DeckItem[];

  return (
    <div className="w-full">
      {/* 카드 스택 (뒤 카드 실제 콘텐츠 노출) */}
      <div className="relative mx-auto h-[56vh] w-full select-none">
        {behind
          .map((item, i) => ({ item, i }))
          .reverse()
          .map(({ item, i }) => (
            <div
              key={`b-${item.id}`}
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-2xl border border-hairline bg-surface px-6 py-7"
              style={{
                borderLeft: `2px solid ${colorOf(item)}`,
                transform: `translateY(${(i + 1) * 12}px) scale(${1 - (i + 1) * 0.04})`,
                opacity: 1 - (i + 1) * 0.18,
                zIndex: 1,
              }}
            >
              <FaceOf item={item} />
            </div>
          ))}

        {/* 상단(인터랙티브) 카드 */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!moved.current && !exiting) openItem(top);
          }}
          className="absolute inset-0 z-10 cursor-pointer overflow-hidden rounded-2xl border border-hairline bg-surface px-6 py-7"
          style={{ borderLeft: `2px solid ${color}`, transform: topTransform, transition: topTransition }}
        >
          {/* 좌우 오버레이 */}
          <span
            className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: UP, borderColor: UP, opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}
          >
            관심 →
          </span>
          <span
            className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: "#64748B", borderColor: "#64748B", opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}
          >
            ← 덜 관심
          </span>

          <FaceOf item={top} progress={`${idx + 1} / ${deck.length}`} />
        </div>
      </div>

      {/* 하단 버튼 2개 */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={() => advance("left")}
          disabled={!!exiting}
          aria-label="덜 관심"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-hairline bg-surface text-xl text-muted transition-colors hover:text-whiteout disabled:opacity-40"
        >
          ✕
        </button>
        <button
          onClick={() => openInterest(top)}
          disabled={!!exiting}
          aria-label="관심 — 자세히 보기"
          className="flex h-14 flex-1 items-center justify-center rounded-full font-pixel text-sm text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: UP }}
        >
          관심
        </button>
      </div>

      {selected &&
        (selected.kind === "sector" ? (
          <KeywordDepthPage card={selected.card} onClose={closeDepth} />
        ) : (
          <StockInsightView
            stock={selected.stock.canonical}
            context={{
              fromTheme: selected.fromKeyword,
              // B — "왜 보여줬나": 그 종목이 실제 등장한 원문 한 줄(grounded). 없으면 테마 연결만 정직하게.
              reason: selected.stock.reason ?? `‘${selected.fromKeyword}’ 흐름에서 같이 움직인 종목이에요.`,
            }}
            onClose={closeDepth}
          />
        ))}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SectorStock, StockSector } from "@fomo/core";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { fetchSectorStocks, recordTaste } from "@/lib/fomoApi";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";

/**
 * 섹터 종목 무한 스와이프 덱 — SECTOR_STRUCTURE_HANDOFF §1 (Stage ③ 구조 배선).
 *
 * 섹터 칩을 고르면: 그 섹터의 종목 풀(/api/fomo/sector-stocks?baseline=1 → 빈 카드 방지)을
 * 무한히(풀만큼 순환) 스와이프한다. 오른쪽=관심/왼쪽=덜관심 → recordTaste("stock", …) 적재(트랙 B).
 * 탭 → 종목 뎁스(StockInsightView: baseline+이해 레이어를 *도달 시* lazy 로드 = 비용 방어).
 *
 * 비주얼(카드 디자인·국기/시장 라벨·요약 리치 등)은 광혁 — 여기선 구조/동작만(§4).
 * 정렬은 @fomo/core sortStocksForFeed(콜드스타트 기본) — 개인화는 다음 트랙이 seam 에 끼움.
 */
const THRESHOLD = 90;
const EXIT_MS = 320;
const UP = "#FF5A36";
const DOWN = "#64748B";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

const MARKET_LABEL: Record<string, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  NASDAQ: "나스닥",
  NYSE: "NYSE",
  COIN: "코인",
};

/** 종목 카드 앞면 — 이름 + 시장 라벨(카피·국기 등 비주얼은 광혁). */
function StockCardFace({ stock, progress }: { stock: SectorStock; progress?: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-whiteout">{stock.canonical}</span>
        {stock.marquee && <span className="text-xl" aria-hidden>⭐</span>}
      </div>
      <p className="mt-3 font-pixel text-sm text-muted">
        {MARKET_LABEL[stock.market] ?? stock.market}
      </p>
      <p className="mt-6 text-lg leading-8 text-whiteout">
        이 종목, 오늘 어떤 흐름인지 한번 볼까요?
      </p>
      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="font-pixel text-[11px] text-muted">{progress}</span>}
      </div>
    </div>
  );
}

interface SectorDeckProps {
  sector: StockSector;
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

export function SectorStockDeck({ sector, loggedIn, onRequireLogin }: SectorDeckProps) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ready"; stocks: SectorStock[] }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    // baseline 보장(국내 상장)만 — 무한 스와이프에서 빈 카드 방지(§2 전제).
    fetchSectorStocks(sector, true)
      .then((res) => {
        if (!alive) return;
        if (!res.stocks?.length) setState({ kind: "error" });
        else setState({ kind: "ready", stocks: res.stocks });
      })
      .catch((err) => {
        console.warn("[SectorStockDeck] fetch failed", err);
        if (alive) setState({ kind: "error" });
      });
    return () => {
      alive = false;
    };
  }, [sector]);

  if (state.kind === "loading")
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  if (state.kind === "error")
    return (
      <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout">
        이 섹터는 지금 보여줄 종목이 잠깐 비었어요.
        <br />
        다른 섹터를 둘러봐 주세요.
      </div>
    );
  return <SectorDeckInner stocks={state.stocks} loggedIn={loggedIn} onRequireLogin={onRequireLogin} />;
}

function SectorDeckInner({
  stocks,
  loggedIn,
  onRequireLogin,
}: { stocks: SectorStock[] } & Omit<SectorDeckProps, "sector">) {
  // 무한: 풀을 순환(modulo)해 끝나지 않는다(§7 "무한히 풀만큼").
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<SectorStock | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  const at = (i: number) => stocks[((i % stocks.length) + stocks.length) % stocks.length]!;

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
      recordTaste("stock", at(idx).canonical, dir === "right" ? "more" : "less"); // 트랙 B 적재
      flingNext(dir);
    },
    [idx, stocks, flingNext]
  );

  const openDepth = (stock: SectorStock) => {
    if (!loggedIn && onRequireLogin) {
      onRequireLogin();
      return;
    }
    recordTaste("stock", stock.canonical, "view_depth"); // 강한 관심
    setSelected(stock);
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

  const top = at(idx);
  const topTransform = exiting
    ? `translateX(${exiting === "right" ? 140 : -140}%) rotate(${exiting === "right" ? 16 : -16}deg)`
    : `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
  const topTransition = dragging.current ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.22,1,0.36,1)`;
  const behind = [at(idx + 1), at(idx + 2)];

  return (
    <div className="w-full">
      <div className="relative mx-auto h-[56vh] w-full select-none">
        {behind
          .map((stock, i) => ({ stock, i }))
          .reverse()
          .map(({ stock, i }) => (
            <div
              key={`b-${i}-${stock.canonical}`}
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-2xl border border-hairline bg-surface px-6 py-7"
              style={{
                borderLeft: `2px solid ${UP}`,
                transform: `translateY(${(i + 1) * 12}px) scale(${1 - (i + 1) * 0.04})`,
                opacity: 1 - (i + 1) * 0.18,
                zIndex: 1,
              }}
            >
              <StockCardFace stock={stock} />
            </div>
          ))}

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!moved.current && !exiting) openDepth(top);
          }}
          className="absolute inset-0 z-10 cursor-pointer overflow-hidden rounded-2xl border border-hairline bg-surface px-6 py-7"
          style={{ borderLeft: `2px solid ${UP}`, transform: topTransform, transition: topTransition }}
        >
          <span
            className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: UP, borderColor: UP, opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}
          >
            관심 →
          </span>
          <span
            className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: DOWN, borderColor: DOWN, opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}
          >
            ← 덜 관심
          </span>
          <StockCardFace stock={top} progress={`${(idx % stocks.length) + 1} / ${stocks.length}`} />
        </div>
      </div>

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
          onClick={() => openDepth(top)}
          disabled={!!exiting}
          aria-label="관심 — 자세히 보기"
          className="flex h-14 flex-1 items-center justify-center rounded-full font-pixel text-sm text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: UP }}
        >
          관심
        </button>
      </div>

      {selected && (
        <StockInsightView
          stock={selected.canonical}
          context={{ fromTheme: selected.sector }}
          onClose={closeDepth}
        />
      )}
    </div>
  );
}

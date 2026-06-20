"use client";

import { useCallback, useRef, useState } from "react";
import type { DeckCard } from "@fomo/core";
import { NewsCardBody } from "@/components/cards/NewsCardBody";
import { ChartCardBody } from "@/components/cards/ChartCardBody";
import { recordSwipe, type SwipeDir } from "@/lib/swipeHistory";

/**
 * 스와이프 카드 덱 — 한 화면 1장. 오른쪽=FOMO, 왼쪽=아니다. docs/PIVOT_FEED_FIRST.md.
 * 라이브러리 없이 포인터이벤트 + CSS transform. 버튼으로도 동작(접근성/비제스처).
 * 액션 제로 결: 슥 넘기다 나가도 됨. 판단은 저장 안 함(swipeHistory seam만).
 */
const THRESHOLD = 90; // px — 이 이상 끌면 넘어감
const EXIT_MS = 320;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function SwipeDeck({ deck }: { deck: DeckCard[] | null }) {
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const dragging = useRef(false);
  const startX = useRef(0);

  const advance = useCallback(
    (dir: "left" | "right") => {
      const card = deck?.[idx];
      if (card) recordSwipe(card, dir === "right" ? "fomo" : "skip", Date.now());
      setExiting(dir);
      const after = () => {
        setExiting(null);
        setDx(0);
        setIdx((i) => i + 1);
      };
      if (prefersReducedMotion()) after();
      else window.setTimeout(after, EXIT_MS);
    },
    [deck, idx]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting) return;
    dragging.current = true;
    startX.current = e.clientX;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setDx(e.clientX - startX.current);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx > THRESHOLD) advance("right");
    else if (dx < -THRESHOLD) advance("left");
    else setDx(0); // 스냅백
  };

  if (deck === null) {
    return <p className="mt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (deck.length === 0) {
    return (
      <p className="mt-10 text-center text-sm leading-6 text-muted">
        지금은 가져올 소식이 조용해요.
        <br />
        내일 다시 들러도 돼요.
      </p>
    );
  }
  if (idx >= deck.length) {
    return (
      <div className="mt-12 flex flex-col items-center gap-4 text-center">
        <p className="text-sm leading-6 text-whiteout">
          오늘 소식은 여기까지예요.
          <br />
          혼자 늦은 거 아니에요. 내일 또 봐요.
        </p>
        <button
          onClick={() => setIdx(0)}
          className="rounded-full border border-hairline px-4 py-2 font-pixel text-xs text-muted transition-colors hover:text-whiteout"
        >
          처음부터 다시
        </button>
      </div>
    );
  }

  // 상단 카드 transform: 드래그 중이면 손가락 따라, 퇴장 중이면 화면 밖으로.
  const topTransform = exiting
    ? `translateX(${exiting === "right" ? 140 : -140}%) rotate(${exiting === "right" ? 18 : -18}deg)`
    : `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
  const topTransition = dragging.current ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.22,1,0.36,1)`;

  // 뒤 카드 2장(깊이감).
  const behind = [deck[idx + 1], deck[idx + 2]].filter(Boolean) as DeckCard[];

  return (
    <div className="w-full">
      <p className="mb-3 px-1 text-center text-xs text-muted">
        오른쪽으로 넘기면 <span style={{ color: "#FF5A36" }}>FOMO</span>, 왼쪽은 아니에요
      </p>

      {/* 카드 스택 */}
      <div className="relative mx-auto h-[480px] w-full select-none">
        {behind.map((card, i) => (
          <div
            key={`b-${idx + 1 + i}`}
            aria-hidden
            className="absolute inset-0 rounded-2xl border border-hairline bg-surface"
            style={{
              transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.04})`,
              opacity: 0.5 - i * 0.2,
              zIndex: 1,
            }}
          />
        ))}

        {/* 상단(인터랙티브) 카드 */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-0 z-10 cursor-grab touch-pan-y overflow-hidden rounded-2xl border border-hairline bg-surface px-5 py-5 active:cursor-grabbing"
          style={{ transform: topTransform, transition: topTransition }}
        >
          {/* 좌우 판단 오버레이 */}
          <span
            className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: "#FF5A36", borderColor: "#FF5A36", opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}
          >
            FOMO ↗
          </span>
          <span
            className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border-2 px-2 py-0.5 font-pixel text-sm"
            style={{ color: "#64748B", borderColor: "#64748B", opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}
          >
            ← 아니에요
          </span>

          {(() => {
            const card = deck[idx]!;
            return card.kind === "news" ? (
              <NewsCardBody article={card.article} />
            ) : (
              <ChartCardBody chart={card.chart} />
            );
          })()}
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          onClick={() => advance("left")}
          disabled={!!exiting}
          aria-label="아니다"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-hairline bg-surface text-xl text-muted transition-colors hover:text-whiteout disabled:opacity-40"
        >
          ✕
        </button>
        <button
          onClick={() => advance("right")}
          disabled={!!exiting}
          aria-label="FOMO"
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full font-pixel text-sm text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: "#FF5A36" }}
        >
          FOMO ↗
        </button>
      </div>
    </div>
  );
}

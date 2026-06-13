"use client";

import { useCallback, useRef, useState } from "react";
import { MOCK_KEYWORD_CARDS, scoreToColor, scoreToEmoji, type KeywordCard } from "@fomo/core";
import { KeywordDepthPage } from "@/components/KeywordDepthPage";
import { recordInterest } from "@/lib/keywordInterest";
import { recordViewed, getHistory } from "@/lib/keywordHistory";

/**
 * 키워드 카드 덱 — 자연스러운 스와이프(드래그+뒤 카드 실제 콘텐츠 노출) + 하단 버튼 2개.
 * KEYWORD_CARD_FEED_DEV_SPEC v3. 오른쪽=관심 / 왼쪽=덜관심(둘 다 다음 카드로).
 * 본 카드는 히스토리 적재 + 덱에서 제외 → 다시 와도 다음 카드부터.
 * 뎁스에서 닫으면 본 카드가 스르륵 넘어가며(자동 스와이프) 다음 카드가 보인다.
 */
const THRESHOLD = 90;
const EXIT_MS = 320;
const UP = "#FF5A36";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** 카드 내용(앞/뒤 공용). progress 있으면 우하단에 n/N 표시(앞면만). */
function CardFace({ card, progress }: { card: KeywordCard; progress?: string }) {
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

export function KeywordCardFeed({
  cards = MOCK_KEYWORD_CARDS,
}: {
  cards?: readonly KeywordCard[];
}) {
  // 마운트 시점의 "이미 본" 집합 — 본 카드는 덱에서 제외(다시 와도 다음 카드부터).
  const viewedIds = useState(() => new Set(getHistory().map((h) => h.id)))[0];
  const [replay, setReplay] = useState(false);
  const deck = replay ? [...cards] : cards.filter((c) => !viewedIds.has(c.id));

  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<KeywordCard | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  // 본 카드를 한쪽으로 날리고 다음 카드로. (관심 기록은 호출부에서 별도)
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
      const card = deck[idx];
      if (card) {
        recordInterest(card.id, dir === "right" ? "more" : "less", Date.now());
        recordViewed(card, Date.now());
      }
      flingNext(dir);
    },
    [deck, idx, flingNext]
  );

  const openDepth = (card: KeywordCard) => {
    recordViewed(card, Date.now());
    setSelected(card);
  };
  // 뎁스 닫으면 본 카드가 스르륵 넘어가며 다음 카드 노출.
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
          오늘 사람들 시선은 여기까지였어.
          <br />
          내일은 또 어디로 쏠릴지 같이 보자.
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
  const color = scoreToColor(top.fomoScore);
  const topTransform = exiting
    ? `translateX(${exiting === "right" ? 140 : -140}%) rotate(${exiting === "right" ? 16 : -16}deg)`
    : `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
  const topTransition = dragging.current ? "none" : `transform ${EXIT_MS}ms cubic-bezier(0.22,1,0.36,1)`;
  const behind = [deck[idx + 1], deck[idx + 2]].filter(Boolean) as KeywordCard[];

  return (
    <div className="w-full">
      <p className="mb-2 px-1 text-center text-xs text-muted">
        오른쪽=<span style={{ color: UP }}>관심</span> · 왼쪽=덜 관심 · 탭하면 자세히
      </p>

      {/* 카드 스택 (뒤 카드 실제 콘텐츠 노출) */}
      <div className="relative mx-auto h-[56vh] w-full select-none">
        {behind
          .map((card, i) => ({ card, i }))
          .reverse()
          .map(({ card, i }) => (
            <div
              key={`b-${card.id}`}
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-2xl border border-hairline bg-surface px-6 py-7"
              style={{
                borderLeft: `2px solid ${scoreToColor(card.fomoScore)}`,
                transform: `translateY(${(i + 1) * 12}px) scale(${1 - (i + 1) * 0.04})`,
                opacity: 1 - (i + 1) * 0.18,
                zIndex: 1,
              }}
            >
              <CardFace card={card} />
            </div>
          ))}

        {/* 상단(인터랙티브) 카드 */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!moved.current && !exiting) openDepth(top);
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

          <CardFace card={top} progress={`${idx + 1} / ${deck.length}`} />
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
          onClick={() => advance("right")}
          disabled={!!exiting}
          aria-label="관심"
          className="flex h-14 flex-1 items-center justify-center rounded-full font-pixel text-sm text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: UP }}
        >
          관심
        </button>
      </div>

      {selected && <KeywordDepthPage card={selected} onClose={closeDepth} />}
    </div>
  );
}

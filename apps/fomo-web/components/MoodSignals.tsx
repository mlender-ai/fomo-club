"use client";

import { useEffect, useMemo, useState } from "react";
import { moodifyBanner, type MoodSignal } from "@fomo/core";
import type { BannerItem } from "@/lib/fomoApi";

/**
 * 롤링 시그널 — 시장 신호를 분위기로 치환해 세로로 흘린다. docs/PIVOT_FEED_FIRST.md.
 * 액션 제로: 클릭/입력 없음. 슥 보다가 나가도 위로가 완성된다.
 * prefers-reduced-motion 시 자동 정지(첫 줄 고정).
 */
const ROTATE_MS = 4500;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function MoodSignals({ items }: { items: BannerItem[] }) {
  const signals: MoodSignal[] = useMemo(() => moodifyBanner(items), [items]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (idx >= signals.length) setIdx(0);
  }, [signals.length, idx]);

  useEffect(() => {
    if (signals.length <= 1 || prefersReducedMotion()) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % signals.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [signals.length]);

  if (signals.length === 0) return null;
  const current = signals[idx] ?? signals[0]!;

  return (
    <div
      aria-label="오늘의 분위기 시그널"
      className="flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-hairline bg-surface px-4 py-3"
    >
      <span aria-hidden className="shrink-0 text-sm">
        {current.emoji}
      </span>
      <p
        key={current.id}
        aria-live="polite"
        className="fomo-rise min-w-0 flex-1 text-sm leading-5 text-whiteout"
      >
        {current.text}
      </p>
    </div>
  );
}

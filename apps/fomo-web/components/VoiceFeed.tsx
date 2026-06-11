"use client";

// [HIDDEN] feature flag(FEATURE_EMOTION_JOURNAL)로 비활성화. 삭제 금지. docs/PIVOT_FEED_FIRST.md 참조.

import { EMOTION_COLORS, type EmotionType } from "@fomo/core";
import type { VoiceItem } from "@/lib/fomoApi";

/**
 * M4 피드 — 타인의 구조화 한마디 카드 리스트. docs/M4_EXECUTION_PLAN.md §4.4.
 * 위로는 앱의 단정이 아니라 타인의 목소리로(§M4). 자유 텍스트 0 — composeVoice 조합만.
 * 큐레이션(콜드스타트)일 땐 "포모가 모아둔 마음"으로 정직하게 표기(가짜 사용자 ❌).
 */
export function VoiceFeed({ items }: { items: VoiceItem[] | null }) {
  if (!items) {
    return <p className="mt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }

  const allCurated = items.length > 0 && items.every((v) => v.curated);

  return (
    <section className="mt-6 w-full">
      <h2 className="text-base font-semibold text-whiteout">오늘의 목소리</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">
        {allCurated
          ? "아직 오늘의 한마디가 없어서, 포모가 모아둔 마음을 먼저 들려줄게."
          : "같은 자리에 있는 사람들의 한마디야."}
      </p>

      <div className="flex flex-col gap-2.5">
        {items.map((v, i) => {
          const color = EMOTION_COLORS[v.emotion as EmotionType] ?? "#6A6A6A";
          return (
            <div
              key={`${v.text}-${i}`}
              className="fomo-rise flex items-start gap-3 rounded-xl border border-hairline bg-surface px-4 py-3.5"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}66` }}
              />
              <p className="text-sm leading-6 text-whiteout">{v.text}</p>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted">
          오늘은 아직 조용해. 네가 먼저 마음을 남겨도 좋아.
        </p>
      )}

      <p className="mt-5 text-center text-[11px] leading-5 text-muted">
        한마디는 정해진 조각을 골라 만든 거야. 투자 조언이 아니에요.
      </p>
    </section>
  );
}

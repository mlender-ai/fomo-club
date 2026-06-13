"use client";

import { scoreToColor, type KeywordCard } from "@fomo/core";

/**
 * 키워드 뎁스 페이지 — 카드/히스토리에서 공용. KEYWORD_CARD_FEED_DEV_SPEC v3 §3.
 * "오늘 왜 쏠렸어" + "근데 이건 기억해"(균형추) + 관련 종목 미니 + 유료자리 표시 + 면책.
 */
export function KeywordDepthPage({ card, onClose }: { card: KeywordCard; onClose: () => void }) {
  const color = scoreToColor(card.fomoScore);
  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <div className="mx-auto flex h-full max-w-md flex-col">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-bold text-whiteout">{card.keyword}</span>
            <span aria-hidden>{card.emoji}</span>
            <span className="font-pixel text-sm" style={{ color }}>
              포모 {card.fomoScore}
            </span>
          </div>
          <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout">
            닫기
          </button>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <p className="text-sm leading-6 text-whiteout">{card.comment}</p>

          <section className="mt-7">
            <p className="font-pixel text-sm text-whiteout">{card.depth.whyTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{card.depth.why}</p>
          </section>

          <section className="mt-6">
            <p className="font-pixel text-sm text-whiteout">{card.depth.rememberTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{card.depth.remember}</p>
          </section>

          <section className="mt-6">
            <p className="text-xs text-muted">다들 이런 것들 봤어</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {card.related.map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs text-whiteout"
                >
                  {r}
                </span>
              ))}
            </div>
          </section>

          <div className="mt-8 rounded-xl border border-dashed border-hairline px-4 py-4">
            <p className="font-pixel text-[11px] text-muted">곧 추가될 거야</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              이 테마 더 깊이 보기 · 관심 종목 모아보기
            </p>
          </div>

          <p className="mt-8 text-center text-[11px] leading-5 text-muted">
            지난 흐름을 친구처럼 풀어준 거예요. 투자 조언이 아니에요.
          </p>
        </div>
      </div>
    </div>
  );
}

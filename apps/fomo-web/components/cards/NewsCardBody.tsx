"use client";

import { scoreToColor, scoreToEmoji, scoreToFace, type ScoredArticle } from "@fomo/core";
import { FomoFace } from "@/components/FomoFace";

/** "3시간 전" 상대 시각. */
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 0) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/**
 * 뉴스 카드 본문 — 포모 한줄 코멘트(말풍선) + 제목 + 원문(요약) + 출처·점수.
 * docs/PIVOT_FEED_FIRST.md. 스와이프는 부모(SwipeDeck)가 담당, 여기선 내용만.
 */
export function NewsCardBody({ article }: { article: ScoredArticle }) {
  const color = scoreToColor(article.fomoScore);
  const when = relativeTime(article.publishedAt);

  return (
    <div className="flex h-full flex-col">
      {/* 포모 + 말풍선 코멘트 */}
      <div className="flex items-start gap-2.5">
        <FomoFace face={scoreToFace(article.fomoScore)} size={44} glow={color} />
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[11px] text-muted">포모</p>
          {article.comment && (
            <p className="fomo-rise mt-1 rounded-2xl rounded-tl-sm border border-hairline bg-elevated px-3 py-2 text-sm leading-5 text-whiteout">
              {article.comment}
            </p>
          )}
        </div>
      </div>

      {/* 점수 배지 + 카테고리 */}
      <div className="mt-4 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color, backgroundColor: `${color}1A` }}
        >
          <span aria-hidden>{scoreToEmoji(article.fomoScore)}</span>
          {article.fomoScore}
        </span>
        {article.category && <span className="text-[11px] text-muted">{article.category}</span>}
      </div>

      {/* 제목 */}
      <h2 className="mt-2 text-lg font-semibold leading-7 text-whiteout">{article.title}</h2>

      {/* 원문(요약) */}
      {article.summary && (
        <p className="mt-2 flex-1 overflow-hidden text-sm leading-6 text-muted">{article.summary}</p>
      )}

      {/* 출처·시간 + 원문 보기 */}
      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
        <span className="text-[11px] text-muted">
          {article.source}
          {when ? ` · ${when}` : ""}
        </span>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded-full border border-hairline px-3 py-1 font-pixel text-[11px] text-muted transition-colors hover:text-whiteout"
        >
          원문 보기
        </a>
      </div>
    </div>
  );
}

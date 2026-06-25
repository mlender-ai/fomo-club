"use client";

import { useState } from "react";
import { scoreToColor, scoreToEmoji, type ScoredArticle } from "@fomo/core";

/**
 * 뉴스 피드 — 실제 기사를 FOMO 점수순으로. docs/PIVOT_FEED_FIRST.md.
 *
 * 사실 적시: 헤드라인은 소스 그대로(감정 치환 없음). 점수는 정렬·체감용으로 색 배지로만.
 * 액션 제로: 좋아요/댓글/투표 없음. 슥 보다가 카드 탭하면 원문으로(선택).
 * 데이터: /api/fomo/news. 비었으면 담담한 빈 상태(가짜 기사 금지 — 정직한 숫자 원칙).
 */
const PAGE_SIZE = 12;

export function NewsFeed({ articles }: { articles: ScoredArticle[] | null }) {
  const [count, setCount] = useState(PAGE_SIZE);

  if (articles === null) {
    return <p className="mt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (articles.length === 0) {
    return (
      <p className="mt-10 text-center text-sm leading-6 text-muted">
        지금은 가져올 뉴스가 조용해.
        <br />
        내일 다시 들러도 돼.
      </p>
    );
  }

  const visible = articles.slice(0, count);

  return (
    <div className="w-full">
      <p className="mb-3 px-1 text-xs text-muted">
        오늘 가장 뜨거운 뉴스부터 — <span className="text-whiteout">FOMO 점수</span>순
      </p>

      <div className="flex flex-col gap-2.5">
        {visible.map((a) => (
          <NewsCard key={a.id} article={a} />
        ))}
      </div>

      {count < articles.length && (
        <button
          onClick={() => setCount((c) => c + PAGE_SIZE)}
          className="mt-4 w-full rounded-xl border border-hairline bg-surface py-3 font-pixel text-xs text-muted transition-colors hover:text-whiteout"
        >
          더 보기
        </button>
      )}

      {/* 면책 — 사실 적시 + 투자 조언 아님 */}
      <p className="mt-6 px-1 text-center text-[11px] leading-5 text-muted">
        실제 시장 기사예요. FOMO 점수는 감정 체감용이고, 투자 조언이 아니에요.
      </p>
    </div>
  );
}

/** "3시간 전" 같은 상대 시각. 미래/파싱불가는 빈 문자열. */
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 0) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function NewsCard({ article }: { article: ScoredArticle }) {
  const color = scoreToColor(article.fomoScore);
  const emoji = scoreToEmoji(article.fomoScore);
  const when = relativeTime(article.publishedAt);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-hairline bg-surface px-4 py-3.5 transition-colors hover:border-muted"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {/* FOMO 점수 배지 — 색=구간 감정색, 숫자가 정렬 기준 */}
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color, backgroundColor: `${color}1A` }}
          aria-label={`FOMO 점수 ${article.fomoScore}`}
        >
          <span aria-hidden>{emoji}</span>
          {article.fomoScore}
        </span>
        {article.category && (
          <span className="text-[11px] text-muted">{article.category}</span>
        )}
      </div>

      {/* 사실 헤드라인 — 소스 그대로 */}
      <p className="text-sm leading-6 text-whiteout group-hover:text-whiteout">{article.title}</p>

      {article.summary && (
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted">{article.summary}</p>
      )}

      <p className="mt-2 text-[11px] text-muted">
        {article.source}
        {when ? ` · ${when}` : ""}
      </p>
    </a>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchJudgmentReview,
  type JudgmentReviewResponse,
  type JudgmentReviewRow,
  type ReviewAction,
  type ReviewStance,
} from "@/lib/fomoApi";

const NEON = "#D8FF3A";
const MUTED = "#A3A3A0";

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function stanceLabel(stance: ReviewStance): string {
  if (stance === "enter") return "카드 진입";
  if (stance === "avoid") return "카드 비진입";
  return "카드 관찰";
}

function actionLabel(action: ReviewAction): string {
  if (action === "star") return "내가 담음";
  if (action === "pass") return "내가 넘김";
  return "내가 봄";
}

function reportText(review: JudgmentReviewResponse): string {
  const weekly = review.weekly;
  if (!weekly) return "";
  const parts = [`포모클럽 주간 판단 복기 · 결과 ${weekly.count}건`];
  if (weekly.best) parts.push(`잘한 판단 ${weekly.best.canonical} ${signed(weekly.best.returnPct)}`);
  if (weekly.missed) parts.push(`아까운 판단 ${weekly.missed.canonical} ${signed(weekly.missed.returnPct)}`);
  return parts.join("\n");
}

function rateSummary(rate: JudgmentReviewResponse["userRate"]): string | null {
  if (rate.n <= 0 || rate.winRate === null) return null;
  const wins = Math.round((rate.n * rate.winRate) / 100);
  return `${rate.n}번 중 ${wins}번`;
}

async function shareReview(review: JudgmentReviewResponse): Promise<void> {
  const text = reportText(review);
  const data = { title: "포모클럽 주간 판단 복기", text, ...(typeof window !== "undefined" ? { url: window.location.href } : {}) };
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share(data);
      return;
    } catch {
      // Share-sheet cancellation and unsupported payloads use the same clipboard fallback.
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(`${text}\n${"url" in data ? data.url : ""}`.trim());
  }
}

function ReviewRow({ row }: { row: JudgmentReviewRow }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-whiteout">{row.canonical}</p>
        <p className="mt-0.5 text-[10px] text-muted">{stanceLabel(row.stance)} · {actionLabel(row.action)}</p>
      </div>
      <span className="shrink-0 font-number text-sm font-bold" style={{ color: row.returnPct > 0 ? NEON : MUTED }}>
        {signed(row.returnPct)}
      </span>
    </div>
  );
}

function WeeklyCard({ review }: { review: JudgmentReviewResponse }) {
  const weekly = review.weekly;
  if (!weekly) return null;
  return (
    <section className="w-full rounded-lg border border-hairline bg-surface px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-pixel text-[10px] text-muted">WEEKLY REVIEW · 30D</p>
          <h2 className="mt-2 text-lg font-bold text-whiteout">이번 주 판단 복기</h2>
          <p className="mt-1 text-xs text-muted">결과가 확정된 {weekly.count}건을 카드·내 판단·결과로 대조했어요.</p>
        </div>
        <button type="button" onClick={() => void shareReview(review)} className="shrink-0 border-b border-hairline pb-0.5 text-xs text-whiteout">
          공유
        </button>
      </div>
      <div className="mt-4">
        {weekly.best && (
          <p className="text-sm leading-6 text-whiteout">잘한 판단 · <b>{weekly.best.canonical}</b> {signed(weekly.best.returnPct)}</p>
        )}
        {weekly.missed && (
          <p className="text-sm leading-6 text-whiteout">아까운 판단 · <b>{weekly.missed.canonical}</b> {signed(weekly.missed.returnPct)}</p>
        )}
        {weekly.disagreements.length > 0 && (
          <p className="mt-1 text-xs leading-5 text-muted">카드와 갈린 판단 {weekly.disagreements.length}건 · 결과를 다음 선택의 기록으로 남겼어요.</p>
        )}
      </div>
    </section>
  );
}

function HistoryReview({ review }: { review: JudgmentReviewResponse }) {
  const userSummary = rateSummary(review.userRate);
  const cardSummary = rateSummary(review.cardRate);
  const comparison = useMemo(() => {
    const user = review.userRate.winRate;
    const card = review.cardRate.winRate;
    if (user === null || card === null) return null;
    if (user === card) return "현재 표본에서는 두 판단의 적중률이 같아요.";
    const gap = Math.abs(user - card).toFixed(1);
    return user > card ? `현재 표본에서 내 판단이 ${gap}%p 높아요.` : `현재 표본에서 카드 판단이 ${gap}%p 높아요.`;
  }, [review.cardRate.winRate, review.userRate.winRate]);

  if (review.rows.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs text-muted">내 판단 · 카드 · 30일 결과</p>
        <span className="text-[10px] text-muted">확정 {review.rows.length} · 대기 {review.pendingCount}</span>
      </div>

      {(userSummary || cardSummary) && <div className="rounded-lg border border-hairline bg-surface-raised p-4">
        <div className={`grid gap-3 ${userSummary && cardSummary ? "grid-cols-2" : "grid-cols-1"}`}>
          {userSummary && <div>
            <p className="text-[10px] text-muted">내 판단 승률</p>
            <p className="mt-1 text-2xl font-bold text-whiteout">{userSummary}</p>
          </div>}
          {cardSummary && <div>
            <p className="text-[10px] text-muted">카드 판단 승률</p>
            <p className="mt-1 text-2xl font-bold text-whiteout">{cardSummary}</p>
          </div>}
        </div>
        {comparison && <p className="mt-3 text-xs leading-5 text-muted">{comparison}</p>}
      </div>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {review.matrix.map((cell) => (
          <div key={cell.key} className="min-h-[72px] rounded-lg border border-hairline bg-surface px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold leading-4 text-whiteout">{cell.label}</p>
              <span className="font-number text-base font-bold text-whiteout">{cell.count}</span>
            </div>
            <p className="mt-1 text-[9px] leading-4 text-muted">{cell.note}</p>
          </div>
        ))}
      </div>

      {review.strongSignals.length > 0 && (
        <div className="mt-3 rounded-lg border border-hairline bg-surface px-4 py-3">
          <p className="text-xs font-semibold text-whiteout">당신이 강한 신호</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {review.strongSignals.map((signal) => (
              <span key={signal.code} className="rounded-full border border-hairline-soft px-2.5 py-1 text-[10px] text-whiteout">
                {signal.label} · {rateSummary(signal)}
              </span>
            ))}
          </div>
        </div>
      )}

      {review.weekly && (
        <div className="mt-3"><WeeklyCard review={review} /></div>
      )}

      {review.rows.length > 0 && (
        <div className="mt-3 rounded-lg border border-hairline bg-surface px-4">
          {review.rows.slice(0, 8).map((row) => <ReviewRow key={`${row.selectionId}-${row.actionAt}`} row={row} />)}
        </div>
      )}
    </section>
  );
}

export function JudgmentReviewPanel({ weeklyOnly = false }: { weeklyOnly?: boolean }) {
  const [review, setReview] = useState<JudgmentReviewResponse | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchJudgmentReview().then((value) => alive && setReview(value)).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!review) return null;
  return weeklyOnly ? <WeeklyCard review={review} /> : <HistoryReview review={review} />;
}

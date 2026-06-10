"use client";

/**
 * 로딩/폴백 상태용 스켈레톤 UI.
 * FOMO Index와 감정 투표 영역의 데이터 미비 시 빈 화면 대신 표시.
 * 최소한의 형태로 — 과도한 시각적 복잡성은 오히려 혼란을 야기.
 */

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface ${className ?? ""}`}
      aria-hidden
    />
  );
}

/** FOMO Index + 마스코트 영역 스켈레톤 */
export function FomoIndexSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {/* 마스코트 자리 */}
      <SkeletonBlock className="h-[84px] w-[84px] rounded-lg" />
      {/* 숫자 자리 */}
      <SkeletonBlock className="h-8 w-16" />
      {/* 상태 라벨 자리 */}
      <SkeletonBlock className="h-3 w-32" />
      {/* 한마디 자리 */}
      <SkeletonBlock className="h-4 w-48" />
    </div>
  );
}

/** 감정 투표 집계 영역 스켈레톤 */
export function TallySkeleton() {
  return (
    <div className="flex w-full flex-col gap-2 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <SkeletonBlock className="h-3 w-8" />
          <SkeletonBlock className="h-2 flex-1" />
          <SkeletonBlock className="h-3 w-6" />
        </div>
      ))}
    </div>
  );
}

/**
 * FOMO Club 스켈레톤 로더 컴포넌트.
 * 이슈 #409 (PM): 데이터 로딩/결측 상태에서 빈 화면 대신 대체 시각 피드백 제공.
 * 정직한 숫자 원칙: 데이터 없음을 숨기지 않고 "준비 중" 상태를 담담하게 표시.
 */

function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-elevated ${className}`}
      aria-hidden
    />
  );
}

/** FOMO Index 숫자 + 상태 라벨 영역 스켈레톤. */
export function FomoIndexSkeleton() {
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <SkeletonBox className="h-10 w-16" />
      <SkeletonBox className="h-3 w-32" />
    </div>
  );
}

/** 감정 집계 탤리 바 5개 영역 스켈레톤. */
export function TallySkeleton() {
  return (
    <section className="mt-7 w-full">
      <SkeletonBox className="mb-3 h-3 w-40" />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <SkeletonBox className="h-3 w-10" />
            <SkeletonBox className="h-2 flex-1" />
            <SkeletonBox className="h-3 w-9" />
          </div>
        ))}
      </div>
    </section>
  );
}

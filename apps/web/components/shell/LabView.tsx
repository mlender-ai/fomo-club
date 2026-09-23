"use client";

/**
 * 세 상태를 한 곳에서 (UI-03 PART E).
 *
 * > 모든 화면이 세 상태를 가진다. **빈 화면을 그냥 두지 않는다.**
 *
 * 화면은 `ready` 일 때 그릴 것만 넘긴다. 로딩 모양은 화면이 넘긴다 — **실제 레이아웃과
 * 같은 모양**이어야 뜨는 순간 화면이 튀지 않는다.
 */
import type { ReactNode } from "react";

import { Empty } from "../ui";
import type { LabState } from "./useLab";
import { useSyncHint } from "./SyncProvider";

export function LabView<T>({
  state,
  retry,
  loading,
  children,
}: {
  state: LabState<T>;
  retry: () => void;
  /** 실제 레이아웃과 같은 모양의 스켈레톤. */
  loading: ReactNode;
  children: (data: T, meta: { builtAt: string }) => ReactNode;
}) {
  const hint = useSyncHint();

  if (state.kind === "loading") return <>{loading}</>;

  if (state.kind === "not_built") {
    return (
      <Empty
        title="아직 받은 데이터가 없어요"
        reason={hint ?? "FCE 업로드가 한 번도 돌지 않았어요. 러너가 켜지면 15분 안에 채워집니다."}
        action={<code>npm run lab:runner</code>}
      />
    );
  }

  if (state.kind === "error") {
    return <ErrorState message={state.message} onRetry={retry} />;
  }

  return <>{children(state.data, { builtAt: state.builtAt })}</>;
}

/** 오류 — 한 줄 + 다시 시도(E). 원인을 숨기지 않는다. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="sh-error" role="alert">
      <p className="sh-error-text">
        화면을 불러오지 못했어요. <span className="sh-error-reason">({message})</span>
      </p>
      <button type="button" className="sh-btn" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

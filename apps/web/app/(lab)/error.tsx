"use client";

/**
 * 탭 하나가 무너졌을 때 — **헤더는 남긴다** (UI-03 PART E).
 *
 * UI-03 을 배포하고 `/whales` 가 터졌을 때 루트 `app/error.tsx` 가 받았다. 루트 경계는
 * `(lab)` 레이아웃 **바깥**이라 헤더까지 통째로 덮었고, 탭이 사라져서 다른 화면으로 갈
 * 수도 없었다. 이 경계는 레이아웃 **안**에 있어서 무너진 것은 본문뿐이다.
 */
import { ErrorState } from "../../components/shell/LabView";

export default function LabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="sh-page">
      <ErrorState message={error.digest ? `오류 번호 ${error.digest}` : "화면을 그리다 멈췄어요"} onRetry={reset} />
    </div>
  );
}

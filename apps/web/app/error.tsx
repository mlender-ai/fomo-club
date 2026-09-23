"use client";

/**
 * 화면 하나가 통째로 무너졌을 때. 한 줄 + 다시 시도(UI-03 PART E).
 *
 * 데이터를 못 받은 경우는 여기까지 오지 않는다 — 각 화면이 `LabView` 에서 받아 자기
 * 자리에 오류를 그린다. 여기는 렌더 자체가 터졌을 때다.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="sh-fallback">
      <section className="sh-fallback-card">
        <h1 className="sh-fallback-title">화면을 그리지 못했어요</h1>
        <p className="sh-fallback-text">
          {error.digest ? `오류 번호 ${error.digest}` : "잠시 뒤 다시 시도해 주세요."}
        </p>
        <button className="sh-btn" onClick={() => reset()} type="button">
          다시 시도
        </button>
      </section>
    </main>
  );
}

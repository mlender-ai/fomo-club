"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="lab-fallback">
      <section className="lab-fallback-card">
        <span className="section-kicker">Error</span>
        <p className="lab-empty-msg">화면을 불러오지 못했습니다.</p>
        <button className="lab-button" onClick={() => reset()} type="button">
          다시 시도
        </button>
      </section>
    </main>
  );
}

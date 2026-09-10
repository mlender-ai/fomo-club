"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body>
        <main className="lab-fallback">
          <section className="lab-fallback-card">
            <span className="section-kicker">Global Error</span>
            <p className="lab-empty-msg">랩을 열지 못했습니다.</p>
            <button className="lab-button" onClick={() => reset()} type="button">
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}

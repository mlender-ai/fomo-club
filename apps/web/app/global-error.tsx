"use client";

/**
 * 루트 레이아웃까지 무너졌을 때. `globals.css` 가 안 붙었을 수도 있어서 **스타일에 기대지
 * 않고** 글자만으로도 읽히게 둔다.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main className="sh-fallback">
          <section className="sh-fallback-card">
            <h1 className="sh-fallback-title">FOMO LAB 을 열지 못했어요</h1>
            <p className="sh-fallback-text">잠시 뒤 다시 시도해 주세요.</p>
            <button className="sh-btn" onClick={() => reset()} type="button">
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}

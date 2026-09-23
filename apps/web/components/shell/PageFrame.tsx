/**
 * 페이지 틀 (UI-03 PART D).
 *
 * ```
 * main  max-width 1240 · padding 44 40 90
 * ```
 *
 * 사이드가 있으면 2열(본문 + 380), 없으면 1열. Overview·고래·연구가 2열이다(D-1).
 * 1200 아래에서는 사이드가 본문 아래로 내려간다(UI-01 G).
 */
import type { ReactNode } from "react";

export function PageFrame({
  title,
  description,
  side,
  children,
}: {
  title: string;
  description?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`sh-page${side ? " has-side" : ""}`}>
      <div className="sh-page-head">
        <h1 className="sh-title">{title}</h1>
        {description ? <p className="sh-desc">{description}</p> : null}
      </div>
      {side ? (
        <div className="sh-cols">
          <div className="sh-body">{children}</div>
          <aside className="sh-side">{side}</aside>
        </div>
      ) : (
        <div className="sh-body">{children}</div>
      )}
    </div>
  );
}

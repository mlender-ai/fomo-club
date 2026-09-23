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
  hideTitle = false,
}: {
  title: string;
  /**
   * 제목을 **눈에서만** 숨긴다(스크린 리더는 읽는다). Overview 는 Hero 가 화면의 머리라
   * 그 위에 "Overview" 를 또 얹으면 가장 큰 숫자가 두 번째로 밀린다(UI-00 §4-2).
   */
  hideTitle?: boolean;
  description?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`sh-page${side ? " has-side" : ""}`}>
      <div className={`sh-page-head${hideTitle ? " is-hidden" : ""}`}>
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

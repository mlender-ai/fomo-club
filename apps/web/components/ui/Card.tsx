/**
 * 카드 — 제목 · 설명 · 내용 (UI-01 D · E).
 *
 * `radius 18 · 1px line · **그림자 없음**`. 그림자는 드롭다운·모달에만 쓴다 —
 * 카드마다 그림자를 주면 화면이 떠 보이고 위계가 사라진다.
 */
import type { ReactNode } from "react";

import { Info } from "./Info";

export function Card({
  title,
  description,
  aside,
  children,
  flush = false,
  info,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** 제목 줄 오른쪽 — 기간 선택 같은 것. */
  aside?: ReactNode;
  children: ReactNode;
  /** 표처럼 카드 끝까지 채워야 할 때 안쪽 여백을 뺀다. */
  flush?: boolean;
  /** 제목 옆 `ⓘ` 가 여는 설명(UI-FIX A-3). 문단은 여기에만 쓴다. */
  info?: ReactNode;
}) {
  return (
    <section className={`ui-card${flush ? " is-flush" : ""}`}>
      {title || aside ? (
        <div className="ui-card-head">
          <div>
            <h3 className="ui-card-title">
              {title}
              {info ? <Info title={typeof title === "string" ? title : "설명"}>{info}</Info> : null}
            </h3>
            {description ? <p className="ui-card-desc">{description}</p> : null}
          </div>
          {aside ? <div className="ui-card-aside">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

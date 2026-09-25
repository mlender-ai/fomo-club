"use client";

/**
 * `ⓘ` — 설명을 접는다 (UI-FIX A-3).
 *
 * > 정직하게 보여주는 것과 문단으로 설명하는 것은 다르다. **설명은 접는다.**
 *
 * 제목 옆 작은 `ⓘ`. 누르면 아래에서 바텀시트가 올라오고, **그 안에서만 문단을 쓴다.**
 * 닫혀 있는 동안 설명은 DOM 에 없다 — 텍스트 예산 테스트(`text-budget.test.ts`)가 닫힌
 * 화면을 재므로, 문단을 시트에 넣으면 예산에서 빠지고 화면에 두면 걸린다.
 *
 * 설명을 **지우지 않는다.** 한계·사유·출처는 전부 여기로 옮긴다.
 *
 * 시트는 `body` 로 포털한다 — 제목이 링크 안에 있어도 시트가 `<a>` 안에 들어가지 않게.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Info({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // 시트가 떠 있는 동안 뒤 화면이 스크롤되지 않게.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      openerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className="ui-info"
        aria-label={`${title} 설명`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          // 행 링크 안에 있어도 링크로 넘어가지 않는다.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        ⓘ
      </button>
      {open
        ? createPortal(
            <div
              className="ui-sheet-backdrop"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={id}
                className="ui-sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ui-sheet-head">
                  <h2 id={id} className="ui-sheet-title">
                    {title}
                  </h2>
                  <button
                    ref={closeRef}
                    type="button"
                    className="ui-sheet-close"
                    aria-label="닫기"
                    onClick={() => setOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="ui-sheet-body">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

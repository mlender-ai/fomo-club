"use client";

/**
 * 미니멀 / 프로 (UI-06 PART D) — FCE 에 있는 토글.
 *
 * | 모드 | 보이는 것 |
 * |---|---|
 * | 미니멀 | Hero · 가격 레일 |
 * | 프로 | 전부 |
 *
 * **폰 기본은 미니멀, 데스크톱 기본은 프로.** 한 번 고르면 이 브라우저가 기억한다(localStorage) —
 * 저장이 막힌 브라우저(사생활 모드 등)에서는 기본값으로 돈다.
 */
import { useCallback, useEffect, useState } from "react";

export type ViewMode = "minimal" | "pro";

const KEY = "lab.positions.mode";
const PHONE = "(max-width: 767px)";

function initial(): ViewMode {
  if (typeof window === "undefined") return "pro";
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "minimal" || saved === "pro") return saved;
  } catch {
    // 저장소가 막혔다 — 기본값으로.
  }
  return window.matchMedia?.(PHONE).matches ? "minimal" : "pro";
}

export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>("pro");
  // 첫 렌더는 서버와 같게(`pro`) 두고, 브라우저에 붙은 뒤 폰·저장값을 반영한다 — 어긋난 렌더 경고를 피한다.
  useEffect(() => setModeState(initial()), []);
  const setMode = useCallback((m: ViewMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      // 기억만 못 한다. 지금 화면은 바뀐다.
    }
  }, []);
  return [mode, setMode];
}

export function ModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="ui-ranges" role="tablist" aria-label="보기">
      {(["minimal", "pro"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          className={`ui-range${mode === m ? " is-on" : ""}`}
          onClick={() => onChange(m)}
        >
          {m === "minimal" ? "미니멀" : "프로"}
        </button>
      ))}
    </div>
  );
}

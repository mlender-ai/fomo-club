/**
 * 상태 알약 (UI-01 D · E).
 *
 * 배경 연하게 + 글자 진하게. `radius 999 · 위아래 3 좌우 10`.
 *
 * **색이 곧 의미다:**
 *
 * | 톤 | 쓰는 곳 |
 * |---|---|
 * | `up` · `dn` | **손익에만.** 상태 표시에 쓰지 않는다(UI-01 A-2) |
 * | `warn` | 보류 · 표본 부족 · 끊김 |
 * | `blue` | 선택됨 · 내 것 |
 * | `mute` | 그 외 전부 — 정지 · 제외 · 판단 불가 |
 */
import type { ReactNode } from "react";

export type PillTone = "up" | "dn" | "warn" | "blue" | "mute";

export function Pill({
  tone = "mute",
  children,
  dot = false,
}: {
  tone?: PillTone;
  children: ReactNode;
  /** 앞에 점 하나. 운용중 표시처럼 색이 상태를 뜻해야 할 때만. */
  dot?: boolean;
}) {
  return (
    <span className={`ui-pill is-${tone}`}>
      {dot ? <span className="ui-pill-dot" aria-hidden /> : null}
      {children}
    </span>
  );
}

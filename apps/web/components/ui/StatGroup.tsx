/**
 * 가로 통계 칸 묶음 (UI-01 D · E).
 *
 * `radius 16 · 칸 사이 1px line`. 칸마다 라벨 하나 값 하나.
 *
 * **값이 없으면 `—` 가 온다.** `0` 으로 채우지 않는다 — 0 은 측정된 값이고,
 * 모른다는 것과 다르다.
 */
import type { ReactNode } from "react";

export interface Stat {
  label: string;
  value: ReactNode;
  /** 값 아래 한 줄. 표본 수 · 기준 같은 것. */
  note?: ReactNode;
  tone?: "up" | "dn" | "mute";
}

export function StatGroup({ stats }: { stats: Stat[] }) {
  return (
    <dl className="ui-stats">
      {stats.map((s) => (
        <div key={s.label} className="ui-stat">
          <dt className="ui-stat-label">{s.label}</dt>
          <dd className={`ui-stat-value is-${s.tone ?? "mute"}`}>{s.value}</dd>
          {s.note ? <p className="ui-stat-note">{s.note}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * 표 (UI-05 A-3 · B-4).
 *
 * ## 폰에서는 가로로 민다
 *
 * 열 12개를 390px 에 욱여넣으면 글자가 세로로 쪼개진다(UI-FIX B-1 이 전략 행에서 겪은 그대로).
 * **줄이지 않고 민다** — 표를 감싼 칸이 가로 스크롤을 갖고, 첫 열(이름)은 붙어 있다.
 * 글자를 작게 만들어 넣지 않는다(UI-FIX 하지 말 것).
 *
 * 숫자 열은 오른쪽 정렬 · 고정폭 숫자(`tabular-nums`). 색은 부르는 쪽이 셀에 준다 —
 * 손익이 아닌 값(샤프·배수)에 색을 칠하지 않는다(UI-01 A-2).
 */
import type { ReactNode } from "react";

export interface Column {
  key: string;
  label: string;
  /** 숫자 열 — 오른쪽 정렬. */
  numeric?: boolean;
}

export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: Column[];
  /** 행마다 `key` 와 열 키별 셀. */
  rows: ({ key: string } & Record<string, ReactNode>)[];
  /** 스크린 리더용 표 제목. */
  caption?: string;
}) {
  return (
    <div className="ui-table-scroll" role="region" aria-label={caption ?? "표"} tabIndex={0}>
      <table className="ui-table">
        {caption ? <caption className="sh-sr">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? "is-num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {columns.map((c, i) =>
                i === 0 ? (
                  <th key={c.key} scope="row">
                    {r[c.key]}
                  </th>
                ) : (
                  <td key={c.key} className={c.numeric ? "is-num" : undefined}>
                    {r[c.key]}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

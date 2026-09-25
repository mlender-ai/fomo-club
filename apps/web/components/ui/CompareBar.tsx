/**
 * 비교 막대 — 이름 · 막대 · 값 (UI-01 E).
 *
 * ## 기준선이 항상 보인다
 *
 * `LAB-00 §7` — **벤치마크를 항상 옆에 둔다. +30%가 좋은지 모르기 때문이다.**
 * 그래서 이 부품은 기준선을 옵션으로 두지 않는다. 기준값을 받으면 막대 위에
 * 세로선을 긋고, 기준을 넘지 못한 막대는 **강조하지 않는다.**
 */
export interface CompareItem {
  label: string;
  value: number;
  /** 화면에 그대로 나갈 문자열. 포맷은 부르는 쪽이 정한다. */
  display: string;
  /** 기준선 자신인가. 그러면 회색으로 깔린다. */
  isBaseline?: boolean;
  /**
   * 값에 손익 색을 줄 것인가.
   *
   * **기본은 색 없음이다.** `초록·빨강은 손익에만`(UI-01 A-2) 이라, C/M·샤프처럼
   * 손익이 아닌 값에 자동으로 색을 칠하면 규칙이 깨진다. 처음에 부호로 색을
   * 정하게 짰다가 C/M `0.70` 이 초록으로 나왔다 — 그건 이익이 아니다.
   */
  tone?: "up" | "dn";
  note?: string;
  /**
   * 이 막대가 자기 기준선을 넘었나. 주면 공통 `baseline` 대신 이걸 쓴다 — 트랙마다 기간이 달라
   * 기준선도 다를 때(UI-FIX B-4). `null` 은 잴 수 없다는 뜻이다.
   */
  beats?: boolean | null;
}

export function CompareBar({
  items,
  baseline,
  underTone = "mute",
}: {
  items: CompareItem[];
  /** 기준값. 이 선을 넘은 막대만 파랗다. */
  baseline?: number | null;
  /**
   * 기준을 넘지 못한 막대의 색. 기본은 회색(강조하지 않는다). Overview 전략 경쟁은 **빨강**이다 —
   * UI-04 H 가 "진 전략 빨강" 으로 정했다. 여기서 빨강은 손익(진 것)을 뜻한다.
   */
  underTone?: "mute" | "dn";
}) {
  // 음수도 오므로 0 이 아니라 **최소·최대**로 축을 잡는다. 0 기준으로 그리면
  // 전부 음수일 때 막대가 하나도 안 보인다.
  const values = items.map((i) => i.value);
  const lo = Math.min(0, ...values, baseline ?? 0);
  const hi = Math.max(0, ...values, baseline ?? 0);
  const span = hi - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;

  return (
    <ul className="ui-compare">
      {items.map((item) => {
        const beats =
          item.beats !== undefined
            ? item.beats === true
            : baseline === null || baseline === undefined || item.value > baseline;
        const zero = at(0);
        const here = at(item.value);
        const left = Math.min(zero, here);
        const width = Math.abs(here - zero);
        return (
          <li key={item.label} className="ui-compare-row">
            <span className="ui-compare-label">{item.label}</span>
            <span className="ui-compare-track">
              {baseline !== null && baseline !== undefined ? (
                <span className="ui-compare-baseline" style={{ left: `${at(baseline)}%` }} aria-hidden />
              ) : null}
              <span
                className={`ui-compare-fill${item.isBaseline ? " is-baseline" : beats ? " is-beat" : underTone === "dn" ? " is-lost" : " is-under"}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </span>
            <span className={`ui-compare-value${item.tone ? ` is-${item.tone}` : ""}`}>
              {item.display}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

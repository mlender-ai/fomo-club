/**
 * 가격 레일 (UI-06 A-2 · B-3) — `무효화 ← 현재 → 익절1`.
 *
 * ```
 * ●━━━━━━━━━━━━━○━━━━━━━━━━━━━━━━━━━━━━━━●
 * 무효 0.5698     현재 0.6158             익절 0.7791
 * ```
 *
 * 왼쪽 끝이 무효화 — 부분 익절 뒤 옮겨졌으면 지금 걸린 손절(빨강 구간), 오른쪽 끝이 익절(초록 구간), 둘 사이의 경계는 **진입가**다 — 진입가보다
 * 무효화 쪽에 있으면 잃고 있고, 익절 쪽에 있으면 벌고 있다. 현재 점은 흰 원 + 파랑 테두리.
 * 좌표는 서버가 준다(`lib/lab/positions.ts` `railOf`) — 이 부품은 그리기만 한다.
 */
import { price } from "./format";

export function PriceRail({
  rail,
  mark,
  takeProfit,
  size = "full",
}: {
  rail: { mark: number; entry: number | null; beyond: "invalidation" | "take_profit" | null; left: number; moved: boolean };
  mark: number | null;
  takeProfit: number | null;
  /** `card` — 목록 카드 안의 작은 레일(A-2). `full` — 상세(B-3), 높이 8. */
  size?: "card" | "full";
}) {
  const split = rail.entry ?? rail.mark;
  // 부분 익절 뒤 FCE 가 손절을 본전으로 올리면 왼쪽 끝은 무효화가 아니라 **손절**이다.
  const leftKey = rail.moved ? "손절" : "무효";
  return (
    <div className={`ui-rail is-${size}`}>
      <div
        className="ui-rail-bar"
        role="img"
        aria-label={`${leftKey} ${price(rail.left)} · 현재 ${price(mark)} · 익절 ${price(takeProfit)}`}
      >
        <span className="ui-rail-loss" style={{ width: `${split * 100}%` }} />
        <span className="ui-rail-gain" style={{ left: `${split * 100}%`, width: `${(1 - split) * 100}%` }} />
        {rail.entry !== null ? <span className="ui-rail-entry" style={{ left: `${rail.entry * 100}%` }} /> : null}
        <span className={`ui-rail-mark${rail.beyond ? " is-beyond" : ""}`} style={{ left: `${rail.mark * 100}%` }} />
      </div>
      <div className="ui-rail-labels">
        <span className="ui-rail-inv">
          <span className="ui-rail-key">{leftKey}</span> {price(rail.left)}
        </span>
        <span className="ui-rail-now">
          <span className="ui-rail-key">현재</span> {price(mark)}
        </span>
        <span className="ui-rail-tp">
          <span className="ui-rail-key">익절</span> {price(takeProfit)}
        </span>
      </div>
    </div>
  );
}

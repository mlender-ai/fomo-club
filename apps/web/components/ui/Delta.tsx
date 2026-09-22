/**
 * 변동 — 금액 + 알약(%) + 기간 (UI-01 E).
 *
 * hero 아래에 붙어 "얼마가 어느 기간에 움직였나" 를 한 줄로 말한다.
 * 퍼센트만 있고 금액이 없으면 규모를 모르고, 금액만 있고 기간이 없으면
 * 그게 하루치인지 두 달치인지 모른다. **셋이 같이 있어야 뜻이 선다.**
 */
import { money, pct, tone } from "./format";
import { Pill } from "./Pill";

export function Delta({
  amount,
  percent,
  currency = "USD",
  period,
}: {
  amount: number | null;
  percent: number | null;
  currency?: string;
  /** `오늘` · `최근 7일` 처럼. 없으면 안 쓴다 — **지어내지 않는다.** */
  period?: string;
}) {
  const t = tone(percent ?? amount);
  return (
    <p className="ui-delta">
      <span className={`ui-delta-amount is-${t}`}>{money(amount, currency)}</span>
      <Pill tone={t}>{pct(percent)}</Pill>
      {period ? <span className="ui-delta-period">{period}</span> : null}
    </p>
  );
}

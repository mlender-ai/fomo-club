/**
 * 자산 행 — 아이콘 · 이름/부제 · 추이 · 값/부값 · 변동 · 상태 (UI-01 E).
 *
 * Coinbase 의 자산 리스트 행이 출발점이다. 한 줄이 한 트랙의 전부를 말한다.
 *
 * ## 부값이 왜 있나
 *
 * 트랙 합산이 `$10,000` 환산이라(UI-02 C-2), 행에 뜨는 큰 값은 **환산값**이다.
 * 원래 금액(`348.68 USDT`)을 작게 같이 적지 않으면 화면이 실제 잔고를 속인다.
 *
 * ## 좁아지면 무엇부터 숨나
 *
 * 추이선 → 부제 순으로 숨는다. **값과 변동은 끝까지 남는다** — 그게 이 행의 답이다.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { Sparkline } from "./Sparkline";

export function AssetRow({
  icon,
  name,
  subtitle,
  spark,
  sparkTone,
  value,
  subValue,
  change,
  status,
  href,
}: {
  /** 글자 한두 개. 이미지가 없어도 행이 성립해야 한다. */
  icon?: ReactNode;
  name: string;
  subtitle?: ReactNode;
  spark?: { value: number | null }[];
  sparkTone?: "up" | "dn" | "mute";
  value: ReactNode;
  /** 원래 금액. 환산값 아래 작게. */
  subValue?: ReactNode;
  change?: ReactNode;
  status?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="ui-row-icon" aria-hidden>
        {icon ?? name.slice(0, 1)}
      </span>
      <span className="ui-row-name">
        <span className="ui-row-title">{name}</span>
        {subtitle ? <span className="ui-row-sub">{subtitle}</span> : null}
      </span>
      <span className="ui-row-spark">
        {/* `exactOptionalPropertyTypes` — `tone` 에 undefined 를 넘기지 않는다. */}
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} {...(sparkTone ? { tone: sparkTone } : {})} />
        ) : null}
      </span>
      <span className="ui-row-value">
        <span className="ui-row-amount">{value}</span>
        {subValue ? <span className="ui-row-subamount">{subValue}</span> : null}
      </span>
      <span className="ui-row-change">{change}</span>
      <span className="ui-row-status">{status}</span>
    </>
  );

  return (
    <li className="ui-row">
      {href ? (
        <Link className="ui-row-link" href={href}>
          {body}
        </Link>
      ) : (
        <span className="ui-row-link">{body}</span>
      )}
    </li>
  );
}

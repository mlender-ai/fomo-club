/**
 * 화면의 주인 (UI-00 §4-2 · UI-01 B-2).
 *
 * **화면당 하나만 쓴다.** 두 개를 놓으면 어느 쪽이 답인지 화면이 말을 못 한다.
 *
 * | 화면 | 여기 들어갈 숫자 |
 * |---|---|
 * | Overview | 총 자산 |
 * | 전략 | 1위 전략의 수익/낙폭 (또는 "기준선 넘은 전략 없음") |
 * | 포지션 | 미실현 손익 합계 |
 * | 고래 | 갭 |
 * | 연구 | 열린 질문 수 |
 * | 복기 | 누적 실현 손익 |
 */
import type { ReactNode } from "react";

export function Hero({
  label,
  value,
  delta,
  meta,
}: {
  /** 숫자 위 한 줄. `트랙당 $10,000 환산` 처럼 **어떻게 잰 값인지**를 적는다. */
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  /** 숫자 아래 보조 설명. 한계·기준 시각 같은 것. */
  meta?: ReactNode;
}) {
  return (
    <header className="ui-hero">
      <p className="ui-hero-label">{label}</p>
      <p className="ui-hero-value">{value}</p>
      {delta}
      {meta ? <p className="ui-hero-meta">{meta}</p> : null}
    </header>
  );
}

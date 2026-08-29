"use client";

/**
 * F형 그림 — **보유 비중 게이지 하나**(WO-RESET-07 §B-4).
 *
 * ## 왜 게이지 하나인가
 *
 * 인물 카드가 말하는 것은 "그 사람 포트폴리오에서 이 종목이 얼마나 되나" 다. 막대 여러 개도
 * 선도 필요 없다 — 0에서 지금 비중까지 채워진 칸 하나면 그 사실이 전부 보인다.
 *
 * 신규 매수면 회색 구간이 없고, 전량 매도면 **채워진 부분이 회색**이다(이제 0이다).
 * 늘림·줄임이면 직전까지가 회색, 늘어난 만큼이 라임이다 — accent 는 언제나
 * **"이번에 무슨 일이 벌어졌는가"** 를 가리킨다(다른 형과 같은 규칙).
 */
export function WeightGauge({
  weightPct,
  priorWeightPct,
  maxPct,
  caption,
  height = 10,
}: {
  weightPct: number;
  priorWeightPct: number;
  maxPct?: number;
  caption: string;
  height?: number;
}) {
  /**
   * 눈금 끝 — 이 사람 포트폴리오의 최대 비중. 그게 없으면 지금·직전 중 큰 값에 여유를 준다.
   * 눈금을 100%로 두면 1.2% 짜리 보유가 **보이지 않는 선**이 된다.
   */
  const scale = Math.max(maxPct ?? 0, weightPct, priorWeightPct) * 1.1;
  if (!(scale > 0)) return null;

  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`;
  const exited = weightPct <= 0 && priorWeightPct > 0;
  // 회색 = 직전까지 있던 것, 라임 = 이번에 늘어난 것. 전량 매도는 전부 회색이다.
  const grey = exited ? priorWeightPct : Math.min(priorWeightPct, weightPct);
  const lime = exited ? 0 : Math.max(0, weightPct - priorWeightPct);

  return (
    <div data-testid="weight-gauge">
      <div className="flex overflow-hidden rounded-[2px] bg-ds-chart-bar/40" style={{ height }} aria-hidden>
        <span className="bg-ds-chart-bar" style={{ width: pct(grey) }} />
        <span className="bg-ds-accent" style={{ width: pct(lime) }} />
      </div>
      <p className="mt-s2 font-mono text-ds-legend text-ds-text-2">{caption}</p>
    </div>
  );
}

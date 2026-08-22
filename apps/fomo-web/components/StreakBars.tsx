"use client";

/**
 * C형 희소성 막대 — WO-HOOK-01 §6-2.
 *
 * 회색 막대가 죽 늘어선 사이에서 라임 몇 개가 **붙어 있는 것**이 "이례적"의 시각화다.
 * 숫자로 "40거래일 중 최장"이라고 말하는 것보다, 빈 벌판에 뭉친 덩어리를 보여주는 쪽이 빠르다.
 *
 * 막대는 flex 로 균등 분배한다 — 40개면 320px 카드(내용폭 288)에서 각 약 4.2px 이고,
 * WO §6-2 가 예상한 4~5px 과 같다. 개수를 줄이지 않아도 되는 이유가 이것이다.
 */
export function StreakBars({
  buyDays,
  streakFrom,
  streakTo,
  actor,
  height = 46,
}: {
  buyDays: boolean[];
  streakFrom: number;
  streakTo: number;
  actor: string;
  height?: number;
}) {
  if (buyDays.length === 0) return null;

  return (
    <div data-testid="streak-bars">
      <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden>
        {buyDays.map((bought, i) => {
          const inStreak = i >= streakFrom && i <= streakTo;
          return (
            <span
              key={i}
              className={`min-w-0 flex-1 rounded-[1px] ${inStreak ? "bg-ds-accent" : "bg-ds-chart-bar"}`}
              /*
               * 매수일은 꽉 찬 높이, 미매수일은 낮은 그루터기. 미매수일을 아예 지우면 배경이
               * 사라져 "드물다"의 기준선이 없어진다 — 무엇 사이에서 드문지가 안 보인다.
               */
              style={{ height: bought ? height : Math.round(height * 0.28) }}
            />
          );
        })}
      </div>
      <p className="mt-s2 font-mono text-ds-legend text-ds-text-2">
        {`최근 ${buyDays.length}거래일 ${actor} 매수일`}
      </p>
    </div>
  );
}

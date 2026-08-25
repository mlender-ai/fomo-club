"use client";

/**
 * E형 그림 — 거래량 막대. **급증 구간만 accent**(WO-RESET-03 A-6 · D-4).
 *
 * ## 왜 C형(연속 막대)을 재사용하지 않았나
 *
 * `StreakBars` 는 **있었나 없었나**를 그린다(높이가 둘뿐). 여기서 보여줘야 하는 것은
 * **얼마나 늘었나**라서 높이가 값에 비례해야 한다 — 그래야 마지막 막대가 앞의 것들보다
 * 몇 배인지 눈으로 보인다. 그게 이 카드의 전부다.
 *
 * ## accent 규칙은 그대로다
 *
 * 세 형과 같다 — **accent 는 언제나 "지금 무슨 일이 벌어지고 있는가"** 를 가리키고,
 * 그림 아래 mono 캡션 한 줄이 그것을 설명한다.
 */
export function VolumeBars({
  volumes,
  spikeFrom,
  baseDays,
  height = 46,
}: {
  volumes: number[];
  /** 이 인덱스부터 끝까지 accent. */
  spikeFrom: number;
  baseDays: number;
  height?: number;
}) {
  if (volumes.length < 2) return null;
  const max = Math.max(...volumes);
  if (!(max > 0)) return null;

  /**
   * 막대가 너무 많으면(60일) 폭이 1px 아래로 내려가 뭉갠다. 뒤에서 40개만 남긴다 —
   * **최근이 남아야** 급증이 보인다. 잘린 만큼 `spikeFrom` 도 옮긴다.
   */
  const MAX_BARS = 40;
  const offset = Math.max(0, volumes.length - MAX_BARS);
  const shown = volumes.slice(offset);
  const spike = spikeFrom - offset;

  return (
    <div data-testid="volume-bars">
      <div className="flex items-end gap-[2px]" style={{ height }} aria-hidden>
        {shown.map((v, i) => (
          <span
            key={i}
            className={`min-w-0 flex-1 rounded-[1px] ${i >= spike ? "bg-ds-accent" : "bg-ds-chart-bar"}`}
            // 최소 높이 2px — 0 에 가까운 날도 막대가 있어야 "그날도 거래일이었다" 가 보인다.
            style={{ height: Math.max(2, Math.round((v / max) * height)) }}
          />
        ))}
      </div>
      <p className="mt-s2 font-mono text-ds-legend text-ds-text-2">
        {`최근 ${baseDays}거래일 거래량`}
      </p>
    </div>
  );
}

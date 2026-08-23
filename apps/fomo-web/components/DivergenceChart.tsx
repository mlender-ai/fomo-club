"use client";

/**
 * A형 역행 차트 — WO-HOOK-01 §4-2. **이 배치의 핵심 산출물이다.**
 *
 * 주가선과 매수 누적선을 겹쳐 그린다. 두 선이 벌어진 폭이 이 제품 전체를 한 장으로 설명한다:
 * *주가는 안 움직이는데 안에서는 사고 있다.* 말이 필요 없다.
 *
 * ## 두 선을 각자 정규화한다
 *
 * 단위가 다르다(원/달러 vs 주식수/달러). 같은 축에 두면 한 선이 바닥에 눌려 사라진다.
 * 그래서 각 계열을 자기 min–max 로 0~1 에 편다. **y축 라벨을 쓰지 않는 이유가 이것이다** —
 * 눈금을 붙이면 두 선을 비교 가능한 양으로 읽게 되는데, 비교 가능한 것은 *방향*뿐이다.
 *
 * ## 평평한 계열
 *
 * 주가가 완전히 평평한 것은 **A형이 가장 원하는 그림**이다(`주가는 제자리인데`). min===max 면
 * 0 으로 나누게 되므로 그때는 중앙 높이의 직선으로 그린다 — 버리지 않는다.
 */

/** DS-00 §2 + WO §4-2. SVG stroke 라 CSS 클래스 대신 값으로 쓴다(Sparkline 과 같은 규약). */
const PRICE_LINE = "#4A4A48";
const BUY_LINE = "#D4FF3F";

const VIEW_W = 280;
const PAD_X = 2;
const PAD_Y = 5;

/** 계열 → 0(아래)~1(위) 정규화. 평평하면 전부 0.5. */
function normalize(series: readonly number[]): number[] {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;
  if (!(range > 0)) return series.map(() => 0.5);
  return series.map((v) => (v - min) / range);
}

function pathOf(series: readonly number[], height: number): string {
  const norm = normalize(series);
  const span = norm.length > 1 ? norm.length - 1 : 1;
  return norm
    .map((v, i) => {
      const x = PAD_X + (i / span) * (VIEW_W - 2 * PAD_X);
      const y = PAD_Y + (1 - v) * (height - 2 * PAD_Y);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function endPoint(series: readonly number[], height: number): { x: number; y: number } {
  const norm = normalize(series);
  const last = norm.at(-1) ?? 0.5;
  return { x: VIEW_W - PAD_X, y: PAD_Y + (1 - last) * (height - 2 * PAD_Y) };
}

export function DivergenceChart({
  priceSeries,
  buySeries,
  buyLegend,
  height = 76,
}: {
  priceSeries: number[];
  buySeries: number[];
  buyLegend: string;
  height?: number;
}) {
  // 두 계열의 길이가 어긋나면 x축이 어긋나 갭이 거짓이 된다 — 그릴 바에 안 그린다.
  if (priceSeries.length < 2 || priceSeries.length !== buySeries.length) return null;

  const end = endPoint(buySeries, height);

  return (
    <div data-testid="divergence-chart">
      {/*
        끝점 원은 SVG 밖에 둔다. 선은 `preserveAspectRatio="none"` 로 가로를 늘여 그리는데,
        같은 SVG 안의 <circle> 은 그 늘임을 같이 받아 **타원이 된다**. 컨테이너를 기준으로
        얹으면 카드 폭이 320px 이든 400px 이든 정원을 유지한다.
      */}
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          aria-hidden
          className="block"
        >
          <path d={pathOf(priceSeries, height)} fill="none" stroke={PRICE_LINE} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <path d={pathOf(buySeries, height)} fill="none" stroke={BUY_LINE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <span
          className="absolute block rounded-full bg-ds-accent"
          style={{ width: 7, height: 7, right: 0, top: end.y - 3.5 }}
          aria-hidden
        />
      </div>
      {/* 범례 — 어느 선이 무엇인지 말하지 않으면 두 선은 그냥 낙서다. */}
      <div className="mt-s2 flex items-center gap-s3 font-mono text-ds-legend text-ds-text-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[1.5px] w-3 shrink-0" style={{ backgroundColor: PRICE_LINE }} aria-hidden />
          주가
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2.5px] w-3 shrink-0" style={{ backgroundColor: BUY_LINE }} aria-hidden />
          {buyLegend}
        </span>
      </div>
    </div>
  );
}

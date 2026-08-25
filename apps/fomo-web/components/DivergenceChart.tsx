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

/**
 * 주가선 기준 진폭(%) — 이보다 작게 움직인 창은 **높이를 덜 쓴다.**
 *
 * ## 왜 필요한가 (2026-08-25)
 *
 * `normalize` 는 계열의 min→0, max→1 로 늘린다. 그래서 **1% 움직인 주가도 산맥처럼 보인다.**
 * 카드가 `주가는 제자리인데` 라고 말하는 동안 그림은 요동치니, 사용자가 "딱 봐도 차트가
 * 움직이는데 뭔 주가가 제자리냐" 고 한 것이 맞다. 훅을 그린 창에 맞춘 것과 **짝이 되는 수정**이다 —
 * 문장이 맞아도 그림이 과장하면 여전히 거짓말로 읽힌다.
 *
 * 20%: 실측(2026-08-25 A형 3장)에서 창 12일 진폭이 8.0 · 11.6 · 15.0% 였다. 그 위를 기준으로
 * 잡아 관측 범위 전체가 높이에 비례해 들어오게 한다. 진폭 2%(정체 밴드)면 높이의 10%만 쓴다.
 *
 * **누적선에는 쓰지 않는다.** 그 선은 단위가 없고 형태(꾸준히 오르는가)만 읽으므로 늘려도 거짓이
 * 아니다. 주가선만 크기를 지킨다.
 */
const PRICE_FULL_HEIGHT_AMPLITUDE_PCT = 20;

/**
 * 주가선 정규화 — 진폭이 작으면 세로를 덜 쓰고 가운데로 모은다.
 * 진폭이 기준 이상이면 `normalize` 와 같다(높이를 다 쓴다).
 */
function normalizePrice(series: readonly number[]): number[] {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;
  if (!(range > 0) || !(min > 0)) return series.map(() => 0.5);
  const amplitudePct = (range / min) * 100;
  const scale = Math.min(1, amplitudePct / PRICE_FULL_HEIGHT_AMPLITUDE_PCT);
  // 0..1 로 편 뒤 가운데(0.5) 기준으로 축소한다 — 위아래 여백이 균등해야 눌린 것으로 읽힌다.
  return series.map((v) => 0.5 + ((v - min) / range - 0.5) * scale);
}

function pathOf(norm: readonly number[], height: number): string {
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
  priceLegend = "주가",
  height = 76,
  invalidation,
}: {
  priceSeries: number[];
  buySeries: number[];
  buyLegend: string;
  /**
   * 회색선 범례. 기본은 `주가`(A형: 주가 vs 매수 누적).
   * D형(시장 역행)에서는 회색이 **지수**라서 `코스피` 처럼 바꿔 넘긴다 — 안 바꾸면
   * 범례가 `주가 / 이 종목` 이 되어 둘 다 주가인 것처럼 읽힌다(실측).
   */
  priceLegend?: string;
  height?: number;
  /**
   * 되돌아보는 선(무효선) 가격. 상세에서만 넘긴다 — 카드는 한 장면에 놀라움 하나다.
   *
   * 종전에는 상세에 차트가 둘이었다(역행 차트 + 260거래일 차트). 점선은 뒤쪽 차트에 있었다.
   * WO-RESET-01 B-4 로 260거래일 차트를 없애면서 점선을 **이쪽으로 옮겼다.**
   * 주가선과 **같은 축**에 있어야 의미가 있으므로 주가 정규화 규칙을 그대로 쓴다.
   */
  invalidation?: number | null;
}) {
  // 두 계열의 길이가 어긋나면 x축이 어긋나 갭이 거짓이 된다 — 그릴 바에 안 그린다.
  if (priceSeries.length < 2 || priceSeries.length !== buySeries.length) return null;

  const end = endPoint(buySeries, height);

  /**
   * 되돌아보는 선 — **주가선과 같은 축**에 얹는다(B-4).
   * 주가선이 `normalizePrice` 로 축소돼 있으므로 무효선도 같은 변환을 거쳐야 위치가 맞다.
   * 그래서 무효선을 계열에 끼워 함께 정규화한 뒤 그 값만 꺼낸다 — 계산을 두 벌 두지 않는다.
   */
  const invY = (() => {
    if (typeof invalidation !== "number" || !(invalidation > 0)) return null;
    const withInv = normalizePrice([...priceSeries, invalidation]);
    const v = withInv.at(-1);
    if (typeof v !== "number") return null;
    return PAD_Y + (1 - v) * (height - 2 * PAD_Y);
  })();

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
          {invY !== null && (
            <line
              x1={PAD_X}
              x2={VIEW_W - PAD_X}
              y1={invY}
              y2={invY}
              stroke="#5A5A57"
              strokeDasharray="4 4"
              strokeWidth={0.75}
              data-testid="divergence-invalidation"
            />
          )}
          {/* 주가선은 **크기를 지킨다**(작게 움직였으면 작게 그린다). 누적선은 형태만 읽으므로 높이를 다 쓴다. */}
          <path d={pathOf(normalizePrice(priceSeries), height)} fill="none" stroke={PRICE_LINE} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <path d={pathOf(normalize(buySeries), height)} fill="none" stroke={BUY_LINE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
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
          {priceLegend}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2.5px] w-3 shrink-0" style={{ backgroundColor: BUY_LINE }} aria-hidden />
          {buyLegend}
        </span>
        {invY !== null && <span className="text-ds-text-3">점선은 되돌아보는 선</span>}
      </div>
    </div>
  );
}

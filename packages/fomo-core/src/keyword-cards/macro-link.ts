/**
 * WO-RESET-09 — **거시 지표와 우리 종목의 연결.** 순수 함수(네트워크·시간·난수 0).
 *
 * ## 뉴스를 그냥 나열하지 않는다
 *
 * 속보로는 뉴스 앱을 못 이긴다. 우리가 할 수 있는 건 하나다 —
 * **이 숫자가 우리가 짚었던 종목과 무슨 관계인가.**
 *
 * ```
 * 안 됨   환율이 1,438원을 넘었습니다
 * 좋음    환율이 3일째 오르고 있어요
 *         우리가 짚은 종목 중 4곳이 수출 비중이 높은 업종이에요
 * ```
 *
 * 마지막 줄이 이 카드의 전부다. 환율 숫자는 어디에나 있지만 **"우리가 짚은 종목 중 4곳"**
 * 은 우리만 말할 수 있다. 그래서 **연결되는 종목이 2곳 미만이면 카드를 만들지 않는다.**
 *
 * ## 예측하지 않는다 (§F-1)
 *
 * ```
 * 안 됨   환율이 오르면 이 종목이 오를 거예요
 * 좋음    환율이 오르면 수출하는 회사에 유리해요 · 이 업종은 수출 비중이 높아요
 * ```
 *
 * **일반 원리와 사실만** 말한다. 이 종목이 어떻게 될지는 말하지 않는다.
 *
 * ## 업종 감응도는 회사별 실측이 아니다
 *
 * 수출 비중·원자재 의존도를 회사별로 갖고 있지 않다. 그래서 **업종 수준의 일반 원리**만
 * 쓴다 — `이 업종은 수출 비중이 높아요`이지 `이 회사는`이 아니다. 아는 것만 말한다.
 */

/** 우리가 다루는 거시 지표. */
export type MacroIndicatorId = "usdkrw" | "oil" | "ust10y" | "fedfunds" | "vix";

export interface MacroIndicator {
  id: MacroIndicatorId;
  /** 화면 이름 — `원달러 환율`. */
  name: string;
  /** 값 표기 — `1,438원` / `$83.9` / `4.67%`. */
  unit: "krw" | "usd" | "percent" | "point";
  /** 이만큼 움직여야 카드가 된다(%). 지표마다 평소 변동폭이 다르다. */
  movePct: number;
}

/**
 * 지표별 임계 — 평소 변동폭이 다르므로 하나로 둘 수 없다.
 *
 * **잠정값이다.** 실측 분포를 보고 확정한다(WO-RESET-04 에서 배운 규칙). 환율이 3일에 1.5%
 * 움직이는 것과 VIX 가 1.5% 움직이는 것은 전혀 다른 사건이다.
 */
export const MACRO_INDICATORS: readonly MacroIndicator[] = [
  { id: "usdkrw", name: "원달러 환율", unit: "krw", movePct: 1.5 },
  { id: "oil", name: "국제 유가", unit: "usd", movePct: 5 },
  { id: "ust10y", name: "미 국채 10년 금리", unit: "percent", movePct: 5 },
  { id: "fedfunds", name: "미 기준금리", unit: "percent", movePct: 3 },
  { id: "vix", name: "변동성 지수", unit: "point", movePct: 20 },
];

/** 지표가 우리 업종에 어떻게 닿는가 — **일반 원리**다. 회사별 실측이 아니다. */
export interface SectorSensitivity {
  /** 오를 때 유리한 업종(일반적으로). */
  upFavors: readonly string[];
  /** 오를 때 불리한 업종(일반적으로). */
  upHurts: readonly string[];
  /** 오를 때 화면에 쓸 설명 — 예측이 아니라 원리다. */
  upText: string;
  downText: string;
}

/**
 * 업종 이름은 **네이버 산업분류 그대로**다(`sector-map` 이 모은 것). 임의로 만들지 않는다 —
 * 우리 분류표에 없는 이름을 적으면 영영 연결이 안 된다.
 */
export const MACRO_SENSITIVITY: Record<MacroIndicatorId, SectorSensitivity> = {
  usdkrw: {
    upFavors: ["반도체와반도체장비", "자동차", "자동차부품", "조선", "전자장비와기기", "디스플레이및관련부품", "기계"],
    upHurts: ["항공사", "호텔,레스토랑,레저", "석유와가스", "전기유틸리티", "식품"],
    upText: "환율이 오르면 수출하는 회사에 유리하고, 원자재나 연료를 수입하는 회사에 불리해요",
    downText: "환율이 내리면 수입하는 회사에 유리하고, 수출하는 회사에 불리해요",
  },
  oil: {
    upFavors: ["석유와가스", "에너지장비및서비스", "조선"],
    upHurts: ["항공사", "화학", "운송인프라", "육상운송"],
    upText: "유가가 오르면 에너지 회사에 유리하고, 연료를 많이 쓰는 회사에 불리해요",
    downText: "유가가 내리면 연료를 많이 쓰는 회사에 유리하고, 에너지 회사에 불리해요",
  },
  ust10y: {
    upFavors: ["은행", "생명보험", "손해보험", "증권"],
    upHurts: ["건설", "부동산", "소프트웨어", "인터넷서비스", "생물공학"],
    upText: "금리가 오르면 예대마진이 커지는 금융에 유리하고, 빚을 많이 쓰거나 먼 미래 이익을 기대받는 회사에 불리해요",
    downText: "금리가 내리면 빚을 많이 쓰는 회사에 유리하고, 예대마진이 줄어드는 금융에 불리해요",
  },
  fedfunds: {
    upFavors: ["은행", "생명보험", "손해보험"],
    upHurts: ["건설", "부동산", "소프트웨어", "생물공학"],
    upText: "기준금리가 오르면 금융에 유리하고, 빚을 많이 쓰는 회사에 불리해요",
    downText: "기준금리가 내리면 빚을 많이 쓰는 회사에 유리해요",
  },
  vix: {
    upFavors: [],
    upHurts: ["증권", "소프트웨어", "인터넷서비스", "생물공학"],
    upText: "변동성이 커지면 위험을 많이 지는 자산이 먼저 흔들려요",
    downText: "변동성이 가라앉으면 위험을 지는 자산에 숨통이 트여요",
  },
};

/** 한 지표의 최근 값들(오래된 → 최신). */
export interface MacroSeries {
  id: MacroIndicatorId;
  /** `{ date, value }` 오름차순. */
  points: ReadonlyArray<{ date: string; value: number }>;
}

export interface MacroMove {
  indicator: MacroIndicator;
  /** 며칠째 같은 방향인가. */
  streakDays: number;
  direction: "up" | "down";
  from: number;
  to: number;
  changePct: number;
  /** 그림 재료 — 최근 값들. */
  series: number[];
  /** 최신 관측일. **화면에 그대로 쓴다** — 지표는 하루이틀 늦게 나온다. */
  asOf: string;
}

/** 연속 방향이 이 일수 이상이어야 「N일째」라고 말한다. */
export const MACRO_MIN_STREAK = 3;

/** 추이선에 쓸 관측 수. */
export const MACRO_SERIES_POINTS = 20;

/**
 * 지표가 「움직였다」고 말할 수 있는가.
 *
 * 연속 방향 + 누적 변동률 둘 다 넘어야 한다. 하루 튀었다 돌아온 것은 흐름이 아니다.
 * 조건을 못 채우면 `null` — 아무 날에나 카드를 만들지 않는다.
 */
export function detectMacroMove(series: MacroSeries): MacroMove | null {
  const indicator = MACRO_INDICATORS.find((i) => i.id === series.id);
  if (!indicator) return null;
  const points = series.points.filter((p) => Number.isFinite(p.value));
  if (points.length < MACRO_MIN_STREAK + 1) return null;

  const latest = points[points.length - 1]!;
  // 최신에서 거슬러 올라가며 같은 방향이 이어진 구간을 센다.
  let streak = 0;
  let direction: "up" | "down" | null = null;
  for (let i = points.length - 1; i > 0; i -= 1) {
    const now = points[i]!.value;
    const before = points[i - 1]!.value;
    if (now === before) break;
    const step: "up" | "down" = now > before ? "up" : "down";
    if (direction === null) direction = step;
    else if (direction !== step) break;
    streak += 1;
  }
  if (!direction || streak < MACRO_MIN_STREAK) return null;

  const start = points[points.length - 1 - streak]!;
  if (!(start.value > 0)) return null;
  const changePct = ((latest.value - start.value) / start.value) * 100;
  if (Math.abs(changePct) < indicator.movePct) return null;

  return {
    indicator,
    streakDays: streak,
    direction,
    from: start.value,
    to: latest.value,
    changePct,
    series: points.slice(-MACRO_SERIES_POINTS).map((p) => p.value),
    asOf: latest.date,
  };
}

/** 우리가 최근에 짚은 종목 하나. */
export interface RecentPick {
  canonical: string;
  /** 그 종목의 업종(분류표 값). 없으면 연결할 수 없다. */
  sector?: string;
  /** 우리가 짚은 날 `YYYY-MM-DD`. 화면이 「8월 20일에 짚었어요」로 쓴다. */
  pickedAt: string;
}

export interface MacroLink {
  move: MacroMove;
  /** 이 움직임에 유리한 업종의 우리 종목. */
  favored: RecentPick[];
  /** 불리한 업종의 우리 종목. */
  hurt: RecentPick[];
  /** 화면에 쓸 일반 원리 한 줄 — **예측이 아니다**. */
  principle: string;
}

/** 카드가 되려면 연결돼야 하는 최소 종목 수(§B-3). 미만이면 그냥 뉴스다. */
export const MACRO_MIN_LINKED = 2;

/**
 * 움직임과 우리 종목을 잇는다. **2곳 미만이면 `null`** — 연결 없는 뉴스는 만들지 않는다.
 */
export function linkMacroToPicks(move: MacroMove, picks: readonly RecentPick[]): MacroLink | null {
  const sens = MACRO_SENSITIVITY[move.indicator.id];
  const up = move.direction === "up";
  const favorSet = new Set(up ? sens.upFavors : sens.upHurts);
  const hurtSet = new Set(up ? sens.upHurts : sens.upFavors);

  const favored: RecentPick[] = [];
  const hurt: RecentPick[] = [];
  for (const pick of picks) {
    if (!pick.sector) continue; // 업종을 모르면 잇지 않는다 — 억지로 연결하지 않는다
    if (favorSet.has(pick.sector)) favored.push(pick);
    else if (hurtSet.has(pick.sector)) hurt.push(pick);
  }
  if (favored.length + hurt.length < MACRO_MIN_LINKED) return null;
  return { move, favored, hurt, principle: up ? sens.upText : sens.downText };
}

/** 값 표기 — 지표 단위에 맞춘다. */
export function formatMacroValue(indicator: MacroIndicator, value: number): string {
  if (indicator.unit === "krw") return `${Math.round(value).toLocaleString("en-US")}원`;
  if (indicator.unit === "usd") return `$${value.toFixed(1)}`;
  if (indicator.unit === "percent") return `${value.toFixed(2)}%`;
  return value.toFixed(1);
}

/** 카드 결론 — **무슨 일이 벌어지고 있나**. 예측하지 않는다. */
export function macroHook(move: MacroMove): string {
  const dir = move.direction === "up" ? "오르고" : "내리고";
  return `${move.indicator.name}이\n${move.streakDays}일째 ${dir} 있어요`;
}

/** 보조 줄 — 값 변화와 연결된 종목 수. 마지막 줄이 이 카드의 존재 이유다. */
export function macroSupport(link: MacroLink): string[] {
  const { move } = link;
  const linked = link.favored.length + link.hurt.length;
  return [
    `${formatMacroValue(move.indicator, move.from)} → ${formatMacroValue(move.indicator, move.to)}`,
    `우리가 최근 짚은 종목 중 ${linked}곳이 여기 닿아요`,
  ];
}

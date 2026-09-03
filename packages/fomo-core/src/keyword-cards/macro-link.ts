/**
 * MACRO-01 · WO-RESET-09 — **거시 지표와 우리 종목의 연결.** 순수 함수(네트워크·시간·난수 0).
 *
 * ## 뉴스를 그냥 나열하지 않는다
 *
 * 속보로는 뉴스 앱을 못 이긴다. 우리가 할 수 있는 건 하나다 —
 * **이 숫자가 우리가 짚었던 종목과 무슨 관계인가.**
 *
 * ```
 * 안 됨   환율이 1,438원을 넘었습니다
 * 좋음    환율이 3일째 오르고 있어요
 *         우리가 짚은 종목 중 4곳이 여기 닿아요
 * ```
 *
 * 마지막 줄이 이 카드의 전부다. 환율 숫자는 어디에나 있지만 **"우리가 짚은 종목 중 4곳"**
 * 은 우리만 말할 수 있다. 그래서 **연결되는 종목이 2곳 미만이면 카드를 만들지 않는다.**
 *
 * ## 예측하지 않는다
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
 *
 * ## 지수는 업종으로 잇지 않는다 (MACRO-01)
 *
 * 코스피가 내렸을 때 「우리 종목 중 9곳이 여기 닿아요」라고 쓰면 그건 **국내 종목 전부**다.
 * 다 해당하는 연결은 연결이 아니다 — 아무 정보도 더하지 않는다.
 *
 * 그래서 지수는 **시장 소속**으로 잇는다. `코스닥이 3일째 내리고 있어요 · 우리가 짚은 곳
 * 중 코스닥 종목이 4곳이에요` 는 사실이고, 코스피 픽에는 안 붙는다. 미국 지수는 미국
 * 상장 픽에만 붙고, 그런 픽이 2곳 미만이면 카드가 안 나온다 — 그게 맞다.
 */

import type { MacroIndicatorId } from "./macro-indicators";
import { type MacroMove } from "./macro-move";

export * from "./macro-move";

/** 무엇으로 우리 종목과 잇나. */
export type MacroLinkMode = "sector" | "market";

/** 지표가 우리 종목에 어떻게 닿는가 — **일반 원리**다. 회사별 실측이 아니다. */
export interface SectorSensitivity {
  mode: MacroLinkMode;
  /** `sector` 모드 — 오를 때 유리한 업종(일반적으로). */
  upFavors: readonly string[];
  /** `sector` 모드 — 오를 때 불리한 업종(일반적으로). */
  upHurts: readonly string[];
  /** `market` 모드 — 이 시장에 상장된 픽에만 붙는다. */
  markets?: readonly string[];
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
    mode: "sector",
    upFavors: ["반도체와반도체장비", "자동차", "자동차부품", "조선", "전자장비와기기", "디스플레이및관련부품", "기계"],
    upHurts: ["항공사", "호텔,레스토랑,레저", "석유와가스", "전기유틸리티", "식품"],
    upText: "환율이 오르면 수출하는 회사에 유리하고, 원자재나 연료를 수입하는 회사에 불리해요",
    downText: "환율이 내리면 수입하는 회사에 유리하고, 수출하는 회사에 불리해요",
  },
  jpykrw: {
    mode: "sector",
    // 엔화가 비싸지면 일본 업체와 같은 물건을 파는 회사의 가격 경쟁력이 올라간다.
    upFavors: ["자동차", "자동차부품", "조선", "기계", "철강"],
    upHurts: ["호텔,레스토랑,레저", "항공사"],
    upText: "엔화가 비싸지면 일본 회사와 같은 물건을 파는 회사의 가격 경쟁력이 올라가요",
    downText: "엔화가 싸지면 일본 회사와 같은 물건을 파는 회사의 가격 경쟁력이 떨어져요",
  },
  ktb3y: {
    mode: "sector",
    upFavors: ["은행", "생명보험", "손해보험", "증권"],
    upHurts: ["건설", "부동산", "소프트웨어", "인터넷서비스", "생물공학"],
    upText: "금리가 오르면 예대마진이 커지는 금융에 유리하고, 빚을 많이 쓰거나 먼 미래 이익을 기대받는 회사에 불리해요",
    downText: "금리가 내리면 빚을 많이 쓰는 회사에 유리하고, 예대마진이 줄어드는 금융에 불리해요",
  },
  ust10y: {
    mode: "sector",
    upFavors: ["은행", "생명보험", "손해보험", "증권"],
    upHurts: ["건설", "부동산", "소프트웨어", "인터넷서비스", "생물공학"],
    upText: "미국 금리가 오르면 먼 미래 이익을 기대받는 회사가 먼저 눌리고, 금융에는 유리해요",
    downText: "미국 금리가 내리면 먼 미래 이익을 기대받는 회사에 숨통이 트여요",
  },
  ust2y: {
    mode: "sector",
    upFavors: ["은행", "생명보험", "손해보험"],
    upHurts: ["건설", "부동산", "소프트웨어", "생물공학"],
    upText: "짧은 금리가 오르면 당장 돈을 빌려 쓰는 회사의 이자 부담이 커져요",
    downText: "짧은 금리가 내리면 당장 돈을 빌려 쓰는 회사의 이자 부담이 줄어요",
  },
  yieldcurve: {
    mode: "sector",
    // 금리차가 벌어지면 은행은 짧게 빌려 길게 빌려주는 폭이 커진다. 좁아지면 반대다.
    upFavors: ["은행", "생명보험", "증권"],
    upHurts: [],
    upText: "장단기 금리차가 벌어지면 짧게 빌려 길게 빌려주는 회사, 그러니까 은행의 마진이 커져요",
    downText: "장단기 금리차가 좁아지면 짧게 빌려 길게 빌려주는 회사, 그러니까 은행의 마진이 줄어요",
  },
  corp3y: {
    mode: "sector",
    upFavors: ["은행", "증권"],
    upHurts: ["건설", "부동산", "조선", "기계"],
    upText: "회사채 금리가 오르면 빚으로 사업하는 회사의 조달 비용이 커져요",
    downText: "회사채 금리가 내리면 빚으로 사업하는 회사의 조달 비용이 줄어요",
  },
  creditspread: {
    mode: "sector",
    upFavors: [],
    upHurts: ["건설", "부동산", "조선", "기계", "증권"],
    upText: "가산금리가 벌어지면 신용이 약한 회사일수록 돈 빌리기가 어려워져요",
    downText: "가산금리가 좁아지면 신용이 약한 회사도 돈 빌리기가 수월해져요",
  },
  kospi: {
    mode: "market",
    upFavors: [],
    upHurts: [],
    markets: ["KOSPI"],
    upText: "지수가 오르면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
    downText: "지수가 내리면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
  },
  kosdaq: {
    mode: "market",
    upFavors: [],
    upHurts: [],
    markets: ["KOSDAQ"],
    upText: "지수가 오르면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
    downText: "지수가 내리면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
  },
  sp500: {
    mode: "market",
    upFavors: [],
    upHurts: [],
    markets: ["NYSE", "NASDAQ", "AMEX"],
    upText: "지수가 오르면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
    downText: "지수가 내리면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
  },
  nasdaq: {
    mode: "market",
    upFavors: [],
    upHurts: [],
    markets: ["NASDAQ"],
    upText: "지수가 오르면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
    downText: "지수가 내리면 그 시장에 상장된 회사 주가도 대체로 같이 움직여요",
  },
  vix: {
    mode: "sector",
    upFavors: [],
    upHurts: ["증권", "소프트웨어", "인터넷서비스", "생물공학"],
    upText: "변동성이 커지면 위험을 많이 지는 자산이 먼저 흔들려요",
    downText: "변동성이 가라앉으면 위험을 지는 자산에 숨통이 트여요",
  },
  oil: {
    mode: "sector",
    upFavors: ["석유와가스", "에너지장비및서비스", "조선"],
    upHurts: ["항공사", "화학", "운송인프라", "육상운송"],
    upText: "유가가 오르면 에너지 회사에 유리하고, 연료를 많이 쓰는 회사에 불리해요",
    downText: "유가가 내리면 연료를 많이 쓰는 회사에 유리하고, 에너지 회사에 불리해요",
  },
  gold: {
    mode: "sector",
    upFavors: ["비철금속", "금속및광물"],
    upHurts: [],
    upText: "금값이 오르면 금을 캐거나 다루는 회사의 판매 단가가 올라가요",
    downText: "금값이 내리면 금을 캐거나 다루는 회사의 판매 단가가 내려가요",
  },
};

/** 우리가 최근에 짚은 종목 하나. */
export interface RecentPick {
  canonical: string;
  /** 그 종목의 업종(분류표 값). 없으면 업종으로는 연결할 수 없다. */
  sector?: string;
  /** 상장 시장 — `KOSPI` · `KOSDAQ` · `NASDAQ` 등. 지수 연결에 쓴다. */
  market?: string;
  /** 우리가 짚은 날 `YYYY-MM-DD`. */
  pickedAt: string;
}

export interface MacroLink {
  move: MacroMove;
  /** 이 움직임에 유리한 쪽의 우리 종목. `market` 모드에서는 그 시장 종목 전체가 여기 온다. */
  favored: RecentPick[];
  /** 불리한 쪽. `market` 모드에서는 비어 있다 — 지수는 유불리를 가르지 않는다. */
  hurt: RecentPick[];
  /** **상세에만** 쓰는 일반 원리 한 줄 — 예측이 아니다. 카드에는 넣지 않는다(§D-2). */
  principle: string;
}

/** 카드가 되려면 연결돼야 하는 최소 종목 수. 미만이면 그냥 뉴스다. */
export const MACRO_MIN_LINKED = 2;

/**
 * 움직임과 우리 종목을 잇는다. **2곳 미만이면 `null`** — 연결 없는 뉴스는 만들지 않는다.
 */
export function linkMacroToPicks(move: MacroMove, picks: readonly RecentPick[]): MacroLink | null {
  const sens = MACRO_SENSITIVITY[move.indicator.id];
  const up = move.direction === "up";
  const principle = up ? sens.upText : sens.downText;

  if (sens.mode === "market") {
    const markets = new Set(sens.markets ?? []);
    // 지수는 유불리를 가르지 않는다 — 그 시장에 있느냐 없느냐다.
    const favored = picks.filter((p) => p.market && markets.has(p.market));
    if (favored.length < MACRO_MIN_LINKED) return null;
    return { move, favored, hurt: [], principle };
  }

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
  return { move, favored, hurt, principle };
}

/**
 * 보조 줄 — **연결된 종목 수 한 줄뿐이다**(§D-2).
 *
 * 종전에는 여기서 `$89.8 → $83.9` 도 같이 냈는데, 카드가 그 값을 이미 위에 그리고 있었다.
 * **같은 숫자가 한 카드에 두 번** 나왔다. 값은 카드가 그리고, 이 줄은 이 카드의 존재 이유
 * 하나만 말한다.
 */
export function macroSupport(link: MacroLink): string[] {
  const sens = MACRO_SENSITIVITY[link.move.indicator.id];
  if (sens.mode === "market") {
    const market = link.move.indicator.name;
    return [`우리가 짚은 곳 중 ${market} 종목이 ${link.favored.length}곳이에요`];
  }
  /**
   * FIX-01 PART F — 종전 문구는 `… ${linked}곳이 여기 닿아요` 였다. **「닿는다」가 무슨
   * 뜻인지 전달되지 않는다** — 하려던 말은 「영향받는다」다. 에두르지 않고 그대로 쓴다.
   */
  const linked = link.favored.length + link.hurt.length;
  return [`우리가 최근 짚은 종목 중 ${linked}곳이 영향받아요`];
}

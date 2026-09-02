/**
 * DETAIL-02 — 공시 제목 아래에 **실제 숫자**를 놓는다. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 왜 필요한가
 *
 * 「왜 지금 사는가」에 이런 줄이 올라간다:
 *
 * ```
 * 8월 14일   반년 치 실적을 냈어요   [원문]
 * ```
 *
 * **`실적을 냈어요` 는 정보가 아니다.** 좋았는지 나빴는지, 매출이 늘었는지, 흑자인지
 * 하나도 알 수 없다. 공시가 있었다는 사실만 알려주고 내용을 안 준다. 원문 링크는 해결책이
 * 아니다 — 아무도 안 누르고, 눌러도 공시 원문은 읽기 어렵다. **우리가 읽어서 숫자로 준다.**
 *
 * ## 재료는 이미 있었다
 *
 * 공시 수집(`disclosure-collect`)은 날짜·제목·링크만 저장하고, 분기 재무(팩트시트
 * `fiscal.quarters`)는 따로 수집된다. 둘은 **`filed_at` 이라는 같은 날짜를 들고 있는데
 * 아무도 그 둘을 잇지 않았다.** 이 파일이 그 조인이다 — 새로 수집하는 것이 없다.
 *
 * ## 조인 규칙 — 아무 분기나 갖다 붙이지 않는다
 *
 * `filed_at` 으로 잇지 않는다. **국내 재무는 공시일을 갖고 있지 않다** — 네이버 재무표에
 * 공시일이 없어서 파이프라인이 법정 제출기한을 상한으로 써 넣고 `filed_at_source:
 * "statutory_deadline"` 으로 표시한다(`naver-fundamentals.ts`). 즉 국내 종목의 `filed_at` 은
 * **우리가 계산한 추정치**다. 그걸 조인 키로 쓰면 국내에서는 추정 위에 숫자를 얹거나(위험)
 * 전부 버려서 확보율 0 이 된다(무용). 실측으로 확인했다 — 프로덕션 실적 공시 8건은 전부 국내다.
 *
 * 그래서 **실측 두 개만** 쓴다: DART 가 준 **공시일**과 재무 레코드의 **기간말**(`period_end`).
 * 보고서는 기간이 끝난 뒤에 나오고 법정기한이 그 간격의 상한이다(분기·반기 45일, 사업보고서
 * 90일). 그 창(10~100일) 안에서 **기간말이 가장 늦은 분기**가 이 보고서가 말하는 기간이다.
 *
 * ## 어느 기간의 숫자인지 반드시 말한다
 *
 * 우리가 가진 것은 **분기** 레코드다. 반기보고서 아래에 분기 숫자를 기간 표시 없이 놓으면
 * 사용자가 반기 실적으로 읽는다 — 틀린 값을 보여준 것과 같다. 그래서 분기 라벨을 읽을 수
 * 없으면(`2026Q2` 형식이 아니면) **숫자를 아예 붙이지 않는다.**
 *
 * ## 평가하지 않는다
 *
 * 한 줄 해석은 **사실 요약**까지다. `늘었어요`·`줄었어요`·`흑자로 돌아섰어요` 는 사실이고,
 * `좋았어요`·`호실적`·`개선됐어요` 는 평가다. 후자는 투자조언에 한 걸음이므로 쓰지 않는다.
 */

import { josa } from "./josa";

const EOK = 100_000_000;
const JO = 1_000_000_000_000;

/**
 * 실적을 **담고 있는** 공시 서식.
 *
 * `classifyDisclosure` 의 `실적` 종류로는 가릴 수 없다 — 반기·분기·사업보고서는 그 분류에서
 * `기타`로 떨어진다(제목에 "실적" 이라는 말이 없다). 그런데 정작 재무제표를 들고 오는 것은
 * 그 셋이다. 그래서 여기서 따로 가린다.
 *
 * `결산실적공시예고` 는 **예고**라서 넣지 않는다 — 숫자가 아직 없다.
 */
export const EARNINGS_REPORT_TITLE =
  /(?:반기|분기|사업)보고서|매출액또는손익구조|손익구조\s*30|영업[\s(ㆍ·]*잠정[\s)]*실적|연결재무제표기준영업/;

/** 조인에 쓰는 분기 레코드 — 팩트시트 `fiscal.quarters` 의 부분집합이다. */
export interface FigureQuarter {
  /** `2026Q2`. 이 형식이 아니면 이 분기를 쓰지 않는다. */
  period: string;
  /**
   * 기간말 `2026-06-30`. **조인 키다** — 소스가 실제로 관측한 값이다.
   * (`filed_at` 은 국내에서 법정기한 추정치라 쓰지 않는다 — 위 「조인 규칙」)
   */
  period_end: string;
  revenue: number | null;
  operating_income: number | null;
  net_income: number | null;
}

export type EarningsFigureLabel = "매출" | "영업이익" | "순이익";

export interface EarningsFigureRow {
  label: EarningsFigureLabel;
  /** `1,240억`. */
  value: string;
  /** `작년 2분기보다 +18%` / `작년 2분기 -14억에서 흑자로`. **이게 없으면 줄이 없다.** */
  change: string;
}

export interface EarningsFigures {
  /** `2026년 2분기` — 어느 기간의 숫자인가. 이걸 못 만들면 블록 자체가 없다. */
  periodLabel: string;
  /** 한 줄 해석(PART B). 매출·영업이익이 **둘 다** 있을 때만. */
  headline?: string;
  /** 확보된 항목만. 하나도 없으면 블록 자체가 없다. */
  rows: EarningsFigureRow[];
}

/** `1240 억원` → `1,240억`. 부호를 남긴다 — 적자 금액이 여기 들어온다. */
export function formatWonShort(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  /**
   * 만 단위 아래는 **원으로 쓴다.** `Math.round(4_000 / 10_000) === 0` 이라 그냥 두면
   * `0만` 이 나가는데 그건 금액 표기가 아니다. 0(손익분기)은 RISK-5 로 실제 도달하는 경로다.
   */
  if (abs < 10_000) return `${sign}${Math.round(abs).toLocaleString("en-US")}원`;
  if (abs >= JO) {
    const jo = Math.round((abs / JO) * 10) / 10;
    return `${sign}${Number.isInteger(jo) ? jo.toLocaleString("en-US") : jo.toFixed(1)}조`;
  }
  if (abs >= EOK) return `${sign}${Math.round(abs / EOK).toLocaleString("en-US")}억`;
  return `${sign}${Math.round(abs / 10_000).toLocaleString("en-US")}만`;
}

/** `2026Q2` → `{ year: 2026, quarter: 2 }`. 형식이 아니면 `null`. */
function parsePeriod(period: string): { year: number; quarter: number } | null {
  const m = /^(\d{4})Q([1-4])$/.exec(period.trim());
  return m ? { year: Number(m[1]), quarter: Number(m[2]) } : null;
}

/** `to - from` (일). 파싱 실패는 `null`. **부호를 남긴다** — 앞뒤 순서가 규칙의 일부다. */
function daysFrom(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * 공시일과 기간말 사이에 허용하는 간격(일).
 *
 * 상한 100 — 법정 제출기한이 분기·반기 45일, 사업보고서 90일이다. 100 은 그 상한에 지연·정정을
 * 얹은 값이고, 이보다 오래 지난 기간을 보고하는 정기보고서는 없다.
 *
 * 하한 10 — 기간이 끝난 지 열흘 안에 정기보고서가 나오는 일은 없다. 이 하한이 없으면
 * 7월 2일 공시가 6월 30일로 끝난 분기를 보고한 것으로 잡히는데, 실제로는 그 이전 분기 건이다.
 */
const JOIN_MIN_DAYS = 10;
const JOIN_MAX_DAYS = 100;

/**
 * 이 공시가 말하는 분기를 찾는다 — 창 안에서 **기간말이 가장 늦은** 분기.
 *
 * 늦은 쪽을 고르는 이유: 8월 14일 반기보고서에는 6월 30일로 끝난 분기와 3월 31일로 끝난 분기가
 * 둘 다 창 안에 들어온다. 보고서는 **가장 최근에 끝난 기간**을 보고하므로 늦은 쪽이다.
 */
function joinQuarter(date: string, quarters: readonly FigureQuarter[]): FigureQuarter | null {
  let best: { q: FigureQuarter; end: string } | null = null;
  for (const q of quarters) {
    if (!parsePeriod(q.period)) continue;
    const gap = daysFrom(q.period_end, date);
    if (gap === null || gap < JOIN_MIN_DAYS || gap > JOIN_MAX_DAYS) continue;
    if (!best || q.period_end > best.end) best = { q, end: q.period_end };
  }
  return best?.q ?? null;
}

/** 증감률(%) — 전기가 0 이거나 음수면 `null`(퍼센트로 쓸 수 없다). */
function pctChange(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function signed(pct: number): string {
  return pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : "0%";
}

/**
 * 증감률로 쓰지 않는 경계(%).
 *
 * 전년 동기가 3,000만이고 올해가 20억이면 `+6,567%` 가 나온다. 숫자는 맞지만 크기가
 * 전달되지 않고 과장으로 읽힌다 — `폭등` 을 금칙어로 막아 놓고 그 뜻을 숫자로 통과시키는 셈이다.
 * 이 위로는 **두 절대금액을 나란히** 쓴다. 기저가 작았다는 사실이 그 표기에서 보인다.
 */
const PCT_MAX = 300;

/**
 * 한 항목의 **변화 문장**. 없으면 `null` — 그 줄을 만들지 않는다.
 *
 * 흑자·적자 전환은 증감률로 쓸 수 없다(`-14 → 92` 는 퍼센트가 성립하지 않는다). 그리고
 * 쓸 수 있더라도 전환 문장이 더 강하다 — 그래서 따로 쓴다(§A-4).
 */
function changeText(label: EarningsFigureLabel, current: number, prior: number, when: string): string | null {
  /**
   * **흑자·적자는 이익에만 있는 개념이다.** 매출에 그 문장을 쓰면(`매출이 흑자로 돌아섰어요`)
   * 뜻이 없는 말이 된다 — 그래서 이익 항목에만 적용하고, 매출은 증감률만 쓴다.
   */
  if (label !== "매출") {
    /**
     * **0 은 흑자도 적자도 아니다**(손익분기). `<= 0` 으로 잡으면 정확히 0 인 분기를
     * `적자로` 라고 부르게 된다. 0 은 아래 증감률 경로로 내려보낸다.
     */
    if (prior < 0 && current > 0) return `${when} ${formatWonShort(prior)}에서 흑자로`;
    if (prior > 0 && current < 0) return `${when} ${formatWonShort(prior)}에서 적자로`;
    if (prior < 0 && current < 0) {
      /**
       * **표기가 판별 기준이다.** 크기를 원 단위로 비교하면 두 가지가 틀린다:
       *  · 동액(-14억 → -14억)이 삼항 else 에 먹혀 `늘었어요` 가 된다 — 거짓이다
       *  · -140.4억 → -139.6억 은 둘 다 `140억` 으로 표기되는데 문장은 `줄었어요` 다
       * 화면이 보여주는 값으로 방향을 정하면 문장과 숫자가 절대 어긋나지 않는다.
       */
      const from = formatWonShort(prior);
      const now = formatWonShort(current);
      if (from === now) return `${when}${josa(when, "와과")} 비슷한 적자예요`;
      const moved = Math.abs(current) < Math.abs(prior) ? "줄었어요" : "늘었어요";
      return `적자가 ${from}에서 ${now}${josa(now, "으로")} ${moved}`;
    }
  }
  const pct = pctChange(current, prior);
  if (pct === null) return null;
  if (pct === 0) return `${when}${josa(when, "와과")} 비슷해요`;
  // 기저가 작아 증감률이 뜻을 잃는 구간 — 두 절대금액을 나란히 쓴다(위 `PCT_MAX`).
  if (Math.abs(pct) > PCT_MAX) {
    const now = formatWonShort(current);
    return `${when} ${formatWonShort(prior)}에서 ${now}${josa(now, "으로")}`;
  }
  return `${when}보다 ${signed(pct)}`;
}

/** 매출·영업이익의 방향. 전환은 방향이 아니라 사건이므로 따로 표시한다. */
type Direction = "up" | "down" | "flat" | "to_profit" | "to_loss" | "loss_shrunk" | "loss_grown";

/**
 * 방향. **항목 줄이 쓰는 것과 같은 반올림된 증감률에서** 낸다.
 *
 * `current > prior` 로 재면 1,000억 → 1,002억 에서 항목 줄은 `비슷해요`(반올림 0%)인데
 * 해석은 `함께 늘었어요` 가 되어 **같은 블록 안에서 어긋난다.** 임계값을 하나로 묶는다.
 */
function direction(current: number, prior: number, profitLike: boolean): Direction {
  if (profitLike) {
    // 0 은 흑자도 적자도 아니다 — `changeText` 와 같은 경계를 쓴다.
    if (prior < 0 && current > 0) return "to_profit";
    if (prior > 0 && current < 0) return "to_loss";
    if (prior < 0 && current < 0) {
      // 위 `changeText` 와 **같은 판별 기준**(표기)을 쓴다 — 안 그러면 해석과 항목 줄이 어긋난다.
      if (formatWonShort(prior) === formatWonShort(current)) return "flat";
      return Math.abs(current) < Math.abs(prior) ? "loss_shrunk" : "loss_grown";
    }
  }
  const pct = pctChange(current, prior);
  if (pct === null || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}

/**
 * 한 줄 해석 — **사실 요약만.** 평가어(`좋았어요`·`호실적`·`개선`)는 쓰지 않는다(PART B-1).
 *
 * 매출·영업이익이 **둘 다** 있을 때만 만든다. 하나만 갖고 "함께 늘었어요" 를 쓰면 없는
 * 항목을 있는 것처럼 말하는 것이다.
 */
function headlineFor(revenue: Direction, operating: Direction): string | undefined {
  const revUp = revenue === "up";
  const revDown = revenue === "down";
  if (!revUp && !revDown) return undefined; // 매출이 보합이면 방향을 말할 것이 없다

  switch (operating) {
    case "to_profit":
      return revUp ? "매출 늘고 영업이익 흑자로 돌아섰어요" : "매출은 줄었는데 영업이익은 흑자로 돌아섰어요";
    case "to_loss":
      return revUp ? "매출 늘고 영업이익은 적자로 돌아섰어요" : "매출 줄고 영업이익은 적자로 돌아섰어요";
    case "loss_shrunk":
      return revUp ? "매출 늘고 영업이익 적자가 줄었어요" : "매출 줄고 영업이익 적자가 줄었어요";
    case "loss_grown":
      return revUp ? "매출은 늘었는데 영업이익 적자가 늘었어요" : "매출 줄고 영업이익 적자가 늘었어요";
    /**
     * **`이익` 이라고 뭉개지 않는다.** 이 해석은 `영업이익` 방향 하나로만 만드는데,
     * 같은 블록이 순이익 줄도 그린다. 영업이익↑·순이익↓ 인 분기(일회성 손실·금융비용)에
     * `이익이 함께 늘었어요` 를 쓰면 **바로 아래 자기 숫자에게 반박당한다.**
     */
    case "up":
      return revUp ? "매출과 영업이익이 함께 늘었어요" : "매출은 줄었는데 영업이익은 늘었어요";
    case "down":
      return revUp ? "매출은 늘었는데 영업이익은 줄었어요" : "매출과 영업이익이 함께 줄었어요";
    default:
      return undefined;
  }
}

const FIELDS: ReadonlyArray<readonly [EarningsFigureLabel, keyof FigureQuarter]> = [
  ["매출", "revenue"],
  ["영업이익", "operating_income"],
  ["순이익", "net_income"],
];

function figure(q: FigureQuarter, key: keyof FigureQuarter): number | null {
  const v = q[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * 실적 공시 한 건에 붙일 숫자. 못 뽑으면 `null` — 제목만 남고 **지어내지 않는다**(§E-1).
 *
 * @param input.date 공시일 `YYYY-MM-DD`.
 * @param input.title DART `report_nm` 원문. 실적 서식이 아니면 곧바로 `null`.
 * @param input.quarters 팩트시트 분기(정렬 무관 — 여기서 찾는다).
 */
export function earningsFigures(input: {
  date: string;
  title: string | undefined | null;
  quarters: readonly FigureQuarter[];
}): EarningsFigures | null {
  const title = input.title?.trim() ?? "";
  if (!title || !EARNINGS_REPORT_TITLE.test(title.replace(/\s+/g, ""))) return null;

  const current = joinQuarter(input.date, input.quarters);
  if (!current) return null;
  const period = parsePeriod(current.period)!;

  // 전년 **동기**. 다른 분기와 비교하면 계절성이 증감으로 둔갑한다.
  const prior = input.quarters.find((q) => {
    const p = parsePeriod(q.period);
    return p !== null && p.year === period.year - 1 && p.quarter === period.quarter;
  });
  if (!prior) return null;

  const when = `작년 ${period.quarter}분기`;
  const rows: EarningsFigureRow[] = [];
  const dirs = new Map<EarningsFigureLabel, Direction>();

  for (const [label, key] of FIELDS) {
    const now = figure(current, key);
    const before = figure(prior, key);
    if (now === null || before === null) continue;
    const change = changeText(label, now, before, when);
    if (!change) continue;
    rows.push({ label, value: formatWonShort(now), change });
    dirs.set(label, direction(now, before, label !== "매출"));
  }
  if (rows.length === 0) return null;

  const rev = dirs.get("매출");
  const op = dirs.get("영업이익");
  const headline = rev && op ? headlineFor(rev, op) : undefined;

  return {
    periodLabel: `${period.year}년 ${period.quarter}분기`,
    ...(headline ? { headline } : {}),
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART C — 금액을 규모 대비로
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 제목이 들고 온 금액(원). 없으면 `null`.
 *
 * **단위가 붙은 숫자만** 읽는다. 연도(`2025.12`)·비율(`30%`)·주식수(`1,000,000주`)를 금액으로
 * 읽으면 그 뒤 환산이 전부 거짓이 되므로, 단위가 판별 기준이다.
 */
export function parseKoreanAmountWon(text: string | undefined | null): number | null {
  const raw = text?.trim();
  if (!raw) return null;
  /**
   * 단위 뒤의 `(?!주)` — **주식 수를 금액으로 읽지 않는다.** `5,000만주` 는 `만` 이 붙어 있어서
   * 이것 없이는 5천만원으로 읽힌다. `1,000,000주` 는 단위가 없어 걸리지만 `만주`·`억주` 는
   * 걸리지 않았다. 잘못 읽은 분자로 환산하면 그 뒤 비율이 전부 거짓이 된다.
   */
  const withUnit = /(\d[\d,]*(?:\.\d+)?)\s*(조|억|만원?|원)(?!주)/.exec(raw);
  if (!withUnit) return null;
  const value = Number(withUnit[1]!.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = withUnit[2];
  if (unit === "조") return value * JO;
  if (unit === "억") return value * EOK;
  if (unit === "만" || unit === "만원") return value * 10_000;
  return value;
}

/** 환산 기준. 없는 것은 `null`·생략 — 0 으로 메우지 않는다. */
export interface DisclosureScale {
  /** TTM 매출(연매출). */
  revenueTtm?: number | null;
  marketCap?: number | null;
  totalEquity?: number | null;
}

type ScaleKey = "revenueTtm" | "marketCap" | "totalEquity";

/**
 * 공시 종류별로 **무엇 대비**인가(§C-1).
 *
 * 320억은 아무 감이 안 오고, `최근 1년 매출의 26%` 는 크기가 온다. 그래서 종류마다 분모를
 * 정한다 — 수주는 매출, 자사주·증자는 시가총액, 담보·타법인 취득은 자기자본.
 *
 * ## 분모를 `연매출` 이라 부르지 않는다
 *
 * 분모는 `fiscal.ttm.revenue` — **최근 4분기**다. `연매출` 이라고 쓰면 사용자는 "작년 연매출"
 * 로 읽고 그건 다른 숫자다. 우리가 나눈 것을 그대로 말한다.
 *
 * ## 수주는 분자가 무엇인지 말한다
 *
 * 단일판매·공급계약의 금액은 **계약 총액**이고 계약기간이 여러 해일 수 있다(그 기간은 서식
 * 본문에 있고 우리는 본문을 저장하지 않는다). 3년 320억을 1년 매출로 나눈 26% 를 아무 말 없이
 * 놓으면 연간 기여를 세 배로 부풀린 것이 된다. 그래서 `계약금액이` 를 앞에 붙여 **분자가
 * 계약 총액임을 문장이 스스로 말하게** 한다 — `매출이 26% 는다` 로 읽히지 않는다.
 * 계약기간을 반영하려면 본문 수집이 선행이다(§8 다음 작업).
 *
 * `해지` 는 뺀다 — 깨진 계약에 규모를 환산하지 않는다.
 */
const SCALE_RULES: ReadonlyArray<readonly [RegExp, ScaleKey, string, string]> = [
  [/단일판매|공급계약|수주|납품계약/, "revenueTtm", "최근 1년 매출", "계약금액이 "],
  [/자기주식|자사주|주식소각/, "marketCap", "시가총액", ""],
  [/유상증자|무상증자|전환사채|신주인수권부사채|교환사채|사채권?발행|주주배정후실권주/, "marketCap", "시가총액", ""],
  [/담보제공|채무보증|금전대여/, "totalEquity", "자기자본", ""],
  [/타법인주식|출자증권|신규시설투자|시설투자|유형자산처분|영업양수|영업양도/, "totalEquity", "자기자본", ""],
];

/** 계약·결정이 **깨진** 공시. 규모를 환산하지 않는다 — 없어진 금액이다. */
const SCALE_EXCLUDED = /해지|철회|취소|중단/;

/** 환산해도 감이 안 오는 크기. 이 아래는 쓰지 않는다. */
const SCALE_MIN_PCT = 0.1;

/**
 * `계약금액이 최근 1년 매출의 26%` — 금액 자체는 이미 제목 줄에 있으므로
 * (`disclosurePhrase` 가 붙인다) **비율만** 돌려준다. 분모가 없으면 `null` —
 * 억지로 다른 기준을 쓰지 않는다.
 */
export function disclosureScaleNote(input: {
  title: string | undefined | null;
  scale: DisclosureScale;
}): string | null {
  const title = input.title?.replace(/\s+/g, "") ?? "";
  if (!title || SCALE_EXCLUDED.test(title)) return null;
  const amount = parseKoreanAmountWon(input.title);
  if (amount === null || amount <= 0) return null;

  for (const [pattern, key, label, subject] of SCALE_RULES) {
    if (!pattern.test(title)) continue;
    const denom = input.scale[key];
    if (typeof denom !== "number" || !Number.isFinite(denom) || denom <= 0) return null;
    const pct = (amount / denom) * 100;
    if (pct < SCALE_MIN_PCT) return null;
    const text = pct >= 10 ? String(Math.round(pct)) : (Math.round(pct * 10) / 10).toString();
    return `${subject}${label}의 ${text}%`;
  }
  return null;
}

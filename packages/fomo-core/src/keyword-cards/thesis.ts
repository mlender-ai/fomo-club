/**
 * THESIS-01 — 「지금 눈에 띄는 것」. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 무엇이 문제였나
 *
 * 상세 2걸음이 **날짜와 사건만** 말했다:
 *
 * ```
 * 8월 14일   반년 치 실적을 냈어요
 * 9월 1일    그 다음부터 시장을 앞서기 시작했어요
 * ```
 *
 * 레퍼런스(트위터 리서치 글)와 견주면 **셋 중 둘이 없다**:
 *
 * | 요소 | 레퍼런스 | 우리 |
 * |---|---|---|
 * | 숫자 | 수율 85% · 파운드리 손실 21억 달러 | **없음** |
 * | 시점 | 지난 분기 · 2026년 → 2030년 | 있음 |
 * | 확인 지점 | 손익분기점으로 향하는 순간 | **없음** |
 *
 * 우리가 못 하는 것은 **「그래서 오른다」**뿐이다(투자자문·예측·외부 모델 인용).
 * 나머지 — 숫자, 시점, **무엇을 보면 되는지** — 는 다 줄 수 있는데 안 주고 있었다.
 *
 * ## 이 파일이 만드는 것
 *
 * ```
 * ① 실적이 돌아섰어요            ← 제목(무슨 일인가)
 *    8월 14일 반기 실적           ← 날짜 + 사건
 *    매출 1,240억 · 작년 2분기보다 +18%      ┐ 숫자마다 **비교 대상**(PART D-1)
 *    영업이익 92억 · 작년 2분기 -14억에서 흑자로 ┘
 *    다음 실적 발표는 보통 11월이에요   ← 다음 확인 지점(PART C)
 * ```
 *
 * ## 새로 모으는 것이 없다
 *
 * 실적 숫자는 `disclosure-figures`(DETAIL-02)가, 업종 비교는 `sector-stats`(FIX-02)가,
 * 수급·거래·가격 위치는 신호 팩트가 이미 만든다. **이 파일은 고르고 줄 세우는 일만 한다** —
 * 그게 이 배치의 전부다(재편성).
 *
 * ## 세 규칙
 *
 * | 규칙 | 어디 |
 * |---|---|
 * | **비교 대상 없는 숫자는 넣지 않는다** | `ThesisNumber.compare` 가 필수 필드다 |
 * | **숫자 없는 항목은 만들지 않는다** | 숫자 0개면 항목을 버린다(B-2 3번) |
 * | **2개도 못 채우면 빈 배열** | 억지로 채우지 않는다(A-3 · 하지 말 것 5번) |
 *
 * ## 예측하지 않는다
 *
 * 「다음 확인 지점」은 예측의 자리가 아니라 **일정과 조건**의 자리다:
 * `다음 실적 발표는 보통 11월이에요`(일정) · `연속이 끊기면 이 신호는 끝나요`(조건).
 * `오를`·`재평가`·`기대`는 테스트가 막는다(`THESIS_FORBIDDEN`).
 */

import { josa } from "./josa";
import { industryDisplayLabel } from "./sector-display";
import type { SectorComparison } from "./sector-stats";

/** 항목 종류. 우선순위는 `THESIS_PRIORITY` 가 정한다(B-1 표). */
export type ThesisKind = "earnings" | "disclosure" | "valuation" | "supply" | "volume" | "price";

/**
 * 숫자 한 개. **`compare` 는 필수다** — 비교 대상 없는 숫자를 화면에 두지 않는다(PART D-1).
 *
 * ```
 * 안 됨   영업이익 92억
 * 좋음    영업이익 92억 · 작년 2분기 -14억에서 흑자로
 * ```
 */
export interface ThesisNumber {
  /** `매출` · `PBR`. 값만으로 읽히면(`3일 연속`) 없어도 된다. */
  label?: string;
  /** `1,240억` · `0.88배` · `1,563주`. */
  value: string;
  /** 비교 대상 — 이게 없으면 이 숫자는 만들어지지 않는다. */
  compare: string;
  /**
   * 둘째 비교 대상 — 있을 때만. 지시서 A-1 목업이 값에 **업종 평균과 5년 위치를 함께**
   * 붙였다(`같은 제약 회사 14곳 평균 1.42배` + `5년 범위에서 아래 12% 지점`).
   * 같은 숫자를 두 자로 재는 것이라 값을 되풀이하지 않고 비교만 하나 더 둔다.
   */
  also?: string;
}

export interface ThesisItem {
  kind: ThesisKind;
  /** ① 무슨 일인가. 한 줄. */
  title: string;
  /** 날짜 + 사건(`8월 14일 반기 실적`). 시점이 없는 항목(값·가격 위치)은 없다. */
  when?: string;
  /** 숫자 2~3개. 전부 `compare` 를 갖는다. */
  numbers: ThesisNumber[];
  /** 다음 확인 지점 — **만들 수 있을 때만**(PART C). */
  nextCheck?: string;
}

/** 항목 수 규칙(A-3). 2개 미만이면 이 블록을 만들지 않는다. */
export const THESIS_MIN_ITEMS = 2;
export const THESIS_MAX_ITEMS = 3;

/** 한 항목에 두는 숫자 상한. 넷을 넘기면 표가 아니라 재무제표가 된다. */
const MAX_NUMBERS_PER_ITEM = 3;

/**
 * 우선순위(B-1). 낮은 수가 먼저다.
 *
 * **6번 업종 자금 · 7번 거시 연결은 이 배치에서 만들지 않는다.** 둘은 종목이 아니라
 * 시장 단위로 집계된 카드이고(`sector-flow` · `macro-link`), 종목별 숫자로 내려면
 * 「이 종목에 얼마가 들어왔나」가 필요한데 그 수치가 없다. 없는 숫자를 쓰는 대신 비운다.
 */
export const THESIS_PRIORITY: Readonly<Record<ThesisKind, number>> = {
  earnings: 1,
  disclosure: 2,
  valuation: 3,
  supply: 4,
  volume: 5,
  price: 8,
};

/**
 * 다른 항목이 있을 때 **수급이 밀려 앉는 자리**(B-2 4번: "다른 게 있으면 뒤로 민다").
 *
 * 맨 뒤가 아니라 6번이다 — 지시서 A-1 목업이 ③에 수급을 두고 가격 위치는 안 뒀다.
 * 가격 위치(8번)는 종전 화면에도 있던 **상태 서술**이고, 수급은 이 카드가 만들어진 이유에
 * 날짜·물량·평소 대비가 붙은 항목이다. 「뒤로」를 「맨 뒤로」로 읽으면 목업과 어긋난다.
 */
const SUPPLY_DEMOTED_PRIORITY = 6;

/** 예측·평가 금지(PART C-3 · 하지 말 것 3번). 테스트가 생성된 모든 문장에 건다. */
export const THESIS_FORBIDDEN =
  /오를|오른다|재평가|기대|전망|유망|저평가|고평가|목표가|매수|매도|추천|급등|반등할|수혜/;

export interface ThesisInput {
  /**
   * 「왜 지금」 타임라인이 만든 항목 그대로. 실적 숫자(`figures`)와 금액의 규모 환산
   * (`scaleNote`)이 이미 붙어 있다 — 이 파일은 그걸 고른다.
   */
  events?: ReadonlyArray<{
    date?: string;
    when: string;
    text: string;
    url?: string;
    figures?: {
      periodLabel: string;
      headline?: string;
      rows: ReadonlyArray<{ label: string; value: string; change: string }>;
    };
    scaleNote?: string;
  }>;
  /** 값의 위치 — 배수와, 업종 비교(자기 제외) 또는 5년 밴드 백분위. */
  valuation?: {
    per?: number | null;
    pbr?: number | null;
    /** `sectorComparison(candidates, "per", own)` 결과. */
    perPeer?: SectorComparison | null;
    pbrPeer?: SectorComparison | null;
    /** 5년 밴드 백분위(0~100, 낮을수록 싸다). 충분한 표본일 때만 넘긴다. */
    perPercentile?: number | null;
    pbrPercentile?: number | null;
  };
  /** 수급 — 신호가 말한 것. 카드가 이미 말했으므로 다른 항목이 있으면 뒤로 밀린다. */
  supply?: {
    actor?: string | null;
    days?: number | null;
    /** `1,563주` · `$2.8M` — 이미 사람이 읽는 표기로 온다. */
    scale?: string | null;
    /** 그 물량이 평균 거래량의 몇 %인가. */
    volumePct?: number | null;
    /** 이 연속이 최근 며칠 중 가장 긴가. */
    longestWindowDays?: number | null;
    startedWhen?: string | null;
  };
  /** 거래 변화 — 평소 대비 배수. */
  volume?: { ratio?: number | null; when?: string | null };
  /** 가격 위치 — 52주 저점/고점 대비. */
  price?: { pctAboveYearLow?: number | null; pctBelowYearHigh?: number | null };
}

/** `0.88배` — 소수 둘째 자리. 자리수가 흔들리면 표가 흔들린다. */
function times(value: number): string {
  return `${(Math.round(value * 100) / 100).toFixed(2)}배`;
}

/**
 * 업종 평균 표기 — **몇 곳과 견줬는지 밝힌다**(FIX-02 B-4 와 같은 말투).
 * 이름을 모르는 영문 분류는 이름 없이 쓴다(FIX-02 E-1).
 */
function peerAverage(cmp: SectorComparison, unit: (v: number) => string): string {
  const label = industryDisplayLabel(cmp.label);
  const who = label ? `다른 ${label} ${cmp.count}곳` : `같은 업종 다른 ${cmp.count}곳`;
  return `${who} 평균 ${unit(cmp.median)}`;
}

/** 백분위 → `5년 범위에서 아래 12% 지점`. 위치일 뿐 판단이 아니다. */
function bandPosition(percentile: number): string {
  const p = Math.round(percentile);
  if (p <= 50) return `5년 범위에서 아래 ${p}% 지점`;
  return `5년 범위에서 위 ${100 - p}% 지점`;
}

/**
 * 실적 항목 — 우선순위 1번.
 *
 * 재료는 `disclosure-figures` 가 만든 숫자다. **제목은 그 숫자가 말하는 방향**으로 쓴다
 * (`headline` 이 있으면 그것이 곧 제목이다 — 이미 사실 한 줄로 만들어져 있다).
 */
function earningsItem(input: ThesisInput): ThesisItem | null {
  const event = (input.events ?? []).find((e) => e.figures && e.figures.rows.length > 0);
  const figures = event?.figures;
  if (!event || !figures) return null;

  const numbers: ThesisNumber[] = figures.rows
    .filter((row) => row.change.trim().length > 0)
    .slice(0, MAX_NUMBERS_PER_ITEM)
    .map((row) => ({ label: row.label, value: row.value, compare: row.change }));
  if (numbers.length === 0) return null;

  const nextCheck = nextEarningsCheck(figures.periodLabel);
  return {
    kind: "earnings",
    title: figures.headline?.trim() || event.text,
    when: `${event.when} ${figures.periodLabel} 실적`,
    numbers,
    ...(nextCheck ? { nextCheck } : {}),
  };
}

/**
 * 다음 실적 발표 시점 — **법정 기한에서 나온 일정**이다(PART C-2).
 *
 * 회사가 발표한 날짜가 아니라 제도가 정한 제출 기한이라 `보통` 을 붙인다. 분기·반기는
 * 기간말 후 45일, 사업보고서는 90일이므로 다음 보고서가 나오는 달은 이렇게 정해진다.
 * 기간을 못 읽으면 이 줄을 만들지 않는다 — 지어내지 않는다.
 */
export function nextEarningsCheck(periodLabel: string): string | null {
  const quarter = /([1-4])분기/.exec(periodLabel)?.[1];
  if (quarter) {
    const next: Record<string, string> = { "1": "8월", "2": "11월", "3": "다음 해 3월", "4": "5월" };
    const month = next[quarter];
    return month ? `다음 실적 발표는 보통 ${month}이에요` : null;
  }
  if (/연간|사업연도/.test(periodLabel)) return "다음 실적 발표는 보통 5월이에요";
  return null;
}

/**
 * 큰 공시 항목 — 우선순위 2번. **금액이 규모 대비로 환산된 것만** 쓴다(PART D-2).
 *
 * `수주 320억` 은 감이 안 오고 `연매출의 26%` 는 온다. 그래서 `scaleNote` 가 없는 공시는
 * 이 자리에 오지 않는다 — 숫자 없는 항목을 만들지 않는다는 규칙(B-2 3번)의 적용이다.
 */
function disclosureItem(input: ThesisInput): ThesisItem | null {
  const event = (input.events ?? []).find((e) => e.scaleNote && !e.figures);
  if (!event?.scaleNote) return null;
  /**
   * 금액과 비교 대상을 가른다.
   *
   * LAUNCH-P2 §B 이후 `scaleNote` 는 **금액과 비율을 함께** 들고 온다
   * (`계약금액 405억 · 최근 1년 매출의 26%`) — 공시 본문에서 금액을 읽기 시작했기 때문이다.
   * 그 전에는 비율뿐이었고 금액은 제목(`text`) 뒤에 붙어 있었다. **둘 다 지원한다**:
   *
   * ```
   * scaleNote = "계약금액 405억 · 최근 1년 매출의 26%"  → 값 405억 · 비교 최근 1년 매출의 26%
   * scaleNote = "시가총액의 1.2%" · text = "… · 100억"   → 값 100억 · 비교 시가총액의 1.2%
   * ```
   *
   * **비교 대상 없는 숫자는 항목이 아니다**(THESIS-01 「비교 대상 없이 숫자만 두지 말 것」).
   * 그래서 어느 쪽으로도 못 가르면 비율 자체를 값으로 쓰고 비교 대상을 명시한다.
   */
  const parts = event.scaleNote.split(" · ").map((part) => part.trim()).filter(Boolean);
  const fromNote = parts.length >= 2 ? { value: parts[0]!, compare: parts.slice(1).join(" · ") } : null;
  const fromText = event.text.split(" · ").slice(1).join(" · ").trim();
  const numbers: ThesisNumber[] = fromNote
    ? [fromNote]
    : fromText
      ? [{ value: fromText, compare: event.scaleNote }]
      : [{ value: event.scaleNote, compare: "회사 규모 대비" }];
  return {
    kind: "disclosure",
    title: event.text.split(" · ")[0]!.trim(),
    when: `${event.when} 공시`,
    numbers,
  };
}

/**
 * 값의 위치 항목 — 우선순위 3번.
 *
 * 업종 비교가 있으면 그것이 비교 대상이고, 없으면 5년 밴드 백분위를 쓴다(WO §4-3 순서).
 * **둘 다 없으면 항목이 없다** — 맨숫자를 남기지 않는다.
 */
function valuationItem(input: ThesisInput): ThesisItem | null {
  const v = input.valuation;
  if (!v) return null;
  const numbers: ThesisNumber[] = [];
  const add = (label: string, value: number | null | undefined, peer: SectorComparison | null | undefined, percentile: number | null | undefined) => {
    if (typeof value !== "number" || !(value > 0)) return;
    const band = typeof percentile === "number" ? bandPosition(percentile) : null;
    // 업종 비교가 있으면 그것이 첫 비교 대상이고, 5년 위치는 **함께** 붙는다(A-1 목업).
    if (peer) numbers.push({ label, value: times(value), compare: peerAverage(peer, times), ...(band ? { also: band } : {}) });
    else if (band) numbers.push({ label, value: times(value), compare: band });
  };
  add("PER", v.per, v.perPeer, v.perPercentile);
  add("PBR", v.pbr, v.pbrPeer, v.pbrPercentile);
  if (numbers.length === 0) return null;

  /** 제목은 **위치**를 말한다. 싸다·비싸다는 판단이라 쓰지 않는다. */
  const lowest = Math.min(
    ...[v.perPercentile, v.pbrPercentile].filter((p): p is number => typeof p === "number")
  );
  const title = Number.isFinite(lowest)
    ? lowest <= 20
      ? "값이 5년 중 낮은 편이에요"
      : lowest >= 80
        ? "값이 5년 중 높은 편이에요"
        : "값이 5년 범위 가운데쯤이에요"
    : "값을 같은 업종과 견줘 봤어요";
  return {
    kind: "valuation",
    title,
    numbers: numbers.slice(0, MAX_NUMBERS_PER_ITEM),
    nextCheck: "다음 분기 실적이 나오면 값이 다시 계산돼요",
  };
}

/** 수급 항목 — 우선순위 4번(다른 항목이 있으면 뒤로 밀린다, B-2 4번). */
function supplyItem(input: ThesisInput): ThesisItem | null {
  const s = input.supply;
  if (!s) return null;
  const actor = s.actor?.trim();
  const days = typeof s.days === "number" && s.days > 0 ? s.days : null;
  const numbers: ThesisNumber[] = [];

  // 연속일수는 「최근 며칠 중 가장 길다」가 비교 대상이다. 그게 없으면 숫자로 쓰지 않는다.
  if (days && typeof s.longestWindowDays === "number" && s.longestWindowDays > 0) {
    numbers.push({ value: `${days}일 연속`, compare: `최근 ${s.longestWindowDays}거래일 중 가장 길어요` });
  }
  // 물량은 평균 거래량 대비가 비교 대상이다.
  if (s.scale?.trim() && typeof s.volumePct === "number" && Number.isFinite(s.volumePct)) {
    numbers.push({ value: s.scale.trim(), compare: `거래량은 평소의 ${Math.round(s.volumePct)}%` });
  }
  if (numbers.length === 0) return null;

  return {
    kind: "supply",
    // 조사를 고정하지 않는다 — `기관이` · `외국인이` · `임원 3명이` 가 갈린다(josa-guard).
    title: actor ? `그 사이 ${actor}${josa(actor, "이가")} 사기 시작했어요` : "그 사이 수급이 붙기 시작했어요",
    ...(s.startedWhen ? { when: `${s.startedWhen}부터` } : {}),
    numbers,
    nextCheck: "연속이 끊기면 이 신호는 끝나요",
  };
}

/** 거래 변화 항목 — 우선순위 5번. 평소 대비 배수가 비교 대상 그 자체다. */
function volumeItem(input: ThesisInput): ThesisItem | null {
  const ratio = input.volume?.ratio;
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 1.5) return null;
  const times1 = Math.round(ratio * 10) / 10;
  return {
    kind: "volume",
    title: "거래가 갑자기 붙었어요",
    ...(input.volume?.when ? { when: input.volume.when } : {}),
    numbers: [{ label: "거래량", value: `평소의 ${times1}배`, compare: "최근 20거래일 평균 대비" }],
  };
}

/** 가격 위치 항목 — 우선순위 8번. 저점/고점 **근처일 때만** 쓴다(애매한 위치는 정보가 아니다). */
function priceItem(input: ThesisInput): ThesisItem | null {
  const low = input.price?.pctAboveYearLow;
  const high = input.price?.pctBelowYearHigh;
  if (typeof low === "number" && Number.isFinite(low) && low <= 15) {
    return {
      kind: "price",
      title: "52주 저점 근처예요",
      numbers: [{ value: `저점에서 ${Math.round(low)}% 위`, compare: "최근 1년 가격 범위 기준" }],
      /**
       * LAUNCH-P2 §D 실측에서 `withoutNextCheck: {price: 9}` 가 나왔다 — 가격 항목만
       * 다음 확인 지점이 없었다. **예측을 쓰지 않고** 사실을 쓴다: 52주 범위는 매일 다시
       * 계산된다(`저점을 깨면 …` 류는 예측이라 쓰지 않는다).
       */
      nextCheck: "52주 저점·고점은 매일 다시 계산돼요",
    };
  }
  if (typeof high === "number" && Number.isFinite(high) && high <= 15) {
    return {
      kind: "price",
      title: "52주 고점 근처예요",
      numbers: [{ value: `고점 대비 ${Math.round(high)}% 아래`, compare: "최근 1년 가격 범위 기준" }],
      nextCheck: "52주 저점·고점은 매일 다시 계산돼요",
    };
  }
  return null;
}

/**
 * 「지금 눈에 띈 것」 2~3개. **2개도 못 채우면 빈 배열**이고, 그러면 호출부가 이 블록을
 * 그리지 않는다(A-3).
 *
 * 수급은 카드와 1걸음이 이미 말했으므로, **다른 항목이 둘 이상이면 맨 뒤로 민다**(B-2 4번).
 * 같은 종류를 두 번 넣지 않는다 — 각 항목 생성기가 하나씩만 만든다(B-2 2번).
 */
export function thesisItems(input: ThesisInput): ThesisItem[] {
  const built = [
    earningsItem(input),
    disclosureItem(input),
    valuationItem(input),
    supplyItem(input),
    volumeItem(input),
    priceItem(input),
  ].filter((item): item is ThesisItem => item !== null && item.numbers.length > 0);

  /**
   * 수급을 뒤로 미는 것은 **다른 항목이 2개 이상일 때만**이다(B-2 4번). 수급뿐이거나
   * 하나만 더 있으면 순위표(B-1) 그대로 간다 — 밀어내면 채울 것이 없어진다.
   */
  const demote = built.filter((item) => item.kind !== "supply").length >= THESIS_MIN_ITEMS;
  const rank = (item: ThesisItem) =>
    item.kind === "supply" && demote ? SUPPLY_DEMOTED_PRIORITY : THESIS_PRIORITY[item.kind];
  const picked = [...built].sort((a, b) => rank(a) - rank(b)).slice(0, THESIS_MAX_ITEMS);
  return picked.length >= THESIS_MIN_ITEMS ? picked : [];
}

/**
 * 카드에 붙일 한 줄(PART E) — **눈에 띄는 것이 둘 이상일 때만.**
 *
 * 카드 훅은 신호를 말한다. 그 아래에 「볼 게 더 있다」를 알리는 줄이다. 수급은 훅이 이미
 * 말했으므로 넣지 않는다 — 같은 말을 두 번 하지 않는다.
 */
export function thesisCardLine(items: readonly ThesisItem[]): string | null {
  const labels: Partial<Record<ThesisKind, string>> = {
    earnings: "실적 흑자 전환",
    disclosure: "큰 공시",
    valuation: "값은 업종 평균 아래",
    volume: "거래 급증",
    price: "52주 저점 근처",
  };
  const parts: string[] = [];
  for (const item of items) {
    if (item.kind === "supply") continue;
    const label = cardLabelOf(item, labels);
    if (label && !parts.includes(label)) parts.push(label);
    if (parts.length === 2) break;
  }
  return parts.length >= 2 ? parts.join(" · ") : null;
}

/**
 * 카드 한 줄의 조각. **항목이 실제로 말한 방향**을 쓴다 — `실적 흑자 전환` 은 흑자로
 * 돌아섰을 때만이고, 그렇지 않으면 `실적 발표` 다(없는 사실을 짧게 쓰지 않는다).
 */
function cardLabelOf(item: ThesisItem, labels: Partial<Record<ThesisKind, string>>): string | null {
  if (item.kind === "earnings") {
    if (/흑자로/.test(item.numbers.map((n) => n.compare).join(" "))) return "실적 흑자 전환";
    if (/늘/.test(item.title)) return "실적 증가";
    if (/줄/.test(item.title)) return "실적 감소";
    return "실적 발표";
  }
  if (item.kind === "valuation") {
    if (/낮은/.test(item.title)) return "값은 5년 중 낮은 편";
    if (/높은/.test(item.title)) return "값은 5년 중 높은 편";
    return "값 비교 있음";
  }
  return labels[item.kind] ?? null;
}

/**
 * WO-HOOK-02 — 「왜 지금 사는가」. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 무엇을 푸는가
 *
 * 상세의 첫 섹션이 `누가 / 언제 / 얼마나 드문가 / 거래량` 네 줄이었다. 앞면 훅이
 * "기관이 40거래일 중 가장 긴 4일 매수"인데 그 문장을 쪼개서 다시 쓴 것이다. 사용자는
 * "진짜야?"라고 물으며 들어왔는데 같은 말을 네 조각으로 다시 듣는다. 게다가 그 정보는
 * **HTS 필터로 다 나온다** — 거기서 끝나면 우리 앱을 쓸 이유가 없다.
 *
 * 상세가 답해야 하는 질문은 하나다: **왜 조용히 사고 있는가.**
 *
 * ## 이 배치의 핵심은 새 데이터가 아니라 재편성이다
 *
 * 답의 재료는 **이미 화면에 흩어져 있었다.** 서로 무관한 정보처럼 나열돼 있어서 의미가
 * 없었을 뿐이다. `값` 섹션의 PBR 밴드, `틀리는 경우` 의 52주 저점, 신호 과거 성적 —
 * 이걸 하나의 질문 아래 모으면 그게 근거다. 새 수집이 없다.
 *
 * ## 인과를 말하지 않는다
 *
 * 우리는 **매수 주체의 의도를 모른다.** `~때문에 샀어요` 는 사실이 아니라 추측이고,
 * 추측을 사실처럼 쓰면 그건 투자의견이다. 그래서 이 섹션은 끝까지 **동시 관측**으로만
 * 말하고, 꼬리표가 그 한계를 화면에 적는다(`DISCLAIMER`).
 *
 * ## 2축 규칙
 *
 * 축이 1개 이하면 **섹션 자체를 만들지 않는다.** 한 줄짜리 "왜 지금 사는가" 는 답이 아니라
 * 답하는 시늉이고, 빈 섹션 헤더는 "여기 뭔가 있어야 하는데 없다"를 광고한다(DS-00 §1-1).
 */

import { josa } from "./josa";
import { disclosurePhrase } from "./disclosure-phrase";

/** 축 라벨 — 고정폭 56px 열에 들어간다(WO-HOOK-02 §2-4). */
export type WhyNowAxis = "값" | "손익" | "가격" | "재료" | "이력";

export interface WhyNowRow {
  axis: WhyNowAxis;
  text: string;
}

/** 최소 축 수 — 이 아래면 섹션을 만들지 않는다(§2-2). */
export const WHY_NOW_MIN_AXES = 2;

/**
 * `이력` 축을 쓰는 최소 승률(%). 이 아래면 사는 이유가 아니라 반대 증거다.
 * 50 은 동전 던지기 — 그보다 낮은 값을 「왜 지금 사는가」에 두지 않는다.
 */
export const WHY_NOW_MIN_WIN_RATE = 50;

/** 섹션 하단 꼬리표(§2-3). 화면이 문안을 따로 갖지 않도록 여기서 낸다. */
export const WHY_NOW_DISCLAIMER = "이 시점에 함께 관측된 것들이에요. 왜 샀는지는 확인할 수 없어요.";

/**
 * 금지 표현(§2-3) — 인과 단정 · 평가 · 예측.
 *
 * 테스트가 생성된 모든 문장에 이 정규식을 건다. 문안을 새로 추가할 때 여기 걸리면
 * **문안이 틀린 것이지 정규식이 과한 것이 아니다.**
 */
export const WHY_NOW_FORBIDDEN =
  /때문에|로 인해|해서 샀|호재|악재|저평가|고평가|기회|곧 오를|상승 전망|매수|매도|목표가|추천/;

export interface WhyNowInput {
  /** `값` — 밴드 기준 지표(PBR/PER/PSR)와 현재 배수, 5년 밴드 백분위(0~100). */
  band?: {
    label: string;
    current: number | null;
    percentile: number | null;
    sufficient: boolean;
  };
  /** `손익` — 주당순이익. 부호만 쓴다(적자/흑자). */
  eps?: number;
  /** `가격` — 52주 저점 대비 현재가 위치(%). */
  pctAboveYearLow?: number;
  /** `가격` 보조 — 52주 고점 대비 하락률(%, 양수). 저점 정보가 없을 때만 쓴다. */
  pctBelowYearHigh?: number;
  /** `이력` — 이 신호 유형의 과거 성적. */
  signalStats?: { n: number; up: number; winRate: number };
}

/** 백분위 → 밴드 구간 표현. 경계는 5분위(20/40/60/80)로 자른다. */
function bandPhrase(percentile: number): string {
  if (percentile <= 10) return "5년 중 가장 낮은 구간이에요";
  if (percentile <= 30) return "5년 중 낮은 편이에요";
  if (percentile <= 70) return "5년 평균 근처예요";
  if (percentile <= 90) return "5년 중 높은 편이에요";
  return "5년 중 가장 높은 구간이에요";
}

/** 배수 표기 — `0.36배`. 소수 둘째 자리까지, 끝의 0 은 떼지 않는다(자리수가 흔들리면 표가 흔들린다). */
function multipleText(value: number): string {
  return `${Math.round(value * 100) / 100}배`;
}

/**
 * 「왜 지금 사는가」 행 목록. **2축 미만이면 빈 배열** — 호출부는 빈 배열이면 섹션을 그리지 않는다.
 *
 * 축 순서는 고정이다(값 → 손익 → 가격 → 재료 → 이력). 종목마다 순서가 달라지면 같은 화면을
 * 여러 번 보는 사용자가 매번 다시 읽어야 한다.
 *
 * `재료`(최근 공시 유무)는 **이번 배치에서 만들지 않는다.** 공시 이력을 담은 소스가 아직
 * 화면까지 오지 않는다 — 오늘 뉴스 언급 수(`mentionCount`)로 "최근 30일 공시가 없어요" 를
 * 쓰면 없는 사실을 지어내는 것이다(§2-5: 데이터 확보 전 자리를 미리 만들지 않는다).
 */
export function buildWhyNowRows(input: WhyNowInput): WhyNowRow[] {
  const rows: WhyNowRow[] = [];

  // ① 값 — 밴드가 충분할 때만. 불충분한 밴드로 "5년 중 가장 낮은" 을 말하지 않는다.
  const band = input.band;
  if (band?.sufficient && typeof band.current === "number" && typeof band.percentile === "number") {
    rows.push({
      axis: "값",
      text: `${band.label} ${multipleText(band.current)} — ${bandPhrase(band.percentile)}`,
    });
  }

  // ② 손익 — 부호만. 적자면 "이익으로 값을 잴 수 없다"가 밴드 해석의 전제가 된다.
  if (typeof input.eps === "number" && Number.isFinite(input.eps)) {
    rows.push({
      axis: "손익",
      text: input.eps < 0 ? "적자 구간이라 이익으로는 값을 잴 수 없어요" : "이익이 나고 있어요",
    });
  }

  // ③ 가격 — 저점 대비가 우선. 둘 다 있으면 저점 쪽이 "얼마나 눌려 있나"를 더 직접 말한다.
  if (typeof input.pctAboveYearLow === "number" && Number.isFinite(input.pctAboveYearLow)) {
    rows.push({ axis: "가격", text: `52주 저점에서 ${Math.round(input.pctAboveYearLow)}% 위예요` });
  } else if (typeof input.pctBelowYearHigh === "number" && Number.isFinite(input.pctBelowYearHigh)) {
    rows.push({ axis: "가격", text: `52주 고점 대비 ${Math.round(input.pctBelowYearHigh)}% 아래예요` });
  }

  // ④ 이력 — 승률만 말하지 않는다. 분모(n)와 분자(up)를 같이 써야 52% 가 무엇의 52% 인지 안다.
  //
  // ## 50% 미만은 이 섹션에 넣지 않는다 (2026-08-24)
  //
  // 이 섹션이 답하는 질문은 **「왜 지금 사는가」** 다. 실측 화면(한글과컴퓨터)에서 이 행이
  // `비슷한 신호 79번 중 37번 올랐어요 (47%)` 로 나왔다 — 동전 던지기보다 낮은 값이
  // *사는 이유* 자리에 앉은 것이다. 그건 근거가 아니라 **반대 증거**이고, 질문 아래 두면
  // 숫자를 못 읽는 사용자에게는 근거처럼 보인다.
  //
  // 숨기는 것이 아니다 — 성적은 상세의 `이런 패턴` 행(`evidenceRows`)이 승률과 무관하게
  // 그대로 보여준다. 여기서 빼는 것은 **이 질문의 답이 아니기 때문**이다.
  const stats = input.signalStats;
  if (stats && stats.n > 0 && stats.winRate >= WHY_NOW_MIN_WIN_RATE) {
    rows.push({
      axis: "이력",
      text: `비슷한 신호 ${stats.n}번 중 ${stats.up}번 올랐어요 (${Math.round(stats.winRate)}%)`,
    });
  }

  return rows.length >= WHY_NOW_MIN_AXES ? rows : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// WO-RESET-02 — 「왜 지금 사는가」를 **날짜와 사건**으로 다시 만든다.
//
// ## 무엇이 잘못이었나
//
// 위 `buildWhyNowRows` 는 회사 **상태**를 두 줄로 요약한다:
//
//     손익  이익이 나고 있어요
//     가격  52주 저점에서 16% 위예요
//
// 이건 근거가 아니다. `이익이 나고 있어요` — 그래서? 이익 나는 회사는 널렸다.
// `52주 저점에서 16% 위` — 그냥 위치다. **사건이 없고 날짜가 없다.**
//
// 근거는 이렇게 생겼다:
//
//     8월 4일   수주 공시 · 계약금액 320억
//     8월 6일   그 다음 거래일부터 기관이 사기 시작했어요
//     7월 28일  2분기 영업이익이 흑자로 돌아섰어요
//
// 날짜가 있고, 무슨 일이 있었고, 그게 매수 시작과 어떻게 겹치는지가 보인다.
//
// ## 상태 서술은 버리지 않되 **혼자 서지 못한다**
//
// PBR·가격 위치는 **특이할 때만** 넣고(§C-2 4·5번), 날짜 붙은 항목이 하나도 없으면
// 섹션을 통째로 안 그린다(§C-3). `지금 PBR 0.36배` 만 있는 것은 근거가 아니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 타임라인 한 줄. `date` 가 없으면 상태 서술(`지금`)이다. */
export interface WhyNowEvent {
  /** `YYYY-MM-DD`. 없으면 시점이 아니라 **상태**다(화면은 `지금` 으로 쓴다). */
  date?: string;
  /** 왼쪽 열에 쓸 말 — `8월 4일` / `지금`. */
  when: string;
  /** 오른쪽에 쓸 사실 한 줄. 인과·평가·예측 금지(`WHY_NOW_FORBIDDEN`). */
  text: string;
  /** 원문 링크(공시만). 없으면 링크를 그리지 않는다. */
  url?: string;
  /**
   * 번역표에 없어서 **원문 제목이 그대로** 나간 항목인가(WO-RESET-05 §3-1).
   * 화면 동작은 같고, 표를 얼마나 더 채워야 하는지 재는 데 쓴다(보고할 것 3번).
   */
  rawTitle?: boolean;
}

/** `2026-08-04` → `8월 4일`. 형식이 아니면 `null`(지어내지 않는다). */
export function whenLabel(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

/** 공시 한 건 — 저장소가 주는 모양 그대로다(제목·링크만, 본문 없음). */
export interface WhyNowDisclosure {
  date: string;
  title: string;
  kind: string;
  url?: string;
}

export interface WhyNowTimelineInput {
  /** 신호(매수) 시작일 `YYYY-MM-DD`. **항상 있다** — 이게 날짜 항목의 바닥을 보장한다. */
  signalStartedAt?: string;
  /** 매수 주체 — `기관` / `외국인` / `임원`. 주체가 없는 신호(D·E형)에서는 비운다. */
  actor?: string;
  /**
   * 신호 종류. **주체가 없는 형(D·E)을 가리기 위해 받는다.**
   *
   * 없이 두면 `actor` 자리에 `시장 대비`·`거래량` 같은 지표 이름이 들어와
   * **`시장 대비이 사기 시작했어요`** 가 나간다(2026-08-26 프로덕션 실측, 33건 중 9건).
   * 조사도 틀렸지만 더 나쁜 것은 **시장 대비는 아무것도 사지 않는다**는 점이다.
   */
  signalKind?: string;
  /** 최근 90일 공시. 최신순·과거순 무관 — 여기서 정렬한다. */
  disclosures?: readonly WhyNowDisclosure[];
  /** 공시를 **모으긴 했는데 0건**인가. `undefined` 면 아직 수집 전이라 아무 말도 하지 않는다. */
  disclosuresCollected?: boolean;
  /** 실적 변화 — 흑자/적자 전환처럼 **날짜와 변화**가 같이 있을 때만 넘긴다. */
  earnings?: { date: string; text: string };
  /** 값 — 밴드 상·하위 20% 일 때만 쓴다(§C-2 4번). */
  band?: { label: string; current: number | null; percentile: number | null; sufficient: boolean };
  /** 가격 — 52주 저점/고점 **근처(15% 이내)** 일 때만 쓴다(§C-2 5번). */
  pctAboveYearLow?: number;
  pctBelowYearHigh?: number;
}

/** 값·가격을 특이하다고 볼 경계. 이 밖은 애매한 위치라 넣지 않는다(§C-2 중요한 규칙). */
export const WHY_NOW_BAND_EXTREME_PCTILE = 20;
export const WHY_NOW_PRICE_EXTREME_PCT = 15;

/** 공시를 보는 창(일). 매수 시작 **이전** 이 창 안의 공시만 근거로 본다(§C-2 1번). */
export const WHY_NOW_DISCLOSURE_WINDOW_DAYS = 90;

/** 타임라인에 올리는 공시 최대 건수. 다 올리면 목록이지 근거가 아니다. */
const MAX_DISCLOSURES = 3;

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * 「왜 지금 사는가」 타임라인.
 *
 * **날짜 붙은 항목이 하나도 없으면 빈 배열**을 돌려준다 — 호출부는 빈 배열이면 섹션을
 * 그리지 않는다(§C-3). 상태 서술(`지금 …`)만으로는 섹션이 성립하지 않는다.
 *
 * 순서는 **시간순**이다(오래된 것 → 최근 → `지금`). 사건이 매수 시작보다 앞에 있다는 사실
 * 자체가 이 섹션이 보여주려는 것이므로, 우선순위가 아니라 시간이 순서를 정한다.
 */
/**
 * 신호가 **무엇을 시작했는가** — 한 마디.
 *
 * 「누가 샀나」 신호는 주체가 산 것이고, 가격·거래량 신호는 **아무도 사지 않았다.**
 * 후자에 매수 어휘를 쓰면 틀린 말이 된다. 형마다 제 동사를 쓴다.
 *
 * 조사는 `josa()` 로 붙인다 — 주체가 `기관`(받침 ㄴ)·`외국인`(받침 ㄴ)·`외국인·기관`처럼
 * 섞여서 고정 조사는 반드시 어딘가에서 틀린다.
 */
function signalStartPhrase(input: WhyNowTimelineInput): string {
  if (input.signalKind === "market_divergence") return "시장을 앞서기 시작했어요";
  if (input.signalKind === "volume_awakening") return "거래가 붙기 시작했어요";
  const actor = input.actor?.trim();
  if (!actor) return "사기 시작했어요";
  return `${actor}${josa(actor, "이가")} 사기 시작했어요`;
}

export function buildWhyNowTimeline(input: WhyNowTimelineInput): WhyNowEvent[] {
  const dated: WhyNowEvent[] = [];
  const start = input.signalStartedAt?.trim();

  // ① 매수 시작 직전 창 안의 공시 (§C-2 1번) — 있을 때만.
  const inWindow = (input.disclosures ?? [])
    .filter((d) => {
      if (!whenLabel(d.date)) return false;
      if (!start) return true;
      const gap = daysBetween(d.date, start);
      // 매수 시작 **이전** 90일 안. 시작 이후 공시는 "그래서 샀다" 로 읽히므로 넣지 않는다.
      return gap !== null && gap >= 0 && gap <= WHY_NOW_DISCLOSURE_WINDOW_DAYS;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DISCLOSURES);

  for (const d of inWindow) {
    const when = whenLabel(d.date);
    if (!when) continue;
    /**
     * 제목을 **사람 말로 옮긴다**(WO-RESET-05 §3-1). 표에 없으면 원문 그대로 —
     * 억지로 비슷한 칸에 밀어 넣지 않는다. `[원문]` 링크가 옆에 있으므로
     * 원문을 못 보게 되는 것도 아니다.
     */
    const phrase = disclosurePhrase(d.title);
    dated.push({
      date: d.date,
      when,
      text: phrase.text,
      ...(phrase.translated ? {} : { rawTitle: true }),
      ...(d.url ? { url: d.url } : {}),
    });
  }

  // ② 신호 시작일 (§C-2 2번) — 항상. 이 줄이 날짜 항목의 바닥을 보장한다.
  if (start && whenLabel(start)) {
    const followsDisclosure = inWindow.length > 0;
    dated.push({
      date: start,
      when: whenLabel(start)!,
      text: `${followsDisclosure ? "그 다음부터 " : ""}${signalStartPhrase(input)}`,
    });
  }

  // ③ 실적 변화 (§C-2 3번) — 변화가 있을 때만. 날짜가 없으면 근거가 아니다.
  if (input.earnings && whenLabel(input.earnings.date)) {
    dated.push({
      date: input.earnings.date,
      when: whenLabel(input.earnings.date)!,
      text: input.earnings.text,
    });
  }

  dated.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  /**
   * **여기서 끊는다** — 날짜 항목이 없으면 아래 상태 서술을 붙이지 않고 빈 배열을 준다(§C-3).
   * 상태만 남은 「왜 지금 사는가」는 답하는 시늉이다.
   */
  if (dated.length === 0) return [];

  const out = [...dated];

  // ④ 값 — 밴드 상·하위 20% 일 때만 (§C-2 4번).
  const band = input.band;
  if (band?.sufficient && typeof band.percentile === "number" && typeof band.current === "number") {
    const extreme =
      band.percentile <= WHY_NOW_BAND_EXTREME_PCTILE || band.percentile >= 100 - WHY_NOW_BAND_EXTREME_PCTILE;
    if (extreme) {
      out.push({
        when: "지금",
        text: `${band.label} ${multipleText(band.current)} · ${bandPhrase(band.percentile)}`,
      });
    }
  }

  // ⑤ 가격 — 52주 저점/고점 **근처**일 때만 (§C-2 5번). `저점에서 16% 위` 같은 애매한 위치는 뺀다.
  const low = input.pctAboveYearLow;
  const high = input.pctBelowYearHigh;
  if (typeof low === "number" && Number.isFinite(low) && low <= WHY_NOW_PRICE_EXTREME_PCT) {
    out.push({ when: "지금", text: `52주 저점에서 ${Math.round(low)}% 위예요` });
  } else if (typeof high === "number" && Number.isFinite(high) && high <= WHY_NOW_PRICE_EXTREME_PCT) {
    out.push({ when: "지금", text: `52주 고점 대비 ${Math.round(high)}% 아래예요` });
  }

  return out;
}

/**
 * WO-RESET-02 PART B — 분기 영업이익의 **전환**을 찾는다. 날짜는 그 분기의 **공시일**이다.
 *
 * ## 왜 전환만 보나 (B-2)
 *
 * `이익이 나고 있어요` 는 근거가 안 된다 — 이익 나는 회사는 널렸고, 거기엔 날짜도 변화도 없다.
 * `7월 28일에 2분기 영업이익이 흑자로 돌아섰어요` 는 근거가 된다. **날짜와 변화**가 있다.
 *
 * 그래서 계속 흑자거나 계속 적자면 `null` 이다. 상태는 이 섹션의 재료가 아니다.
 *
 * ## 날짜는 지어내지 않는다
 *
 * `filed_at`(공시일)이 없는 분기는 건너뛴다. 기간말(`period_end`)로 대신하면 "6월 30일에
 * 흑자 전환했어요" 가 되는데, 그날 발표된 것이 아니다 — 사용자가 시점을 잘못 읽는다.
 *
 * @param quarters 최신이 뒤에 오도록 정렬된 분기(팩트시트 규약).
 */
export function earningsTurnEvent(
  quarters: ReadonlyArray<{ period: string; filed_at?: string; operating_income: number | null }>
): { date: string; text: string } | null {
  const usable = quarters.filter(
    (q) => typeof q.operating_income === "number" && Number.isFinite(q.operating_income)
  );
  if (usable.length < 2) return null;
  const latest = usable.at(-1)!;
  const prior = usable.at(-2)!;
  const filed = latest.filed_at?.trim();
  if (!filed || !whenLabel(filed)) return null;

  const now = latest.operating_income as number;
  const before = prior.operating_income as number;
  // 분기 라벨 `2026Q2` → `2분기`. 형식이 아니면 분기를 말하지 않는다(지어내지 않는다).
  const q = /Q([1-4])$/.exec(latest.period)?.[1];
  const label = q ? `${q}분기 ` : "";

  if (before <= 0 && now > 0) return { date: filed, text: `${label}영업이익이 흑자로 돌아섰어요` };
  if (before > 0 && now <= 0) return { date: filed, text: `${label}영업이익이 적자로 돌아섰어요` };
  return null;
}

/**
 * `지금` 줄만 만든다 — 값·가격 상태 서술.
 *
 * 왜 따로인가: 날짜 항목은 **굽는 시점**(픽 페이로드)에 굳고, 밴드·52주 위치는 **상세**가
 * 자기 데이터로 안다. 한 함수가 둘을 다 받으려면 굽는 쪽이 밴드까지 읽어야 하는데 그건
 * 이 배치의 범위가 아니다. 그래서 상세가 이 창구로 뒤에 붙인다.
 *
 * **혼자 서지 못한다** — 호출부는 날짜 항목이 하나라도 있을 때만 이걸 붙여야 한다(§C-3).
 * 특이할 때만 넣는 규칙(§C-2 4·5번)은 여기서 지킨다.
 */
export function whyNowStateEvents(input: {
  band?: WhyNowTimelineInput["band"];
  pctAboveYearLow?: number;
  pctBelowYearHigh?: number;
}): WhyNowEvent[] {
  const out: WhyNowEvent[] = [];
  const band = input.band;
  if (band?.sufficient && typeof band.percentile === "number" && typeof band.current === "number") {
    const extreme =
      band.percentile <= WHY_NOW_BAND_EXTREME_PCTILE || band.percentile >= 100 - WHY_NOW_BAND_EXTREME_PCTILE;
    if (extreme) {
      out.push({
        when: "지금",
        text: `${band.label} ${multipleText(band.current)} · ${bandPhrase(band.percentile)}`,
      });
    }
  }
  const low = input.pctAboveYearLow;
  const high = input.pctBelowYearHigh;
  if (typeof low === "number" && Number.isFinite(low) && low <= WHY_NOW_PRICE_EXTREME_PCT) {
    out.push({ when: "지금", text: `52주 저점에서 ${Math.round(low)}% 위예요` });
  } else if (typeof high === "number" && Number.isFinite(high) && high <= WHY_NOW_PRICE_EXTREME_PCT) {
    out.push({ when: "지금", text: `52주 고점 대비 ${Math.round(high)}% 아래예요` });
  }
  return out;
}

/**
 * 공시가 한 건도 없을 때 붙이는 줄 (§C-4).
 *
 * **숨기지 않고 강조한다** — 아무 소식이 없는데 사고 있는 것이 이 제품이 찾는 것이다.
 * 수집 자체를 아직 안 한 종목(`collected !== true`)에는 아무 말도 하지 않는다:
 * "없었다" 와 "안 봤다" 는 다르고, 그 둘을 섞으면 없는 사실을 말하는 것이 된다.
 */
export function whyNowQuietNote(input: {
  disclosuresCollected?: boolean;
  disclosureCount: number;
}): string | null {
  if (input.disclosuresCollected !== true) return null;
  if (input.disclosureCount > 0) return null;
  return `최근 ${WHY_NOW_DISCLOSURE_WINDOW_DAYS}일 공시가 한 건도 없었어요`;
}

/** §C-1 꼬리표 — 타임라인용. 인과를 말하지 않는다는 사실을 화면에 적는다. */
export const WHY_NOW_TIMELINE_DISCLAIMER =
  "이 시점에 함께 있었던 일들이에요. 왜 샀는지는 저희도 확인할 수 없어요.";

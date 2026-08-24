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

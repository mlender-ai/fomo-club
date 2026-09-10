import { describe, it, expect } from "vitest";
import {
  parseBodyEarnings,
  parseBodyAmount,
  parseBodyUnit,
  parseBodyPeriod,
  amountLabelsFor,
  parseRightsIssueAmount,
} from "../src/keyword-cards/disclosure-body";
import {
  disclosureAmountLine,
  disclosureScaleNote,
  earningsFiguresDetail,
  earningsFiguresFromBody,
} from "../src/keyword-cards/disclosure-figures";

/**
 * LAUNCH-P2 §A-2·§B — 본문 파서. **표본은 실제 DART 본문**이다(2026-09-08 채취).
 *
 * 지어낸 픽스처로 통과하는 파서는 프로덕션에서 통과하지 않는다. 아래 문자열은 뷰어에서
 * 태그를 벗겨 낸 실제 텍스트를 줄인 것이고, 손상된 글자(`?��`)도 실제로 그렇게 온다.
 */

/** 빅텍 · 연결재무제표기준영업(잠정)실적(공정공시) · rcpNo 20260807900376 */
const 잠정실적_본문 = `빅텍/연결재무제표 기준 영업(잠정)실적(공정공시)/(2026.08.07) 실적기간 당기실적 2026-04-01 ~ 2026-06-30
 전기실적 2026-01-01 ~ 2026-03-31 전년동기실적 2025-04-01 ~ 2025-06-30
 ※ 동 정보는 확정치가 아닌 잠정치로서 향후 확정치와는 다를 수 있음.
 1. 연결실적내용 구분(단위 : 백만원, %) 당기실적 전기실적 전기대비 전년동기실적 전년동기대비
 (26년2분기) (26년1분기) 증감율(%) 흑자적자전환여부 (25년2분기) 증감율(%) 흑자적자전환여부
 매출액 당해실적 22,574 20,943 7.8 - 14,661 54.0 - 누계실적 43,517 - - - 29,635 46.8 -
 영업이익 당해실적 624 195 220.0 - 861 -27.5 - 누계실적 820 - - - 939 -12.7 -
 법인세비용차감전계속사업이익 당해실적 -802 -486 -65.0 - 1,307 - 적자전환 누계실적 -1,289 - - - 920 - 적자전환
 당기순이익 당해실적 -567 -419 -35.3 - 1,232 - 적자전환 누계실적 -986 - - - 760 - 적자전환`;

/** 일진홀딩스 · 주요사항보고서(자기주식취득신탁계약체결결정) · rcpNo 20260824000072 — 괄호가 깨져 온다 */
const 신탁계약_본문 = `자기주식취득 신탁계약 체결 결정 1. 계약금액(?��) 10,000,000,000 2. 계약기간 시작일 2026년 08월 24일
 종료일 2027년 08월 23일 3. 계약목적 주주가치 제고 4. 계약체결기관 한국투자증권`;

/** 단일판매ㆍ공급계약체결 · rcpNo 20260821800131 */
const 공급계약_본문 = `단일판매ㆍ공급계약체결 계약내역 계약금액(원) 40,480,580,000 계약상대 (주)케이씨 판매·공급지역 국내`;

describe("잠정실적 본문 — 팩트시트 없이도 당기·전년동기가 한 표에 있다 (§A-2)", () => {
  it("매출·영업이익·순이익을 원 단위로 읽는다", () => {
    const parsed = parseBodyEarnings(잠정실적_본문)!;
    expect(parsed.periodLabel).toBe("2026년 2분기");
    expect(parsed.rows).toEqual([
      { label: "매출", now: 22_574_000_000, prior: 14_661_000_000 },
      { label: "영업이익", now: 624_000_000, prior: 861_000_000 },
      { label: "순이익", now: -567_000_000, prior: 1_232_000_000 },
    ]);
  });

  it("단위를 못 읽으면 아무것도 읽지 않는다 — 자릿수를 모르면 숫자가 아니다", () => {
    expect(parseBodyUnit("구분(%) 당기실적")).toBeNull();
    expect(parseBodyEarnings(잠정실적_본문.replace("단위 : 백만원", "단위 : 갤런"))).toBeNull();
  });

  it("기간은 `당기실적` 날짜에서 읽는다 — 첫 괄호를 집으면 작년 분기를 집는다", () => {
    expect(parseBodyPeriod(잠정실적_본문)).toBe("2026년 2분기");
    // 같은 표에 전년동기 헤더 `(25년2분기)` 가 있다. 날짜 라인이 없으면 읽지 않는다.
    expect(parseBodyPeriod("(25년2분기) 매출액 당해실적 1 2 3 - 4 5 -")).toBeNull();
    expect(parseBodyEarnings(잠정실적_본문.replace(/당기실적 2026-04-01 ~ 2026-06-30/, "당기실적 미정"))).toBeNull();
  });

  it("괄호 헤더와 날짜가 어긋나면 읽지 않는다 — 어느 쪽이 맞는지 우리가 모른다", () => {
    expect(parseBodyPeriod(잠정실적_본문.replace("(26년2분기)", "(26년3분기)"))).toBeNull();
  });

  /**
   * 표가 밀리면 자리로 읽는 파서는 **조용히 틀린다.** 열이 모자라면 그 줄을 버린다 —
   * 전년동기 자리에 전기 값이 들어가면 증감율이 통째로 거짓이 된다.
   */
  it("열이 모자란 줄은 버린다", () => {
    const broken = 잠정실적_본문.replace("매출액 당해실적 22,574 20,943 7.8 - 14,661 54.0 -", "매출액 당해실적 22,574 20,943");
    const parsed = parseBodyEarnings(broken)!;
    expect(parsed.rows.map((r) => r.label)).toEqual(["영업이익", "순이익"]);
  });

  it("적자를 부호 그대로 읽는다", () => {
    const parsed = parseBodyEarnings(잠정실적_본문)!;
    expect(parsed.rows.find((r) => r.label === "순이익")!.now).toBeLessThan(0);
  });
});

describe("공시 금액 — 제목에는 없고 본문에는 있다 (§B-1)", () => {
  it("공급계약의 계약금액을 읽는다", () => {
    expect(parseBodyAmount("단일판매ㆍ공급계약체결", 공급계약_본문)).toEqual({ label: "계약금액", won: 40_480_580_000 });
  });

  it("괄호 안 글자가 깨져 있어도 읽는다 — 단위를 못 읽으면 원으로 본다", () => {
    expect(parseBodyAmount("주요사항보고서(자기주식취득신탁계약체결결정)", 신탁계약_본문))
      .toEqual({ label: "계약금액", won: 10_000_000_000 });
  });

  it("금액이 주제가 아닌 서식은 본문을 뒤지지 않는다 — 정기보고서 각주를 잡으면 거짓이 된다", () => {
    // 실측: 반기보고서 본문에서 각주의 `배당금액(USD, 천) 24,845` 가 잡혔다.
    const 반기보고서 = "반기보고서 ... 주석 20. 배당금액(USD, 천) 24,845 ...";
    expect(amountLabelsFor("반기보고서")).toBeNull();
    expect(parseBodyAmount("반기보고서", 반기보고서)).toBeNull();
    expect(parseBodyAmount("주식등의대량보유상황보고서", "취득금액 1,000,000")).toBeNull();
  });

  it("금액을 못 찾으면 null — 0으로 채우지 않는다 (§B-4)", () => {
    expect(parseBodyAmount("단일판매ㆍ공급계약체결", "계약상대 (주)케이씨 판매지역 국내")).toBeNull();
    expect(parseBodyAmount("단일판매ㆍ공급계약체결", "계약금액(원) 0")).toBeNull();
  });

  it("서식별 라벨이 지시서 §B-2 의 8종을 덮는다", () => {
    for (const [title, label] of [
      ["단일판매ㆍ공급계약체결", "계약금액"],
      ["주요사항보고서(자기주식취득결정)", "취득금액"],
      ["주요사항보고서(유상증자결정)", "모집총액"],
      ["주요사항보고서(전환사채발행결정)", "발행금액"],
      ["주요사항보고서(타인에대한담보제공결정)", "담보금액"],
      ["신규시설투자등", "투자금액"],
      ["주요사항보고서(타법인주식및출자증권취득결정)", "취득금액"],
      ["현금ㆍ현물배당결정", "배당금액"],
    ] as const) {
      expect(amountLabelsFor(title), title).toContain(label);
    }
  });
});

/* ─── §B-3 금액 + 비율 한 줄 ─── */
describe("금액은 규모 대비와 함께만 나간다 (§B-3 · 완료 확인 7)", () => {
  const scale = { revenueTtm: 155_000_000_000, marketCap: 820_000_000_000, totalEquity: 240_000_000_000 };

  it("계약금액은 분자가 무엇인지 밝히고 비율과 함께 나온다", () => {
    expect(disclosureAmountLine({ title: "단일판매ㆍ공급계약체결", scale, amountWon: 40_480_580_000 }))
      .toBe("계약금액 405억 · 최근 1년 매출의 26%");
  });

  it("자사주는 시가총액 대비다", () => {
    expect(disclosureAmountLine({ title: "주요사항보고서(자기주식취득신탁계약체결결정)", scale, amountWon: 10_000_000_000 }))
      .toBe("100억 · 시가총액의 1.2%");
  });

  it("분모가 없으면 금액도 쓰지 않는다 — 모르는 크기는 안 쓴 것과 같다", () => {
    expect(disclosureAmountLine({ title: "단일판매ㆍ공급계약체결", scale: {}, amountWon: 40_480_580_000 })).toBeNull();
  });

  it("금액이 없으면 null", () => {
    expect(disclosureAmountLine({ title: "단일판매ㆍ공급계약체결", scale, amountWon: null })).toBeNull();
  });

  it("깨진 계약에는 규모를 환산하지 않는다", () => {
    expect(disclosureAmountLine({ title: "단일판매ㆍ공급계약체결(해지)", scale, amountWon: 40_480_580_000 })).toBeNull();
  });

  it("본문 금액이 제목 파싱보다 우선한다 — 제목에는 금액이 없다(실측 27/27)", () => {
    const note = disclosureScaleNote({ title: "단일판매ㆍ공급계약체결", scale, amountWon: 40_480_580_000 });
    expect(note).toBe("계약금액이 최근 1년 매출의 26%");
    expect(disclosureScaleNote({ title: "단일판매ㆍ공급계약체결", scale })).toBeNull();
  });
});

/* ─── §A-1 실패 사유 · §A-2 본문 폴백 ─── */
describe("실적 숫자가 왜 없는지 사유로 말한다 (§A-1 · 완료 확인 1)", () => {
  const q = (period: string, period_end: string, revenue: number | null, op: number | null, net: number | null) =>
    ({ period, period_end, revenue, operating_income: op, net_income: net });

  it("실적 서식이 아니면 분모에서 빼야 하는 건이다", () => {
    const r = earningsFiguresDetail({ date: "2026-08-04", title: "단일판매ㆍ공급계약체결", quarters: [] });
    expect(r).toEqual({ failure: "not-earnings-form" });
  });

  it("팩트시트에 분기가 하나도 없는 것과, 이어지는 분기가 없는 것을 가른다", () => {
    expect(earningsFiguresDetail({ date: "2026-08-14", title: "반기보고서", quarters: [] }))
      .toEqual({ failure: "no-quarters" });
    // 분기는 있지만 공시일과 10~100일로 이어지지 않는다(1년 전 기간말).
    expect(earningsFiguresDetail({ date: "2026-08-14", title: "반기보고서", quarters: [q("2025Q2","2025-06-30",1,1,1)] }))
      .toEqual({ failure: "no-join" });
  });

  it("작년 같은 분기가 없으면 쓰지 않는다 — 비교 대상 없는 숫자는 항목이 아니다", () => {
    const r = earningsFiguresDetail({ date: "2026-08-14", title: "반기보고서", quarters: [q("2026Q2","2026-06-30",100,10,5)] });
    expect(r).toEqual({ failure: "no-prior-year" });
  });

  it("두 분기가 다 있는데 값이 비면 그것도 따로 센다", () => {
    const r = earningsFiguresDetail({
      date: "2026-08-14", title: "반기보고서",
      quarters: [q("2026Q2","2026-06-30",null,null,null), q("2025Q2","2025-06-30",null,null,null)],
    });
    expect(r).toEqual({ failure: "no-fields" });
  });

  it("다 있으면 숫자가 나온다", () => {
    const r = earningsFiguresDetail({
      date: "2026-08-14", title: "반기보고서",
      quarters: [q("2026Q2","2026-06-30",124_000_000_000,9_200_000_000,7_100_000_000),
                 q("2025Q2","2025-06-30",105_000_000_000,-1_400_000_000,2_100_000_000)],
    });
    expect("figures" in r).toBe(true);
  });
});

describe("본문 표를 화면 형태로 — 조인 경로와 같은 말투 (§A-2)", () => {
  it("증감률·흑자 전환 문장을 같은 함수가 만든다", () => {
    const parsed = parseBodyEarnings(잠정실적_본문)!;
    const figures = earningsFiguresFromBody(parsed)!;
    expect(figures.periodLabel).toBe("2026년 2분기");
    expect(figures.rows.map((r) => `${r.label} ${r.value} ${r.change}`)).toEqual([
      "매출 226억 작년 2분기보다 +54%",
      "영업이익 6억 작년 2분기보다 -28%",
      "순이익 -6억 작년 2분기 12억에서 적자로",
    ]);
    expect(figures.headline).toBe("매출은 늘었는데 영업이익은 줄었어요");
  });

  it("기간 라벨을 못 읽으면 만들지 않는다", () => {
    expect(earningsFiguresFromBody({ periodLabel: "최근", rows: [{ label: "매출", now: 1e9, prior: 1e8 }] })).toBeNull();
  });
});

/** 유상증자결정 · rcpNo 20260821800396 — 금액이 한 필드에 없다 */
const 유상증자_본문 = `주요사항보고서(유상증자결정) 1. 신주의 종류와 수 보통주식(주) 274,683
 2. 1주당 액면가액(원) 5,000 3. 증자전 발행주식총수(주) 보통주식(주) 236,974
 4. 자금조달의 목적 영업양수자금(원) 401,114,915,289
 5. 신주 발행가액 확정발행가 보통주식(원) 1,460,283`;

describe("유상증자 — 금액은 두 필드의 곱이다 (§B-2)", () => {
  it("신주수 × 발행가액으로 모집총액을 만든다", () => {
    const amount = parseBodyAmount("주요사항보고서(유상증자결정)", 유상증자_본문)!;
    expect(amount.label).toBe("모집총액");
    // 274,683 × 1,460,283 — 본문의 `영업양수자금 401,114,915,289` 와 일치한다.
    expect(amount.won).toBe(274_683 * 1_460_283);
    expect(Math.abs(amount.won - 401_114_915_289) / amount.won).toBeLessThan(0.001);
  });

  it("둘 중 하나라도 못 읽으면 만들지 않는다", () => {
    expect(parseRightsIssueAmount("신주의 종류와 수 보통주식(주) 274,683")).toBeNull();
    expect(parseRightsIssueAmount("신주 발행가액 확정발행가 보통주식(원) 1,460,283")).toBeNull();
  });

  it("자리 수를 잘못 읽었으면 버린다 — 한 주에 1억을 넘길 수 없다", () => {
    expect(parseRightsIssueAmount("신주의 종류와 수 보통주식(주) 274,683 신주 발행가액 보통주식(원) 999,999,999")).toBeNull();
  });
});

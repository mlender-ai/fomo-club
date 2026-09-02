/**
 * DETAIL-02 — 「실적을 냈어요」를 실제 숫자로.
 *
 * 이 파일이 지키는 것은 두 가지다.
 *  1. 실적 공시에 **매출·영업이익·순이익**과 **전년 동기 대비**가 붙는다.
 *  2. 못 뽑으면 **지어내지 않는다** — 항목이 없거나 블록 자체가 없다.
 */
import { describe, expect, it } from "vitest";
import {
  EARNINGS_REPORT_TITLE,
  earningsFigures,
  disclosureScaleNote,
  parseKoreanAmountWon,
  formatWonShort,
  type FigureQuarter,
} from "../src/keyword-cards/disclosure-figures";
import { WHY_NOW_FORBIDDEN } from "../src/keyword-cards/why-now";

const EOK = 100_000_000;

/**
 * 바이오니아형 — 작년 2분기 영업 적자, 올해 흑자 전환.
 *
 * **`period_end` 만 들고 있다** — 국내 재무는 공시일이 없어서 조인이 기간말 기준이다.
 * 픽스처에 `filed_at` 을 두면 없어진 동작을 테스트하게 된다.
 */
function quarters(over: Partial<FigureQuarter>[] = []): FigureQuarter[] {
  const base: FigureQuarter[] = [
    {
      period: "2025Q2",
      period_end: "2025-06-30",
      revenue: 1051 * EOK,
      operating_income: -14 * EOK,
      net_income: 21.5 * EOK,
    },
    {
      period: "2026Q1",
      period_end: "2026-03-31",
      revenue: 1100 * EOK,
      operating_income: 40 * EOK,
      net_income: 30 * EOK,
    },
    {
      period: "2026Q2",
      period_end: "2026-06-30",
      revenue: 1240 * EOK,
      operating_income: 92 * EOK,
      net_income: 71 * EOK,
    },
  ];
  return base.map((q, i) => ({ ...q, ...(over[i] ?? {}) }));
}

describe("EARNINGS_REPORT_TITLE — 실적 공시를 가린다", () => {
  it("실적을 담은 서식은 잡는다", () => {
    for (const t of [
      "반기보고서",
      "분기보고서",
      "사업보고서",
      "매출액또는손익구조30%이상변동",
      "연결재무제표기준영업(잠정)실적(공정공시)",
      "[기재정정]반기보고서",
    ]) {
      expect(EARNINGS_REPORT_TITLE.test(t), t).toBe(true);
    }
  });

  it("실적이 아닌 서식은 잡지 않는다", () => {
    for (const t of [
      "타인에대한담보제공결정",
      "자기주식취득결정",
      "단일판매ㆍ공급계약체결",
      "주식등의대량보유상황보고서(일반)",
      "결산실적공시예고",
    ]) {
      expect(EARNINGS_REPORT_TITLE.test(t), t).toBe(false);
    }
  });
});

describe("earningsFigures — 매출·영업이익·순이익 + 전년 동기 대비", () => {
  it("세 항목이 전년 동기 대비와 함께 나온다", () => {
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: quarters() });
    expect(f).not.toBeNull();
    expect(f!.periodLabel).toBe("2026년 2분기");
    expect(f!.rows.map((r) => r.label)).toEqual(["매출", "영업이익", "순이익"]);
    const [rev, op, net] = f!.rows;
    expect(rev!.value).toBe("1,240억");
    expect(rev!.change).toBe("작년 2분기보다 +18%");
    expect(net!.change).toBe("작년 2분기보다 +230%");
    // 흑자 전환은 증감률로 쓸 수 없다 — 문장으로 쓴다(§A-4).
    expect(op!.value).toBe("92억");
    expect(op!.change).toBe("작년 2분기 -14억에서 흑자로");
    expect(op!.change).not.toMatch(/%/);
  });

  it("한 줄 해석은 사실 요약이고 평가가 아니다 (PART B)", () => {
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: quarters() });
    expect(f!.headline).toBe("매출 늘고 영업이익 흑자로 돌아섰어요");
    expect(f!.headline).not.toMatch(/좋았|호실적|개선|나빴|악화|훌륭/);
  });

  it("전 항목·해석에 금지 표현이 없다", () => {
    const f = earningsFigures({ date: "2026-08-14", title: "분기보고서", quarters: quarters() })!;
    for (const text of [f.headline ?? "", f.periodLabel, ...f.rows.flatMap((r) => [r.value, r.change])]) {
      expect(text, text).not.toMatch(WHY_NOW_FORBIDDEN);
      expect(text, text).not.toMatch(/좋았어요|호실적|실적이 개선/);
    }
  });

  it("흑자 전환 해석은 매출 방향에 따라 갈린다", () => {
    const run = (revenue: number, operating: number) =>
      earningsFigures({
        date: "2026-08-14",
        title: "분기보고서",
        quarters: quarters([{}, {}, { revenue: revenue * EOK, operating_income: operating * EOK }]),
      })!.headline;

    expect(run(1240, 92)).toBe("매출 늘고 영업이익 흑자로 돌아섰어요");
    expect(run(900, 5)).toBe("매출은 줄었는데 영업이익은 흑자로 돌아섰어요");
  });

  it("계속 흑자일 때 네 방향을 각각 쓴다", () => {
    const prior = { operating_income: 50 * EOK };
    const run = (revenue: number, operating: number) =>
      earningsFigures({
        date: "2026-08-14",
        title: "분기보고서",
        quarters: quarters([prior, {}, { revenue: revenue * EOK, operating_income: operating * EOK }]),
      })!.headline;
    expect(run(1240, 92)).toBe("매출과 영업이익이 함께 늘었어요");
    expect(run(1240, 10)).toBe("매출은 늘었는데 영업이익은 줄었어요");
    expect(run(900, 92)).toBe("매출은 줄었는데 영업이익은 늘었어요");
    expect(run(900, 10)).toBe("매출과 영업이익이 함께 줄었어요");
  });

  it("흑자 → 적자 전환도 문장으로 쓴다", () => {
    const f = earningsFigures({
      date: "2026-08-14",
      title: "분기보고서",
      quarters: quarters([{ operating_income: 92 * EOK }, {}, { operating_income: -14 * EOK }]),
    })!;
    expect(f.rows.find((r) => r.label === "영업이익")!.change).toBe("작년 2분기 92억에서 적자로");
    expect(f.headline).toBe("매출 늘고 영업이익은 적자로 돌아섰어요");
  });

  it("적자 축소·확대를 구분해서 쓴다", () => {
    const shrunk = earningsFigures({
      date: "2026-08-14",
      title: "분기보고서",
      quarters: quarters([{ operating_income: -140 * EOK }, {}, { operating_income: -14 * EOK }]),
    })!;
    expect(shrunk.rows.find((r) => r.label === "영업이익")!.change).toBe("적자가 -140억에서 -14억으로 줄었어요");

    const grown = earningsFigures({
      date: "2026-08-14",
      title: "분기보고서",
      quarters: quarters([{ operating_income: -14 * EOK }, {}, { operating_income: -140 * EOK }]),
    })!;
    expect(grown.rows.find((r) => r.label === "영업이익")!.change).toBe("적자가 -14억에서 -140억으로 늘었어요");
  });

  it("전년 동기가 없으면 그 항목이 없다 — 맨숫자를 남기지 않는다", () => {
    const only = quarters().slice(1); // 2025Q2 제거
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: only });
    expect(f).toBeNull();
  });

  it("항목 하나가 결측이면 그 줄만 빠진다", () => {
    const f = earningsFigures({
      date: "2026-08-14",
      title: "반기보고서",
      quarters: quarters([{}, {}, { net_income: null }]),
    })!;
    expect(f.rows.map((r) => r.label)).toEqual(["매출", "영업이익"]);
  });

  it("매출·영업이익 중 하나라도 없으면 한 줄 해석을 만들지 않는다", () => {
    const f = earningsFigures({
      date: "2026-08-14",
      title: "반기보고서",
      quarters: quarters([{}, {}, { revenue: null }]),
    })!;
    expect(f.headline).toBeUndefined();
    expect(f.rows.length).toBeGreaterThan(0);
  });

  it("실적 공시가 아니면 숫자를 붙이지 않는다", () => {
    expect(earningsFigures({ date: "2026-08-14", title: "타인에대한담보제공결정", quarters: quarters() })).toBeNull();
  });

  it("공시일과 맞는 분기가 없으면 붙이지 않는다 — 아무 분기나 갖다 붙이지 않는다", () => {
    // 3월 2일 공시는 2025Q4(12/31) 를 말하는데 픽스처에 그 분기가 없다.
    expect(earningsFigures({ date: "2026-03-02", title: "분기보고서", quarters: quarters() })).toBeNull();
  });

  it("기간이 끝난 지 열흘도 안 된 공시는 그 분기를 보고한 것이 아니다", () => {
    // 7월 2일 공시는 6월 30일로 끝난 분기를 말할 수 없다 — 그렇게 빨리 나오는 정기보고서는 없다.
    expect(earningsFigures({ date: "2026-07-02", title: "반기보고서", quarters: quarters() })).toBeNull();
  });

  it("100일보다 오래 지난 기간에는 붙이지 않는다", () => {
    // 12월 1일 공시가 6월 30일 분기를 보고하는 정기보고서는 없다.
    expect(earningsFigures({ date: "2026-12-01", title: "반기보고서", quarters: quarters() })).toBeNull();
  });

  it("창 안에 둘이 들어오면 기간말이 늦은 쪽을 쓴다", () => {
    /**
     * 5월 20일 공시에는 2026Q1(3/31, 50일)과 2025Q4(12/31, 140일)가 후보다.
     * Q4 는 창 밖이지만, 창을 넓혀도 **늦은 쪽(Q1)** 이 이 보고서가 말하는 기간이다.
     * 그래서 전년 동기를 양쪽에 다 주고 Q1 이 뽑히는지 본다.
     */
    const both: FigureQuarter[] = [
      { period: "2024Q4", period_end: "2024-12-31", revenue: 800 * EOK, operating_income: 10 * EOK, net_income: 5 * EOK },
      { period: "2025Q1", period_end: "2025-03-31", revenue: 900 * EOK, operating_income: 20 * EOK, net_income: 9 * EOK },
      { period: "2025Q4", period_end: "2025-12-31", revenue: 1000 * EOK, operating_income: 30 * EOK, net_income: 15 * EOK },
      { period: "2026Q1", period_end: "2026-03-31", revenue: 1100 * EOK, operating_income: 40 * EOK, net_income: 22 * EOK },
    ];
    expect(earningsFigures({ date: "2026-05-20", title: "분기보고서", quarters: both })?.periodLabel)
      .toBe("2026년 1분기");
    // 2월 20일이면 늦은 쪽이 2025Q4 다.
    expect(earningsFigures({ date: "2026-02-20", title: "분기보고서", quarters: both })?.periodLabel)
      .toBe("2025년 4분기");
  });

  it("분기 라벨을 읽을 수 없으면 붙이지 않는다 — 어느 기간인지 못 말하면 숫자도 못 쓴다", () => {
    const odd = quarters([{ period: "FY2025" }, { period: "FY2026Q1" }, { period: "FY2026" }]);
    expect(earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: odd })).toBeNull();
  });

  it("전년 동기 매출이 0 이면 증감률을 쓰지 않는다", () => {
    const f = earningsFigures({
      date: "2026-08-14",
      title: "반기보고서",
      quarters: quarters([{ revenue: 0 }, {}, {}]),
    })!;
    expect(f.rows.find((r) => r.label === "매출")).toBeUndefined();
  });

  it("분기가 하나도 없으면 null", () => {
    expect(earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: [] })).toBeNull();
  });

  // ── 규제검토에서 나온 회귀 ──

  it("해석과 항목 줄이 같은 임계값을 쓴다 — 반올림 0% 인데 `늘었어요` 가 되지 않는다", () => {
    // 1,000억 → 1,002억 = +0.2% → 반올림 0%. 항목은 `비슷해요`, 해석은 있을 수 없다.
    const flat = quarters([{ revenue: 1000 * EOK }, {}, { revenue: 1002 * EOK }]);
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: flat })!;
    expect(f.rows.find((r) => r.label === "매출")!.change).toBe("작년 2분기와 비슷해요");
    expect(f.headline).toBeUndefined();
  });

  it("기저가 작아 증감률이 뜻을 잃으면 절대금액을 나란히 쓴다", () => {
    const tiny = quarters([{ net_income: 30_000_000 }, {}, { net_income: 20 * EOK }]);
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: tiny })!;
    const net = f.rows.find((r) => r.label === "순이익")!;
    // `+6,567%` 는 숫자는 맞지만 과장으로 읽힌다 — 쓰지 않는다.
    expect(net.change).not.toMatch(/%/);
    expect(net.change).toBe("작년 2분기 3,000만에서 20억으로");
  });

  it("적자 규모가 그대로면 `늘었어요` 라고 하지 않는다 — 거짓이다", () => {
    const same = quarters([{ operating_income: -14 * EOK }, {}, { operating_income: -14 * EOK }]);
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: same })!;
    const op = f.rows.find((r) => r.label === "영업이익")!;
    expect(op.change).toBe("작년 2분기와 비슷한 적자예요");
    // 해석도 같이 틀리지 않는다 — 항목 줄과 같은 판별 기준을 쓴다.
    expect(f.headline).toBeUndefined();
  });

  it("반올림해서 같은 표기가 되면 방향을 말하지 않는다 — 화면과 문장이 어긋나지 않게", () => {
    // -140.4억 → -139.6억 은 둘 다 `-140억` 으로 표기된다.
    const rounded = quarters([{ operating_income: -14_040_000_000 }, {}, { operating_income: -13_960_000_000 }]);
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: rounded })!;
    expect(f.rows.find((r) => r.label === "영업이익")!.change).toBe("작년 2분기와 비슷한 적자예요");
  });

  it("영업이익 0 은 적자가 아니다 — 손익분기다", () => {
    const zero = quarters([{ operating_income: 50 * EOK }, {}, { operating_income: 0 }]);
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: zero })!;
    const op = f.rows.find((r) => r.label === "영업이익")!;
    expect(op.change).not.toContain("적자");
    expect(op.change).toBe("작년 2분기보다 -100%");
    // `0만` 은 금액 표기가 아니다.
    expect(op.value).toBe("0원");
  });
});

describe("parseKoreanAmountWon — 제목이 들고 온 금액", () => {
  it("억·조·원 표기를 읽는다", () => {
    expect(parseKoreanAmountWon("계약금액 320억")).toBe(320 * EOK);
    expect(parseKoreanAmountWon("취득금액 150억원")).toBe(150 * EOK);
    expect(parseKoreanAmountWon("1,240억")).toBe(1240 * EOK);
    expect(parseKoreanAmountWon("2.5조")).toBe(2.5 * 1_000_000_000_000);
    expect(parseKoreanAmountWon("50,000,000,000원")).toBe(50_000_000_000);
  });

  it("금액이 없으면 null — 지어내지 않는다", () => {
    expect(parseKoreanAmountWon("타인에대한담보제공결정")).toBeNull();
    expect(parseKoreanAmountWon("")).toBeNull();
    expect(parseKoreanAmountWon(undefined)).toBeNull();
  });

  it("연도·비율·주식수를 금액으로 읽지 않는다", () => {
    expect(parseKoreanAmountWon("주식등의대량보유상황보고서(2025.12)")).toBeNull();
    expect(parseKoreanAmountWon("매출액또는손익구조30%이상변동")).toBeNull();
    expect(parseKoreanAmountWon("자기주식취득결정 · 1,000,000주")).toBeNull();
    // `만주`·`억주` 는 단위가 붙어 있어서 금액으로 읽힐 수 있었다 — 잘못 읽은 분자는 비율을 거짓으로 만든다.
    expect(parseKoreanAmountWon("자기주식취득결정 · 5,000만주")).toBeNull();
    expect(parseKoreanAmountWon("무상증자결정 · 1억주")).toBeNull();
  });
});

describe("disclosureScaleNote — 금액을 규모 대비로 (PART C)", () => {
  const scale = { revenueTtm: 1230 * EOK, marketCap: 5000 * EOK, totalEquity: 2500 * EOK };

  it("수주는 연매출 대비로 환산한다", () => {
    expect(disclosureScaleNote({ title: "단일판매ㆍ공급계약체결 · 계약금액 320억", scale }))
      .toBe("계약금액이 최근 1년 매출의 26%");
  });

  it("자사주·유상증자는 시가총액 대비", () => {
    expect(disclosureScaleNote({ title: "자기주식취득결정 · 취득금액 150억", scale })).toBe("시가총액의 3%");
    expect(disclosureScaleNote({ title: "유상증자결정 · 500억", scale })).toBe("시가총액의 10%");
  });

  it("담보 제공·타법인 취득은 자기자본 대비", () => {
    expect(disclosureScaleNote({ title: "타인에대한담보제공결정 · 200억", scale })).toBe("자기자본의 8%");
    expect(disclosureScaleNote({ title: "타법인주식및출자증권취득결정 · 250억", scale })).toBe("자기자본의 10%");
  });

  it("10% 미만은 소수 한 자리까지", () => {
    expect(disclosureScaleNote({ title: "단일판매ㆍ공급계약체결 · 계약금액 30억", scale }))
      .toBe("계약금액이 최근 1년 매출의 2.4%");
  });

  it("환산 기준이 없으면 아무 말도 하지 않는다", () => {
    expect(disclosureScaleNote({ title: "단일판매ㆍ공급계약체결 · 계약금액 320억", scale: {} })).toBeNull();
    expect(
      disclosureScaleNote({ title: "단일판매ㆍ공급계약체결 · 계약금액 320억", scale: { revenueTtm: 0 } })
    ).toBeNull();
  });

  it("금액이 없거나 종류를 모르면 null", () => {
    expect(disclosureScaleNote({ title: "단일판매ㆍ공급계약체결", scale })).toBeNull();
    expect(disclosureScaleNote({ title: "주주총회소집결의 · 320억", scale })).toBeNull();
  });

  it("깨진 계약에는 규모를 환산하지 않는다 — 없어진 금액이다", () => {
    expect(disclosureScaleNote({ title: "단일판매ㆍ공급계약해지 · 계약금액 320억", scale })).toBeNull();
  });

  it("수주는 분자가 계약 총액임을 문장이 말한다 — `매출이 26% 는다` 로 읽히지 않는다", () => {
    const note = disclosureScaleNote({ title: "단일판매ㆍ공급계약체결 · 계약금액 320억", scale })!;
    expect(note.startsWith("계약금액이")).toBe(true);
    // TTM(최근 4분기)을 `연매출` 이라 부르지 않는다 — 사용자는 "작년 연매출" 로 읽는다.
    expect(note).not.toContain("연매출");
  });

  it("환산 문구에도 금지 표현·평가어가 없다", () => {
    const titles = [
      "단일판매ㆍ공급계약체결 · 계약금액 320억",
      "자기주식취득결정 · 취득금액 150억",
      "유상증자결정 · 500억",
      "타인에대한담보제공결정 · 200억",
      "타법인주식및출자증권취득결정 · 250억",
    ];
    for (const title of titles) {
      const note = disclosureScaleNote({ title, scale })!;
      expect(note, title).toBeTruthy();
      expect(note, note).not.toMatch(WHY_NOW_FORBIDDEN);
      expect(note, note).not.toMatch(/좋았|호실적|개선|유망|크다|작다/);
    }
  });

  it("0.1% 미만은 쓰지 않는다 — 환산해도 감이 안 오는 크기다", () => {
    expect(disclosureScaleNote({ title: "단일판매ㆍ공급계약체결 · 계약금액 1억", scale: { revenueTtm: 5_000_000 * EOK } }))
      .toBeNull();
  });
});

describe("formatWonShort", () => {
  it("억·조 단위로 읽고 부호를 남긴다", () => {
    expect(formatWonShort(1240 * EOK)).toBe("1,240억");
    expect(formatWonShort(-14 * EOK)).toBe("-14억");
    expect(formatWonShort(2.5 * 1_000_000_000_000)).toBe("2.5조");
    expect(formatWonShort(5_000_000)).toBe("500만");
    expect(formatWonShort(0)).toBe("0원");
    // 만 단위 아래는 원으로 — `Math.round(4000/10000) === 0` 이라 그냥 두면 `0만` 이 나간다.
    expect(formatWonShort(4_000)).toBe("4,000원");
    expect(formatWonShort(-4_000)).toBe("-4,000원");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 타임라인 배선 — 숫자가 실제로 「왜 지금 사는가」 줄에 붙는가
// ─────────────────────────────────────────────────────────────────────────────

describe("buildWhyNowTimeline — 공시 줄에 숫자가 붙는다", () => {
  const disclosure = {
    date: "2026-08-14",
    title: "반기보고서",
    kind: "기타",
    url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1",
  };

  /**
   * 굽는 경로가 넣어주는 콜백 그대로다(`quiet-pick.ts`).
   *
   * `why-now.ts` 가 `disclosure-figures` 를 **값으로** 임포트하면 배럴을 타고 조회 라우트
   * 번들에 들어간다(성능 게이트가 +1 을 잡았다). 그래서 자리만 만들고 재료는 여기서 넣는다.
   */
  function figuresFor(scale?: Parameters<typeof disclosureScaleNote>[0]["scale"]) {
    return (d: { date: string; title: string }) => ({
      ...(((): { figures?: NonNullable<ReturnType<typeof earningsFigures>> } => {
        const f = earningsFigures({ date: d.date, title: d.title, quarters: quarters() });
        return f ? { figures: f } : {};
      })()),
      ...(((): { scaleNote?: string } => {
        if (!scale) return {};
        const n = disclosureScaleNote({ title: d.title, scale });
        return n ? { scaleNote: n } : {};
      })()),
    });
  }

  it("실적 공시 줄이 숫자와 한 줄 해석을 들고 온다", async () => {
    const { buildWhyNowTimeline } = await import("../src/keyword-cards/why-now");
    const events = buildWhyNowTimeline({
      signalStartedAt: "2026-09-01",
      actor: "기관",
      disclosures: [disclosure],
      figuresFor: figuresFor(),
    });
    const row = events.find((e) => e.url);
    expect(row).toBeDefined();
    expect(row!.text).toBe("반년 치 실적을 냈어요");
    expect(row!.figures?.headline).toBe("매출 늘고 영업이익 흑자로 돌아섰어요");
    expect(row!.figures?.rows.map((r) => r.label)).toEqual(["매출", "영업이익", "순이익"]);
  });

  it("콜백을 넘기지 않으면 종전대로 제목만 나간다 — 회귀 없음", async () => {
    const { buildWhyNowTimeline } = await import("../src/keyword-cards/why-now");
    const events = buildWhyNowTimeline({
      signalStartedAt: "2026-09-01",
      actor: "기관",
      disclosures: [disclosure],
    });
    const row = events.find((e) => e.url)!;
    expect(row.text).toBe("반년 치 실적을 냈어요");
    expect(row.figures).toBeUndefined();
    expect(row.scaleNote).toBeUndefined();
  });

  it("실적이 아닌 공시에는 규모 환산만 붙는다", async () => {
    const { buildWhyNowTimeline } = await import("../src/keyword-cards/why-now");
    const events = buildWhyNowTimeline({
      signalStartedAt: "2026-09-01",
      actor: "기관",
      disclosures: [{ ...disclosure, title: "단일판매ㆍ공급계약체결 · 계약금액 320억", kind: "수주" }],
      figuresFor: figuresFor({ revenueTtm: 1230 * EOK }),
    });
    const row = events.find((e) => e.url)!;
    expect(row.figures).toBeUndefined();
    expect(row.scaleNote).toBe("계약금액이 최근 1년 매출의 26%");
  });

  it("금액이 없는 공시는 제목만 남는다 (§E-1)", async () => {
    const { buildWhyNowTimeline } = await import("../src/keyword-cards/why-now");
    const events = buildWhyNowTimeline({
      signalStartedAt: "2026-09-01",
      actor: "기관",
      disclosures: [{ ...disclosure, title: "타인에대한담보제공결정", kind: "기타" }],
      figuresFor: figuresFor({ totalEquity: 2500 * EOK }),
    });
    const row = events.find((e) => e.url)!;
    expect(row.text).toBe("회사가 다른 곳에 담보를 제공하기로 했어요");
    expect(row.figures).toBeUndefined();
    expect(row.scaleNote).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 실제 데이터 모양 — 국내 팩트시트가 주는 그대로 조인되는가
// ─────────────────────────────────────────────────────────────────────────────

describe("국내 팩트시트 모양으로 실제 조인된다", () => {
  /**
   * `naver-fundamentals.ts` 가 만드는 레코드 그대로다 —
   * `period` 는 `periodLabel()` 이 `2026Q2` 로, `period_end` 는 `periodKeyToEnd()` 가
   * 월말로 만들고, `filed_at` 은 **법정기한 추정치**다(`filed_at_source: statutory_deadline`).
   *
   * 이 픽스처가 지키는 것: **추정 `filed_at` 이 붙어 있어도 조인이 성립한다.**
   * 종전 규칙(`filed_at` 실측만)이면 국내는 전부 버려져 확보율이 0 이 됐다.
   */
  const naverShape = [
    {
      period: "2025Q2",
      period_end: "2025-06-30",
      filed_at: "2025-08-14",
      filed_at_source: "statutory_deadline",
      revenue: 1051 * EOK,
      operating_income: -14 * EOK,
      net_income: 21.5 * EOK,
      eps_diluted: null,
      source: "naver_finance_quarter",
    },
    {
      period: "2025Q3",
      period_end: "2025-09-30",
      filed_at: "2025-11-14",
      filed_at_source: "statutory_deadline",
      revenue: 1080 * EOK,
      operating_income: 5 * EOK,
      net_income: 3 * EOK,
      eps_diluted: null,
      source: "naver_finance_quarter",
    },
    {
      period: "2026Q2",
      period_end: "2026-06-30",
      filed_at: "2026-08-14",
      filed_at_source: "statutory_deadline",
      revenue: 1240 * EOK,
      operating_income: 92 * EOK,
      net_income: 71 * EOK,
      eps_diluted: null,
      source: "naver_finance_quarter",
    },
  ];

  it("8월 14일 반기보고서가 2026년 2분기 숫자를 들고 온다", () => {
    const f = earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: naverShape });
    expect(f).not.toBeNull();
    expect(f!.periodLabel).toBe("2026년 2분기");
    expect(f!.headline).toBe("매출 늘고 영업이익 흑자로 돌아섰어요");
    expect(f!.rows).toHaveLength(3);
  });

  /** 연간 레코드가 분기 목록에 섞여 들어온 적이 있다 — `2026FY` 는 조용히 건너뛴다. */
  it("연간 라벨이 섞여 들어와도 분기만 쓴다", () => {
    const mixed = [
      ...naverShape,
      { period: "2026FY", period_end: "2026-12-31", revenue: 5000 * EOK, operating_income: 300 * EOK, net_income: 200 * EOK },
    ];
    expect(earningsFigures({ date: "2026-08-14", title: "반기보고서", quarters: mixed })?.periodLabel)
      .toBe("2026년 2분기");
  });
});

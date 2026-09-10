import { describe, expect, it } from "vitest";
import {
  thesisItems,
  thesisCardLine,
  nextEarningsCheck,
  THESIS_FORBIDDEN,
  THESIS_MIN_ITEMS,
  THESIS_MAX_ITEMS,
  type ThesisInput,
} from "../src/keyword-cards/thesis";
import type { SectorComparison } from "../src/keyword-cards/sector-stats";

const peer = (median: number, count = 14, label = "제약"): SectorComparison => ({
  label,
  level: "industry",
  median,
  count,
});

/** 지시서 A-1 목업의 재료 — 종근당 실측 화면에서 왔다. */
const 종근당: ThesisInput = {
  events: [
    {
      date: "2026-08-14",
      when: "8월 14일",
      text: "반년 치 실적을 냈어요",
      figures: {
        periodLabel: "2026년 2분기",
        headline: "매출 늘고 영업이익 흑자로 돌아섰어요",
        rows: [
          { label: "매출", value: "1,240억", change: "작년 2분기보다 +18%" },
          { label: "영업이익", value: "92억", change: "작년 2분기 -14억에서 흑자로" },
        ],
      },
    },
  ],
  valuation: { pbr: 0.88, pbrPeer: peer(1.42), pbrPercentile: 12 },
  supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33, longestWindowDays: 22, startedWhen: "8월 24일" },
  price: { pctAboveYearLow: 9 },
};

describe("항목 구조 — 숫자·시점·확인 지점 (PART A)", () => {
  it("지시서 목업 그대로 나온다", () => {
    const items = thesisItems(종근당);
    expect(items.map((i) => i.kind)).toEqual(["earnings", "valuation", "supply"]);

    const [earnings, valuation, supply] = items;
    expect(earnings!.title).toBe("매출 늘고 영업이익 흑자로 돌아섰어요");
    expect(earnings!.when).toBe("8월 14일 2026년 2분기 실적");
    expect(earnings!.numbers[0]).toEqual({ label: "매출", value: "1,240억", compare: "작년 2분기보다 +18%" });
    expect(earnings!.nextCheck).toBe("다음 실적 발표는 보통 11월이에요");

    // 숫자 하나에 비교 대상 둘 — 업종 평균과 5년 위치를 함께(A-1 목업).
    expect(valuation!.numbers[0]).toEqual({
      label: "PBR",
      value: "0.88배",
      compare: "다른 제약 14곳 평균 1.42배",
      also: "5년 범위에서 아래 12% 지점",
    });

    expect(supply!.numbers.map((n) => n.compare)).toEqual([
      "최근 22거래일 중 가장 길어요",
      "거래량은 평소의 33%",
    ]);
  });

  it("**모든 숫자에 비교 대상이 있다** — 타입이 강제하고 값도 비어 있지 않다 (D-1)", () => {
    for (const item of thesisItems(종근당)) {
      expect(item.numbers.length).toBeGreaterThan(0);
      for (const n of item.numbers) {
        expect(n.compare.trim().length, `${item.kind} ${n.value}`).toBeGreaterThan(0);
      }
    }
  });

  it("항목은 2~3개다", () => {
    const items = thesisItems(종근당);
    expect(items.length).toBeGreaterThanOrEqual(THESIS_MIN_ITEMS);
    expect(items.length).toBeLessThanOrEqual(THESIS_MAX_ITEMS);
  });
});

describe("우선순위와 선택 (PART B)", () => {
  it("실적 → 공시 → 값 순이다", () => {
    const items = thesisItems({
      events: [
        {
          when: "8월 14일",
          text: "반년 치 실적을 냈어요",
          figures: { periodLabel: "2026년 2분기", rows: [{ label: "매출", value: "1,240억", change: "작년보다 +18%" }] },
        },
        { when: "8월 4일", text: "큰 계약을 따냈어요 · 계약금액 320억", scaleNote: "계약금액이 최근 1년 매출의 26%" },
      ],
      valuation: { pbr: 0.88, pbrPeer: peer(1.42) },
    });
    expect(items.map((i) => i.kind)).toEqual(["earnings", "disclosure", "valuation"]);
  });

  it("**수급은 다른 항목이 2개 이상이면 뒤로 밀린다** (B-2 4번)", () => {
    const items = thesisItems(종근당);
    // 실적·값이 있으니 수급은 3번째. 가격 위치(순위 8)보다는 앞이다 — A-1 목업이 그렇다.
    expect(items[2]!.kind).toBe("supply");
    expect(items.some((i) => i.kind === "price")).toBe(false);
  });

  it("수급 말고 하나뿐이면 순위표 그대로다 — 밀어내면 채울 것이 없다", () => {
    const items = thesisItems({
      supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33, longestWindowDays: 22 },
      price: { pctAboveYearLow: 9 },
    });
    expect(items.map((i) => i.kind)).toEqual(["supply", "price"]);
  });

  it("숫자가 없으면 그 항목을 건너뛴다 (B-2 3번)", () => {
    // 금액 규모 환산이 없는 공시는 항목이 되지 않는다.
    const items = thesisItems({
      events: [{ when: "8월 4일", text: "큰 계약을 따냈어요" }],
      valuation: { pbr: 0.88, pbrPeer: peer(1.42) },
      supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33, longestWindowDays: 22 },
    });
    expect(items.some((i) => i.kind === "disclosure")).toBe(false);
  });

  it("연속일수에 비교 대상이 없으면 그 숫자를 쓰지 않는다", () => {
    const items = thesisItems({
      valuation: { pbr: 0.88, pbrPeer: peer(1.42) },
      // `longestWindowDays` 가 없다 — `3일 연속` 만 남으면 비교 대상이 없다.
      supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33 },
    });
    const supply = items.find((i) => i.kind === "supply");
    expect(supply?.numbers.map((n) => n.value)).toEqual(["1,563주"]);
  });

  it("**2개도 못 채우면 빈 배열** — 억지로 채우지 않는다 (A-3)", () => {
    expect(thesisItems({})).toEqual([]);
    expect(thesisItems({ price: { pctAboveYearLow: 9 } })).toEqual([]);
    // 값만 있어도 하나뿐이면 안 만든다.
    expect(thesisItems({ valuation: { pbr: 0.88, pbrPeer: peer(1.42) } })).toEqual([]);
  });

  it("업종 비교도 5년 밴드도 없으면 값 항목이 없다 — 맨숫자를 남기지 않는다", () => {
    const items = thesisItems({
      ...종근당,
      valuation: { pbr: 0.88, pbrPeer: null, pbrPercentile: null },
    });
    expect(items.some((i) => i.kind === "valuation")).toBe(false);
  });
});

describe("다음 확인 지점 — 예측이 아니라 일정·조건 (PART C)", () => {
  it("분기별 다음 발표 달을 법정 기한에서 낸다", () => {
    expect(nextEarningsCheck("2026년 1분기")).toBe("다음 실적 발표는 보통 8월이에요");
    expect(nextEarningsCheck("2026년 2분기")).toBe("다음 실적 발표는 보통 11월이에요");
    expect(nextEarningsCheck("2026년 3분기")).toBe("다음 실적 발표는 보통 다음 해 3월이에요");
    expect(nextEarningsCheck("2026년 4분기")).toBe("다음 실적 발표는 보통 5월이에요");
  });

  it("기간을 못 읽으면 만들지 않는다 — 지어내지 않는다", () => {
    expect(nextEarningsCheck("최근")).toBeNull();
    expect(nextEarningsCheck("")).toBeNull();
  });

  it("값·수급에는 조건형 확인 지점이 붙는다", () => {
    const items = thesisItems(종근당);
    expect(items.find((i) => i.kind === "valuation")!.nextCheck).toBe("다음 분기 실적이 나오면 값이 다시 계산돼요");
    expect(items.find((i) => i.kind === "supply")!.nextCheck).toBe("연속이 끊기면 이 신호는 끝나요");
  });

  it("**예측 표현이 없다** — `오를`·`재평가`·`기대` (C-3 · 하지 말 것 3번)", () => {
    const inputs: ThesisInput[] = [
      종근당,
      { ...종근당, valuation: { pbr: 3.4, pbrPeer: peer(1.42), pbrPercentile: 92 } },
      { supply: { actor: "외국인", days: 5, scale: "12만주", volumePct: 61, longestWindowDays: 40 }, volume: { ratio: 3.2 } },
      { events: [{ when: "8월 4일", text: "큰 계약을 따냈어요 · 계약금액 320억", scaleNote: "계약금액이 최근 1년 매출의 26%" }], price: { pctBelowYearHigh: 4 } },
    ];
    for (const input of inputs) {
      for (const item of thesisItems(input)) {
        const lines = [item.title, item.when ?? "", item.nextCheck ?? "", ...item.numbers.flatMap((n) => [n.value, n.compare, n.also ?? ""])];
        for (const line of lines) {
          expect(THESIS_FORBIDDEN.test(line), `${item.kind}: "${line}"`).toBe(false);
        }
      }
    }
  });
});

describe("카드 한 줄 (PART E)", () => {
  it("눈에 띄는 것이 둘 이상이면 한 줄이 나온다", () => {
    expect(thesisCardLine(thesisItems(종근당))).toBe("실적 흑자 전환 · 값은 5년 중 낮은 편");
  });

  it("수급은 넣지 않는다 — 훅이 이미 말했다", () => {
    const line = thesisCardLine(thesisItems(종근당));
    expect(line).not.toContain("기관");
    expect(line).not.toContain("연속");
  });

  it("항목이 하나뿐이거나 수급뿐이면 줄이 없다", () => {
    expect(thesisCardLine([])).toBeNull();
    const supplyOnly = thesisItems({
      supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33, longestWindowDays: 22 },
      price: { pctAboveYearLow: 9 },
    });
    // 수급 + 가격 → 카드 줄에 쓸 수 있는 것은 가격 하나뿐이라 만들지 않는다.
    expect(thesisCardLine(supplyOnly)).toBeNull();
  });

  it("실적 방향을 지어내지 않는다 — 흑자 전환이 아니면 그렇게 쓰지 않는다", () => {
    const down = thesisItems({
      events: [
        {
          when: "8월 14일",
          text: "반년 치 실적을 냈어요",
          figures: {
            periodLabel: "2026년 2분기",
            headline: "매출과 영업이익이 줄었어요",
            rows: [{ label: "매출", value: "980억", change: "작년 2분기보다 -12%" }],
          },
        },
      ],
      valuation: { pbr: 3.4, pbrPeer: peer(1.42), pbrPercentile: 92 },
    });
    const line = thesisCardLine(down);
    expect(line).toContain("실적 감소");
    expect(line).not.toContain("흑자");
    expect(line).toContain("값은 5년 중 높은 편");
  });
});

/**
 * LAUNCH-P2 §B — 공시 항목은 `scaleNote` 가 있어야 만들어지는데 **그게 항상 null 이었다**
 * (금액 확보율 0%). 본문에서 금액을 읽기 시작하면서 이 항목이 처음으로 생긴다.
 */
describe("공시 항목 — 금액과 비교 대상을 가른다 (LAUNCH-P2 §B)", () => {
  /** 항목이 둘 이상이어야 블록이 만들어지므로(A-3) 수급을 함께 넣는다 — 실측 화면과 같다. */
  const base: ThesisInput = {
    supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33, longestWindowDays: 22, startedWhen: "8월 24일" },
  };

  it("금액+비율 한 줄에서 값과 비교 대상을 가른다", () => {
    const items = thesisItems({
      ...base,
      events: [{ date: "2026-08-21", when: "8월 21일", text: "큰 계약을 따냈어요", scaleNote: "계약금액 405억 · 최근 1년 매출의 26%" }],
    });
    const item = items.find((i) => i.kind === "disclosure");
    expect(item?.numbers[0]).toEqual({ value: "계약금액 405억", compare: "최근 1년 매출의 26%" });
  });

  it("비율만 오면 제목 뒤 금액을 값으로 쓴다 — 종전 모양도 계속 지원한다", () => {
    const items = thesisItems({
      ...base,
      events: [{ date: "2026-08-24", when: "8월 24일", text: "자기주식을 사들여요 · 100억", scaleNote: "시가총액의 1.2%" }],
    });
    const item = items.find((i) => i.kind === "disclosure");
    expect(item?.numbers[0]).toEqual({ value: "100억", compare: "시가총액의 1.2%" });
  });

  it("가격 항목에도 다음 확인 지점이 붙는다 — 예측이 아니라 사실을 쓴다", () => {
    const items = thesisItems({ ...base, price: { pctAboveYearLow: 8 } });
    const item = items.find((i) => i.kind === "price");
    expect(item?.nextCheck).toBe("52주 저점·고점은 매일 다시 계산돼요");
    for (const banned of ["깨면", "돌파", "예상", "전망"]) {
      expect(item?.nextCheck ?? "", banned).not.toContain(banned);
    }
  });
});

/** LAUNCH-P2 실측 — 새로 생긴 두 항목(공시·거래량)에 다음 확인 지점이 없었다. */
describe("모든 항목에 다음 확인 지점이 있다 (THESIS-01 · LAUNCH-P2 실측)", () => {
  it("공시 항목은 언제 매출이 될지 말하지 않고 어디서 확인되는지만 말한다", () => {
    const items = thesisItems({
      supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33, longestWindowDays: 22, startedWhen: "8월 24일" },
      events: [{ date: "2026-09-02", when: "9월 2일", text: "큰 계약을 따냈어요", scaleNote: "계약금액 5,014억 · 최근 1년 매출의 100%" }],
    });
    const item = items.find((i) => i.kind === "disclosure")!;
    expect(item.nextCheck).toBe("이 금액이 얼마나 반영됐는지는 다음 실적에서 확인돼요");
    // 계약 기간을 모르므로 시점을 단정하지 않는다.
    for (const banned of ["부터 반영", "내년", "다음 달", "예상", "전망"]) {
      expect(item.nextCheck ?? "", banned).not.toContain(banned);
    }
  });

  it("거래량 항목의 다음 확인 지점은 그 신호의 정의다", () => {
    const items = thesisItems({
      supply: { actor: "기관", days: 3, scale: "1,563주", volumePct: 33, longestWindowDays: 22, startedWhen: "8월 24일" },
      volume: { ratio: 4.2 },
    });
    expect(items.find((i) => i.kind === "volume")?.nextCheck).toBe("거래량이 평소로 돌아오면 이 신호는 끝나요");
  });
});

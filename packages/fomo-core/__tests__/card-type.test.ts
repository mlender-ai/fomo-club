import { describe, expect, it } from "vitest";
import {
  FLAT_PCT,
  MIN_BAR_DAYS,
  QUIET_UP_PCT,
  RATIO_PCT,
  selectCardType,
  type CardTypeInput,
} from "../src/keyword-cards/card-type";

/** 우상향 누적 매수선 + 같은 길이 주가선. A형 재료의 최소 형태. */
const rising = (n = 20): number[] => Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 4_000_000));
const drifting = (n = 20, from = 100, to = 96): number[] =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

const base: CardTypeInput = { kind: "insider_cluster", days: 8, scale: "$8.3M", insiderCount: 4 };

describe("selectCardType — A 역행", () => {
  it("누적 매수선이 있고 주가가 정체면 A, 문장은 '제자리'", () => {
    const d = selectCardType({ ...base, priceChangeSincePct: -0.4, priceSeries: drifting(), cumulativeBuySeries: rising() });
    expect(d?.type).toBe("A");
    expect(d?.hook).toBe("주가는 제자리인데\n임원만 사고 있어요");
    expect(d?.figure.kind).toBe("divergence");
  });

  it("주가가 하락이면 '빠지는데' 변형", () => {
    const d = selectCardType({ ...base, priceChangeSincePct: -5.9, priceSeries: drifting(), cumulativeBuySeries: rising() });
    expect(d?.hook).toBe("주가는 빠지는데\n임원은 사고 있어요");
  });

  it("정체 밴드 위 · 소폭 상승 상한 이내면 '조용한데' 변형", () => {
    const d = selectCardType({ ...base, priceChangeSincePct: 2.69, priceSeries: drifting(), cumulativeBuySeries: rising() });
    expect(d?.hook).toBe("주가는 조용한데\n임원이 계속 사고 있어요");
  });

  it("소폭 상승 상한을 넘으면 역행이 아니다 — A 를 쓰지 않는다", () => {
    const d = selectCardType({
      ...base,
      priceChangeSincePct: QUIET_UP_PCT + 0.1,
      priceSeries: drifting(),
      cumulativeBuySeries: rising(),
      volumePct: 22.7,
    });
    expect(d?.type).toBe("B");
  });

  it("누적선이 우상향하지 않으면 A 를 쓰지 않는다 (WO §4-2)", () => {
    const flat = Array.from({ length: 20 }, () => 1_000_000);
    const d = selectCardType({
      ...base,
      priceChangeSincePct: -1,
      priceSeries: drifting(),
      cumulativeBuySeries: flat,
      volumePct: 42.9,
    });
    expect(d?.type).toBe("B");
  });

  it("두 계열 길이가 다르면 짧은 쪽에 맞춰 **최근**을 남긴다", () => {
    const d = selectCardType({
      ...base,
      priceChangeSincePct: -1,
      priceSeries: drifting(30),
      cumulativeBuySeries: rising(12),
    });
    const fig = d?.figure;
    expect(fig?.kind).toBe("divergence");
    if (fig?.kind !== "divergence") throw new Error("A형이 아니다");
    expect(fig.priceSeries).toHaveLength(12);
    expect(fig.buySeries).toHaveLength(12);
    expect(fig.priceSeries.at(-1)).toBe(drifting(30).at(-1));
  });

  it("범례가 주체를 말한다", () => {
    const d = selectCardType({
      ...base,
      kind: "institution_streak",
      priceChangeSincePct: -1,
      priceSeries: drifting(),
      cumulativeBuySeries: rising(),
    });
    if (d?.figure.kind !== "divergence") throw new Error("A형이 아니다");
    expect(d.figure.buyLegend).toBe("기관 매수 누적");
  });
});

describe("selectCardType — B 비율", () => {
  it("비율이 하한 이상이면 B, 큰 숫자는 반올림 정수", () => {
    const d = selectCardType({ ...base, volumePct: 51.4, priceSeries: drifting() });
    expect(d?.type).toBe("B");
    if (d?.figure.kind !== "ratio") throw new Error("B형이 아니다");
    expect(d.figure.ratioPct).toBe(51);
  });

  it("구간별 표현 (WO §5-2)", () => {
    const at = (pct: number) => selectCardType({ ...base, volumePct: pct, priceSeries: drifting() })?.hook;
    expect(at(51)).toBe("임원이 하루 거래량의\n절반을 사갔어요");
    expect(at(30)).toBe("임원이 하루 거래량의\n3분의 1을 사갔어요");
    expect(at(15)).toBe("임원이 하루 거래량의\n상당 부분을 사갔어요");
  });

  it("하한 미만이면 B 를 쓰지 않는다", () => {
    const d = selectCardType({ ...base, volumePct: RATIO_PCT - 0.1, priceSeries: drifting() });
    expect(d).toBeNull(); // C 재료(일별 매수 여부)도 없으므로 픽에서 빠진다
  });
});

describe("selectCardType — C 희소성", () => {
  const window = (pattern: string) => [...pattern].map((c) => c === "1");

  it("현재 연속이 창 내 최장이면 '가장 길게' 문장", () => {
    const buyDays = window("0100010000000010000000000000000000001111");
    const d = selectCardType({ ...base, kind: "institution_streak", buyDays });
    expect(d?.type).toBe("C");
    expect(d?.hook).toBe("40거래일 만에\n가장 길게 사고 있어요");
    if (d?.figure.kind !== "streak") throw new Error("C형이 아니다");
    expect(d.figure.streakFrom).toBe(36);
    expect(d.figure.streakTo).toBe(39);
  });

  it("최장이 아니면 연속일수를 말한다", () => {
    const buyDays = window("0111111000000000000000000000000000000011");
    const d = selectCardType({ ...base, kind: "institution_streak", buyDays });
    expect(d?.hook).toBe("기관이 2일째\n조용히 사고 있어요");
  });

  it("마지막 날이 매수일이 아니면 현재 연속이 없다 — C 불가", () => {
    const buyDays = window("1111000000000000000000000000000000000000");
    expect(selectCardType({ ...base, kind: "institution_streak", buyDays })).toBeNull();
  });

  it("창이 최소 표본보다 짧으면 C 를 쓰지 않는다", () => {
    const buyDays = Array.from({ length: MIN_BAR_DAYS - 1 }, () => true);
    expect(selectCardType({ ...base, kind: "institution_streak", buyDays })).toBeNull();
  });
});

describe("selectCardType — 후킹 없는 카드를 만들지 않는다 (WO §1-1)", () => {
  it("세 형 재료가 전부 없으면 null", () => {
    expect(selectCardType({ kind: "institution_streak", days: 4 })).toBeNull();
  });

  it("A 재료가 있어도 주가가 크게 올랐고 B·C 재료가 없으면 null", () => {
    expect(
      selectCardType({ ...base, priceChangeSincePct: 15, priceSeries: drifting(), cumulativeBuySeries: rising() })
    ).toBeNull();
  });
});

describe("보조 2줄 (WO §3-⑤)", () => {
  const withSupport = (extra: Partial<CardTypeInput>) =>
    selectCardType({ ...base, priceChangeSincePct: -1, priceSeries: drifting(), cumulativeBuySeries: rising(), ...extra });

  it("1줄은 기간·인원·규모, 2줄은 희소성 — 최대 2줄", () => {
    const d = withSupport({ priorBuys12mo: 3 });
    expect(d?.support).toEqual(["8일간 · 4명 · $8.3M", "1년 매수는 3건뿐이었어요"]);
  });

  it("1년간 매수가 없었으면 그 사실을 쓴다", () => {
    expect(withSupport({ priorBuys12mo: 0 })?.support[1]).toBe("지난 1년간 임원이 산 적이 없었어요");
  });

  it("후킹에 이미 나온 숫자를 되풀이하지 않는다", () => {
    // 후킹(B형)이 '3분의 1' 로 3 을 쓰므로 `1년 매수는 3건뿐` 은 빠진다.
    const d = selectCardType({ ...base, volumePct: 30, priceSeries: drifting(), priorBuys12mo: 3 });
    expect(d?.support).toEqual(["8일간 · 4명 · $8.3M"]);
  });

  it("빈도 자료가 없으면 거래량 진공을 쓴다", () => {
    expect(withSupport({ volumeVacuumRatio: 0.42 })?.support[1]).toBe("거래는 평소의 42%로 말라 있었어요");
  });

  it("C형은 후킹이 이미 희소성을 말하므로 진공 줄을 겹치지 않는다", () => {
    const buyDays = [...("0000000000000000000000000000000000001111" as string)].map((c) => c === "1");
    const d = selectCardType({ ...base, kind: "institution_streak", buyDays, volumeVacuumRatio: 0.4 });
    expect(d?.support).toEqual(["8일간 · 4명 · $8.3M"]);
  });
});

describe("임계값이 실측 분포와 맞는가 (2026-08-22 발행 덱 10장)", () => {
  it("정체 밴드는 WO §4-1 이 고정한 ±2%", () => {
    expect(FLAT_PCT).toBe(2.0);
  });

  it("B형 하한은 관측 공백 구간(2.5 ~ 22.7) 안에 있다", () => {
    expect(RATIO_PCT).toBeGreaterThan(2.5);
    expect(RATIO_PCT).toBeLessThan(22.7);
  });

  it("소폭 상승 상한은 덱 |변동| 중앙값 2.72% 근방이다", () => {
    expect(QUIET_UP_PCT).toBeGreaterThanOrEqual(2.72);
    expect(QUIET_UP_PCT).toBeLessThan(4);
  });
});

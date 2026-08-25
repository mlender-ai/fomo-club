import { describe, expect, it } from "vitest";
import {
  FLAT_PCT,
  MIN_BAR_DAYS,
  QUIET_UP_PCT,
  RATIO_PCT,
  DIVERGENCE_WINDOW,
  selectCardType,
  type CardTypeInput,
} from "../src/keyword-cards/card-type";

/** 우상향 누적 매수선 + 같은 길이 주가선. A형 재료의 최소 형태. */
const rising = (n = 20): number[] => Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 4_000_000));
const drifting = (n = 24, from = 100, to = 96): number[] =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

/**
 * **그려질 창**(`DIVERGENCE_WINDOW`)에서 정확히 `netPct` 만큼 움직이는 주가 계열.
 *
 * 2026-08-25 이후 A형 훅은 `priceChangeSincePct`(스칼라)가 아니라 **그린 창의 순변동**으로
 * 판정한다. 그래서 픽스처도 의도한 변동을 **계열에 담아야** 한다 — 스칼라만 바꾸면
 * 화면과 어긋나던 옛 버그를 테스트가 그대로 재현하게 된다.
 */
const windowNet = (netPct: number, n: number = DIVERGENCE_WINDOW): number[] =>
  Array.from({ length: n }, (_, i) => 100 + ((100 * netPct) / 100) * (i / (n - 1)));

/**
 * 같은 순변동이되 **흔들리며** 가는 주가 — 실제 주가의 모양이다.
 *
 * 왜 필요한가: `windowNet` 은 **단조**로 간다. 누적 매수선도 단조 증가라 둘의 상관계수가
 * 0.87 까지 올라가고, 그러면 `DIVERGENCE_MAX_CORRELATION` 에 걸려 A형이 성립하지 않는다.
 * 그것은 버그가 아니라 **의도**다(WO-RESET-01 B-2) — 주가가 매수와 나란히 오르면 역행이 아니다.
 * 문안 변형을 검사하려면 역행이 성립하는 재료를 줘야 하므로 지그재그를 쓴다(상관 0.17).
 */
const zigzagNet = (netPct: number, n: number = DIVERGENCE_WINDOW): number[] =>
  Array.from({ length: n }, (_, i) => {
    const base = 100 + ((100 * netPct) / 100) * (i / (n - 1));
    // 흔들림은 **내부 점에만** — 양 끝을 흔들면 순변동이 어긋나 문안 판정이 바뀐다.
    const wiggle = i === 0 || i === n - 1 ? 0 : i % 2 === 0 ? -5 : 5;
    return base + wiggle;
  });

const base: CardTypeInput = { kind: "insider_cluster", days: 8, scale: "$8.3M", insiderCount: 4 };

describe("selectCardType — A 역행", () => {
  it("누적 매수선이 있고 주가가 정체면 A, 문장은 '제자리'", () => {
    const d = selectCardType({ ...base, priceChangeSincePct: -0.4, priceSeries: drifting(), cumulativeBuySeries: rising() });
    expect(d?.type).toBe("A");
    expect(d?.hook).toBe("주가는 제자리인데\n임원만 사고 있어요");
    expect(d?.figure.kind).toBe("divergence");
  });

  it("주가가 하락이면 '빠지는데' 변형", () => {
    const d = selectCardType({ ...base, priceSeries: zigzagNet(-5.9), cumulativeBuySeries: rising() });
    expect(d?.hook).toBe("주가는 빠지는데\n임원은 사고 있어요");
  });

  it("정체 밴드 위 · 소폭 상승 상한 이내면 '조용한데' 변형", () => {
    const d = selectCardType({ ...base, priceSeries: zigzagNet(2.69), cumulativeBuySeries: rising() });
    expect(d?.hook).toBe("주가는 조용한데\n임원이 계속 사고 있어요");
  });

  it("소폭 상승 상한을 넘으면 역행이 아니다 — A 를 쓰지 않는다", () => {
    const d = selectCardType({
      ...base,
      priceSeries: windowNet(QUIET_UP_PCT + 0.1),
      cumulativeBuySeries: rising(),
      volumePct: 22.7,
      sparkline: drifting(),
    });
    expect(d?.type).toBe("B");
  });

  /**
   * WO-RESET-01 B-2 — 화면 지적: "주가는 빠지는데 기관은 사고 있어요" 라고 쓰여 있는데
   * 회색선과 라임선이 거의 나란히 움직였다. 글이 말하는 걸 그림이 반박했다.
   */
  it("두 선이 나란히 움직이면 역행이 아니다 — A 를 쓰지 않는다", () => {
    // 단조 상승 주가 + 단조 증가 매수누적 = 상관 0.87. 눈으로 보면 두 선이 나란하다.
    const d = selectCardType({
      ...base,
      priceSeries: windowNet(2.5),
      cumulativeBuySeries: rising(),
      volumePct: 42.9,
      sparkline: drifting(),
    });
    expect(d?.type).toBe("B"); // A 를 건너뛰고 B 로 간다
  });

  it("같은 순변동이라도 주가가 흔들리면(상관 낮음) 역행이 성립한다", () => {
    const d = selectCardType({ ...base, priceSeries: zigzagNet(2.5), cumulativeBuySeries: rising() });
    expect(d?.type).toBe("A");
  });

  it("주가가 평평하면(분산 0) 상관을 못 구해도 통과한다 — A형의 최고 재료다", () => {
    const flatPrice = Array.from({ length: DIVERGENCE_WINDOW }, () => 100);
    const d = selectCardType({ ...base, priceSeries: flatPrice, cumulativeBuySeries: rising() });
    expect(d?.type).toBe("A");
    expect(d?.hook).toBe("주가는 제자리인데\n임원만 사고 있어요");
  });

  it("누적선이 우상향하지 않으면 A 를 쓰지 않는다 (WO §4-2)", () => {
    const flat = Array.from({ length: 20 }, () => 1_000_000);
    const d = selectCardType({
      ...base,
      priceChangeSincePct: -1,
      priceSeries: drifting(),
      cumulativeBuySeries: flat,
      volumePct: 42.9,
      sparkline: drifting(),
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
    const d = selectCardType({ ...base, volumePct: 51.4, sparkline: drifting() });
    expect(d?.type).toBe("B");
    if (d?.figure.kind !== "ratio") throw new Error("B형이 아니다");
    expect(d.figure.ratioPct).toBe(51);
  });

  it("구간별 표현 — 전 구간이 구체적 분수를 말한다(모호한 '상당 부분' 없음)", () => {
    const at = (pct: number) => selectCardType({ ...base, volumePct: pct, sparkline: drifting() })?.hook;
    expect(at(51)).toBe("임원이 하루 거래량의\n절반을 사갔어요");
    expect(at(30)).toBe("임원이 하루 거래량의\n3분의 1을 사갔어요");
    expect(at(21)).toBe("임원이 하루 거래량의\n5분의 1을 사갔어요");
    // 하한 위 어디에도 '상당 부분' 이 남아 있으면 안 된다 — 그것은 후킹이 아니라 말을 안 한 것이다.
    for (const pct of [20, 24, 25, 44, 45, 80]) {
      expect(at(pct)).not.toContain("상당 부분");
    }
  });

  it("캡션용 주체를 실어 보낸다 — 그림 아래 한 줄이 accent 를 설명해야 한다", () => {
    const d = selectCardType({ ...base, volumePct: 51.4, sparkline: drifting() });
    if (d?.figure.kind !== "ratio") throw new Error("B형이 아니다");
    expect(d.figure.actor).toBe("임원");
  });

  it("하한 미만이면 B 를 쓰지 않는다", () => {
    const d = selectCardType({ ...base, volumePct: RATIO_PCT - 0.1, sparkline: drifting() });
    expect(d).toBeNull(); // C 재료(일별 매수 여부)도 없으므로 픽에서 빠진다
  });

  it("스파크라인이 20포인트 미만이면 그림 없이 큰 숫자만 — 카드를 버리지 않는다", () => {
    const d = selectCardType({ ...base, volumePct: 51.4, sparkline: [980, 990, 1000] });
    expect(d?.type).toBe("B");
    if (d?.figure.kind !== "ratio") throw new Error("B형이 아니다");
    expect(d.figure.ratioPct).toBe(51);
    expect(d.figure.priceSeries).toBeUndefined();
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
      selectCardType({ ...base, priceSeries: windowNet(15), cumulativeBuySeries: rising() })
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
    const d = selectCardType({ ...base, volumePct: 30, sparkline: drifting(), priorBuys12mo: 3 });
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

  it("B형 하한은 08-22 관측 공백(2.5 ~ 22.7) 안에 있다 — 그때 분류를 뒤집지 않는다", () => {
    expect(RATIO_PCT).toBeGreaterThan(2.5);
    expect(RATIO_PCT).toBeLessThan(22.7);
  });

  /**
   * 2026-08-24 실측(풍산 volumePct 14.4)이 드러낸 모순의 회귀 테스트.
   *
   * 카드 하한과 상세의 근거 하한이 갈리면, 카드가 화면에서 가장 크게 띄운 숫자를 상세가
   * "소음" 이라며 안 보여준다. 사용자가 확인하러 들어간 자리에서 확인 대상이 사라진다.
   * 상세 쪽 상수는 `apps/fomo-web/lib/depthSections.ts` 의 `VOLUME_SHARE_FLOOR` 다.
   */
  it("B형 하한은 상세 근거 하한(VOLUME_SHARE_FLOOR = 20)과 같다", () => {
    expect(RATIO_PCT).toBe(20);
  });

  it("모순 구간(10~20)은 이제 B형이 아니다 — 풍산 14.4 재현", () => {
    const d = selectCardType({ ...base, volumePct: 14.4, sparkline: drifting() });
    expect(d).toBeNull(); // 다른 형 재료가 없으면 픽에서 빠진다
  });

  it("소폭 상승 상한은 덱 |변동| 중앙값 2.72% 근방이다", () => {
    expect(QUIET_UP_PCT).toBeGreaterThanOrEqual(2.72);
    expect(QUIET_UP_PCT).toBeLessThan(4);
  });
});

/**
 * WO-HOOK-01 §10 완료 기준 12 — 세 형 모두 320px 폭에서 후킹이 3줄이 되지 않는다.
 *
 * 320px 카드의 내용폭은 288px(패딩 16 양쪽). 19px 한글은 자간 -0.02em 이라 글자당 약 18.6px,
 * 즉 **한 줄에 약 15자**가 들어간다. 문안은 `\n` 으로 두 줄을 직접 나누므로, 각 줄이 15자를
 * 넘지 않으면 3줄이 될 수 없다. 화면의 `line-clamp-2` 는 이 계약이 깨졌을 때의 안전망이다.
 */
describe("완료 기준 12 — 후킹이 320px 에서 2줄을 넘지 않는다", () => {
  const MAX_CHARS_PER_LINE = 15;
  const rising2 = Array.from({ length: 20 }, (_, i) => (i < 10 ? 0 : 4_000_000));
  const price2 = Array.from({ length: 20 }, () => 100);
  const streak = (n: number) => Array.from({ length: 40 }, (_, i) => i >= 40 - n);

  const hooks = (): string[] => {
    const out: string[] = [];
    for (const kind of ["insider_cluster", "institution_streak", "foreign_streak", "multi_cluster"] as const) {
      for (const change of [-12, -5.9, -2.1, -0.4, 0, 1.9, 2.7]) {
        const d = selectCardType({ kind, days: 8, scale: "$8.3M", insiderCount: 4, priceChangeSincePct: change, priceSeries: price2, cumulativeBuySeries: rising2 });
        if (d) out.push(d.hook);
      }
      for (const pct of [10, 24, 25, 44, 45, 51, 98]) {
        const d = selectCardType({ kind, days: 8, scale: "$8.3M", volumePct: pct, sparkline: price2.map((v, i) => v + i) });
        if (d) out.push(d.hook);
      }
      for (const n of [1, 2, 4, 40]) {
        const d = selectCardType({ kind, days: 8, scale: "47만주", buyDays: streak(n) });
        if (d) out.push(d.hook);
      }
    }
    return out;
  };

  it("모든 형·모든 변형의 각 줄이 15자 이하다", () => {
    const all = hooks();
    expect(all.length).toBeGreaterThan(20);
    for (const hook of all) {
      const lines = hook.split("\n");
      expect(lines.length, hook).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length, `${hook} → "${line}"`).toBeLessThanOrEqual(MAX_CHARS_PER_LINE);
    }
  });

  it("고유어 수 표현이 어떤 형에도 없다 (§9)", () => {
    for (const hook of hooks()) {
      expect(/이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘/.test(hook), hook).toBe(false);
    }
  });
});

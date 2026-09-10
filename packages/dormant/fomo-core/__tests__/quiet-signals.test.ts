/** WO-RESET-03 PART A-1·A-6 — 가격·거래량에만 있는 흔적. */
import { describe, expect, it } from "vitest";
import {
  detectMarketDivergence,
  detectVolumeAwakening,
  MARKET_DIVERGENCE_MIN_DAYS,
  VOLUME_AWAKENING_BASE_DAYS,
  VOLUME_AWAKENING_MULTIPLE,
  type DailyPoint,
} from "../src/keyword-cards/quiet-signals";

/** 지수는 매일 1% 내리고, 종목은 매일 `edge`%p 더 낫다. */
const falling = (n: number, dailyPct = -1) =>
  Array.from({ length: n }, (_, i) => 100 * (1 + dailyPct / 100) ** i);
const stronger = (index: readonly number[], edgePct: number) =>
  index.map((_, i) => 100 * (1 + (edgePct - 1) / 100) ** i);

describe("detectMarketDivergence — A-1", () => {
  it("지수는 내리고 종목이 매일 더 강하면 잡는다", () => {
    const index = falling(8);
    const stock = stronger(index, 1.5); // 매일 +0.5%p 우위
    const d = detectMarketDivergence(stock, index);
    expect(d).not.toBeNull();
    expect(d!.days).toBeGreaterThanOrEqual(MARKET_DIVERGENCE_MIN_DAYS);
    expect(d!.indexChangePct).toBeLessThan(0);
    expect(d!.indexSeries).toHaveLength(d!.days + 1);
    expect(d!.stockSeries).toHaveLength(d!.days + 1);
  });

  it("연속이 짧으면 잡지 않는다 — 하루 이틀은 잡음이다", () => {
    const index = falling(8);
    const stock = [...stronger(index, 1.5)];
    // 중간에 한 번 지수보다 약한 날을 넣어 연속을 끊는다.
    stock[stock.length - 3] = stock[stock.length - 3]! * 0.9;
    expect(detectMarketDivergence(stock, index)).toBeNull();
  });

  it("지수가 창 전체로 올랐으면 '시장은 빠지는데' 가 거짓이라 쓰지 않는다", () => {
    const index = falling(8, +1); // 매일 오른다
    const stock = index.map((v, i) => v * (1 + i * 0.01));
    expect(detectMarketDivergence(stock, index)).toBeNull();
  });

  it("길이가 다르면 판정하지 않는다 — 어긋난 날짜 비교는 거짓이다", () => {
    expect(detectMarketDivergence(falling(8), falling(7))).toBeNull();
  });

  it("표본이 모자라면 null", () => {
    expect(detectMarketDivergence(falling(3), falling(3))).toBeNull();
  });
});

const flatSeries = (n: number, volume: number, close = 1000): DailyPoint[] =>
  Array.from({ length: n }, () => ({ close, volume }));

describe("detectVolumeAwakening — A-6", () => {
  it("오래 조용하다 거래가 3배로 붙고 가격은 그대로면 잡는다", () => {
    const points = [...flatSeries(VOLUME_AWAKENING_BASE_DAYS, 1_000), { close: 1010, volume: 4_000 }];
    const a = detectVolumeAwakening(points);
    expect(a).not.toBeNull();
    expect(a!.multiple).toBeGreaterThanOrEqual(VOLUME_AWAKENING_MULTIPLE);
    expect(Math.abs(a!.movePct)).toBeLessThanOrEqual(3);
    expect(a!.volumeSeries.at(-1)).toBe(4_000);
    expect(a!.spikeFrom).toBe(a!.volumeSeries.length - 1);
  });

  it("가격이 이미 뛰었으면 조용한 신호가 아니다 — 이미 일어난 뉴스다", () => {
    const points = [...flatSeries(VOLUME_AWAKENING_BASE_DAYS, 1_000), { close: 1200, volume: 4_000 }];
    expect(detectVolumeAwakening(points)).toBeNull();
  });

  it("거래가 평소만큼이면 각성이 아니다", () => {
    const points = [...flatSeries(VOLUME_AWAKENING_BASE_DAYS, 1_000), { close: 1000, volume: 1_100 }];
    expect(detectVolumeAwakening(points)).toBeNull();
  });

  it("배경이 짧으면 '석 달 만에 처음' 을 말할 수 없다", () => {
    const points = [...flatSeries(10, 1_000), { close: 1000, volume: 9_000 }];
    expect(detectVolumeAwakening(points)).toBeNull();
  });

  it("이틀 이어진 급증은 구간으로 칠한다", () => {
    const points = [
      ...flatSeries(VOLUME_AWAKENING_BASE_DAYS - 1, 1_000),
      { close: 1000, volume: 4_000 },
      { close: 1005, volume: 5_000 },
    ];
    const a = detectVolumeAwakening(points);
    expect(a).not.toBeNull();
    expect(a!.volumeSeries.length - a!.spikeFrom).toBe(2);
  });
});

import { marketDivergenceCard, volumeAwakeningCard } from "../src/keyword-cards/card-type";

/** WO-RESET-03 D-1·D-4 — 라벨 없이 결론 문장만, 그리고 모든 형에 그림이 있다. */
describe("새 카드 형", () => {
  const divergence = detectMarketDivergence(stronger(falling(8), 1.5), falling(8))!;
  const awakening = detectVolumeAwakening([
    ...flatSeries(VOLUME_AWAKENING_BASE_DAYS, 1_000),
    { close: 1010, volume: 4_000 },
  ])!;

  it("D형 — 지수는 회색선, 종목은 라임선(A형과 같은 문법)", () => {
    const card = marketDivergenceCard({ divergence, indexLabel: "코스피" })!;
    expect(card.type).toBe("D");
    // 결론은 **종목 자신의 등락률**을 담는다 — 같은 형이 여러 장 나와도 서로 다른 카드가 되게.
    // (고정 문장이던 시절 하루 일곱 장이 글자 하나 안 틀리고 같았다 — STATUS §17-H)
    expect(card.hook).toContain("코스피");
    expect(card.hook).toContain(divergence.stockChangePct.toFixed(1));
    expect(card.hook).not.toContain("매수");
    expect(card.figure.kind).toBe("divergence");
    if (card.figure.kind !== "divergence") throw new Error("divergence 아님");
    expect(card.figure.buyLegend).toBe("이 종목");
    expect(card.figure.priceSeries).toEqual(divergence.indexSeries);
    expect(card.figure.buySeries).toEqual(divergence.stockSeries);
  });

  it("E형 — 거래량 막대와 급증 구간", () => {
    const card = volumeAwakeningCard({ awakening })!;
    expect(card.type).toBe("E");
    expect(card.hook).toContain("거래가 4배로 늘었어요");
    expect(card.figure.kind).toBe("volume");
    if (card.figure.kind !== "volume") throw new Error("volume 아님");
    expect(card.figure.spikeFrom).toBe(card.figure.volumes.length - 1);
  });

  it("[D-1] 결론 문장에 종류 라벨이 없다 — 카드가 분류표가 되면 안 된다", () => {
    const cards = [marketDivergenceCard({ divergence, indexLabel: "코스피" })!, volumeAwakeningCard({ awakening })!];
    for (const card of cards) {
      expect(card.hook).not.toMatch(/^\[/);
      for (const label of ["자사주", "공매도", "시장 역행", "거래량 각성", "실적 갭"]) {
        expect(card.hook, label).not.toContain(label);
      }
    }
  });

  it("[D-4] 모든 형에 그림이 있다 — 그림을 못 만들면 카드를 만들지 않는다", () => {
    expect(marketDivergenceCard({ divergence: { ...divergence, stockSeries: [1] }, indexLabel: "코스피" })).toBeNull();
    expect(volumeAwakeningCard({ awakening: { ...awakening, volumeSeries: [1, 2] } })).toBeNull();
  });
});

/** WO-RESET-04 §0 — 실측으로 정한 두 임계. */
describe("WO-RESET-04 임계 조정", () => {
  it("[완료 1] D형은 3일 임계다 — 4일 이상은 실측에서 0종목이었다", () => {
    expect(MARKET_DIVERGENCE_MIN_DAYS).toBe(3);
    const index = falling(6);
    const stock = stronger(index, 1.5);
    const d = detectMarketDivergence(stock, index);
    expect(d).not.toBeNull();
    expect(d!.days).toBeGreaterThanOrEqual(3);
  });

  it("[완료 2] E형은 **급증 시작일부터 오늘까지** 순변동을 본다 — 당일이 아니다", () => {
    // 급증일에 20% 튀었다가 되돌아온 경우: 당일 기준이면 탈락, 순변동 기준이면 통과.
    const points = [
      ...flatSeries(VOLUME_AWAKENING_BASE_DAYS - 1, 1_000, 1000),
      { close: 1000, volume: 1_000 }, // 급증 직전
      { close: 1200, volume: 4_000 }, // 급증일 — 당일 +20%
      { close: 1020, volume: 3_500 }, // 되돌아옴 — 시작 직전 대비 +2%
    ];
    const a = detectVolumeAwakening(points);
    expect(a, "되돌아온 경우는 '아직 안 움직인' 것이 맞다").not.toBeNull();
    expect(Math.abs(a!.movePct)).toBeLessThanOrEqual(5);
  });

  it("급증 뒤 계속 올라간 것은 여전히 뺀다 — 이미 일어난 뉴스다", () => {
    const points = [
      ...flatSeries(VOLUME_AWAKENING_BASE_DAYS - 1, 1_000, 1000),
      { close: 1000, volume: 1_000 },
      { close: 1200, volume: 4_000 },
      { close: 1300, volume: 3_500 }, // 시작 직전 대비 +30%
    ];
    expect(detectVolumeAwakening(points)).toBeNull();
  });
});

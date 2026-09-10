import { describe, expect, it } from "vitest";
import { denominatorWarning, freshnessCutoff, universeRatePct } from "../../lib/candle-coverage";

/**
 * `candleCoverage` 자체는 SQL 집계라 여기서 돌리지 않는다(DB 필요).
 * 대신 **분모를 잘못 잡는 실수**를 봉쇄한다 — CTX-00 B-2 가 두 판 연속 미확인으로 남은 이유가
 * 측정 수단 부재였고, 수단이 생기자마자 분모를 헷갈리면 같은 자리에서 또 틀린다.
 */
describe("universeRatePct — 유니버스 확보율", () => {
  it("유니버스를 주면 그 분모로 센다", () => {
    expect(universeRatePct(447, 450)).toBe(99.3);
    expect(universeRatePct(225, 450)).toBe(50);
  });

  it("유니버스를 모르면 확보율을 만들지 않는다 — 지어낸 분모로 초록을 만들지 않는다", () => {
    expect(universeRatePct(447, null)).toBeNull();
    expect(universeRatePct(447, 0)).toBeNull();
    expect(universeRatePct(447, -1)).toBeNull();
  });

  it("캐시 보유분을 분모로 쓰면 100% 가 나온다 — 이것이 피하려는 함정이다", () => {
    // 저장에 성공한 종목만 행이 있으므로 캐시 기준 비율은 실제보다 항상 좋다.
    const cachedRows = 447;
    const gte250 = 447;
    expect(universeRatePct(gte250, cachedRows)).toBe(100);
    // 진짜 분모(프리웜 유니버스)로 재면 다른 숫자다.
    expect(universeRatePct(gte250, 450)).toBe(99.3);
  });

  it("소수 첫째 자리까지 반올림한다", () => {
    expect(universeRatePct(1, 3)).toBe(33.3);
    expect(universeRatePct(2, 3)).toBe(66.7);
  });
});

/**
 * 2026-08-17 첫 실측이 **174.7%** 를 냈다 — 캐시가 정리되지 않아 유니버스 밖 종목까지 셌다.
 * 그때 필요한 것은 100 으로 깎는 것이 아니라 **인용하지 말라는 신호**다.
 */
describe("denominatorWarning — 100% 초과는 측정 실패다", () => {
  it("100% 를 넘으면 인용 금지를 명시한다", () => {
    const w = denominatorWarning(174.7);
    expect(w).toContain("174.7%");
    expect(w).toContain("인용하지 말 것");
  });

  it("100% 이하는 경고하지 않는다", () => {
    expect(denominatorWarning(100)).toBeNull();
    expect(denominatorWarning(99.3)).toBeNull();
    expect(denominatorWarning(0)).toBeNull();
  });

  it("측정 못 한 경우(null)는 경고 대상이 아니다 — 미확인과 실패는 다르다", () => {
    expect(denominatorWarning(null)).toBeNull();
  });

  it("숫자를 조용히 깎지 않는다 — 원래 값이 메시지에 남는다", () => {
    expect(denominatorWarning(101)).toContain("101%");
  });
});

describe("freshnessCutoff — KST 기준", () => {
  const now = new Date("2026-08-17T23:30:00.000Z"); // KST 2026-08-18 08:30

  it("staleDays 만큼 뒤로 간 KST 날짜를 준다", () => {
    expect(freshnessCutoff(7, now)).toBe("2026-08-11");
    expect(freshnessCutoff(10, now)).toBe("2026-08-08");
  });

  it("0 이면 오늘(KST)이다 — UTC 날짜가 아니다", () => {
    expect(freshnessCutoff(0, now)).toBe("2026-08-18");
  });
});

import { describe, expect, it } from "vitest";
import { buildCardHookCopy, easyMarketCopy, scoreSignalType, termKeysForAnalysis } from "../lib/easyMarketCopy";

describe("easy market copy", () => {
  it("카드는 쉬운말을 우선하고 숫자를 보존한다", () => {
    expect(easyMarketCopy("매집 구간 7주차에 스프링 후보, RSI 75 과열", "card")).toBe(
      "조용히 사 모으는 구간 7주차에 바닥 다지는 반등 시도, 단기 과열 75"
    );
  });

  it("뎁스는 첫 전문용어를 쉬운말과 함께 병기한다", () => {
    expect(easyMarketCopy("정배열 뒤 눌림목과 임펄스", "detail")).toBe(
      "이평선이 위로 정렬(정배열) 뒤 상승 후 잠깐 쉬는 구간(눌림목)과 급등 파동(임펄스)"
    );
    expect(easyMarketCopy("하방 임펄스 뒤 업스러스트 후보", "detail")).toBe(
      "급락 파동(하방 임펄스) 뒤 고점 이탈 실패(업스러스트)"
    );
  });

  it("실제 수급·구간 수치로 카드 훅과 칩을 조립한다", () => {
    const result = buildCardHookCopy({
      signals: { foreignNetStreak: 5 },
      signalTypes: ["foreign_streak", "score_60_79"],
      wyckoff: {
        sourceLength: 100,
        zones: [],
        events: [],
        currentZone: {
          kind: "accumulation",
          startIndex: 70,
          endIndex: 99,
          weeks: 6,
          low: 90,
          high: 110,
          rangePct: 20,
          priceChangePct: 3,
          label: "매집 추정 6주차",
          evidence: [],
        },
      },
    });
    expect(result.chips).toEqual(["외국인 5일", "사 모으는 구간 6주차"]);
    expect(result.hook).toBe("조용히 사 모으는 6주차에 외국인 순매수가 5일째 이어져요.");
  });

  it("점수대와 실제 분석 용어를 결정론으로 분류한다", () => {
    expect([scoreSignalType(80), scoreSignalType(70), scoreSignalType(59)]).toEqual([
      "score_80_plus",
      "score_60_79",
      "score_below_60",
    ]);
    expect(termKeysForAnalysis(undefined, 75, true)).toEqual(["alignment", "rsiHot"]);
  });

  it("이벤트 날짜와 실수치만 짧게 노출한다", () => {
    const result = buildCardHookCopy({
      signals: {},
      wyckoff: {
        sourceLength: 100,
        zones: [],
        events: [{ kind: "impulse", index: 99, date: "20260716", price: 120, direction: "up", movePct: 12.34, label: "", explanation: "" }],
      },
    });
    expect(result.hook).toBe("7/16 급등 파동(+12.3%)이 발생했어요.");
  });
});

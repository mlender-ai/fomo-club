import { describe, expect, it } from "vitest";
import { computeStreak } from "../src/compute/streak";
import { buildFlowSnapshot } from "../src/compute/aggregate";
import type { DailyParticipantFlow, ParticipantFlow } from "../src/types";

/** 2026-08-10(월)~14(금) 거래일. 08-15 는 광복절 휴장. */
const WEEK = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];

const day = (date: string, net_value: number | null, net_shares: number | null = null): DailyParticipantFlow => ({
  date,
  net_value,
  net_shares,
});

const flow = (over: Partial<ParticipantFlow> & Pick<ParticipantFlow, "participant">): ParticipantFlow => ({
  net_shares: null,
  net_value: null,
  streak_days: null,
  streak_start: null,
  cumulative_shares_streak: null,
  cumulative_value_streak: null,
  pct_of_volume: null,
  streak_broken_by: null,
  source: "test",
  as_of: "2026-08-14",
  ...over,
});

describe("computeStreak — 결손 처리(CTX-01 §4)", () => {
  it("연속 순매수는 양수로 세고 누적을 함께 낸다", () => {
    const rows = WEEK.map((d) => day(d, 100, 10));
    expect(computeStreak(rows, WEEK)).toMatchObject({
      streak_days: 5,
      streak_start: "2026-08-10",
      cumulative_value_streak: 500,
      cumulative_shares_streak: 50,
      streak_broken_by: null,
    });
  });

  it("연속 순매도는 음수로 센다", () => {
    expect(computeStreak(WEEK.map((d) => day(d, -100)), WEEK).streak_days).toBe(-5);
  });

  it("**결손일은 연속을 끊고 사유를 남긴다** — 건너뛰고 이으면 거짓이 된다", () => {
    // 12일 데이터 없음. 13·14 만 이어진다. 10·11 은 이어붙이지 않는다.
    const rows = [day("2026-08-10", 100), day("2026-08-11", 100), day("2026-08-13", 100), day("2026-08-14", 100)];
    expect(computeStreak(rows, WEEK)).toMatchObject({
      streak_days: 2,
      streak_start: "2026-08-13",
      streak_broken_by: "missing_data",
    });
  });

  it("net_value 가 null 인 날도 결손이다 — 0 과 구분한다", () => {
    const rows = [day("2026-08-13", null), day("2026-08-14", 100)];
    expect(computeStreak(rows, WEEK)).toMatchObject({ streak_days: 1, streak_broken_by: "missing_data" });
  });

  it("net_value == 0 은 연속을 끊지 않고 건너뛴다 (거래 없음)", () => {
    const rows = [day("2026-08-10", 100), day("2026-08-11", 100), day("2026-08-12", 0), day("2026-08-13", 100), day("2026-08-14", 100)];
    // 0인 날은 세지도 않고 끊지도 않는다 → 4일.
    expect(computeStreak(rows, WEEK)).toMatchObject({ streak_days: 4, streak_broken_by: null });
  });

  it("**휴장일은 연속 계산에 들어가지 않는다** — 거래일 목록에 없으므로 결손이 아니다", () => {
    const rows = WEEK.map((d) => day(d, 100));
    // 08-15(휴장)를 캘린더에 넣지 않았으므로 결손으로 오인하지 않는다.
    expect(computeStreak(rows, WEEK).streak_broken_by).toBeNull();
    // 반대로 휴장일을 거래일이라고 잘못 주면 결손으로 끊긴다 — 캘린더가 정본임을 보인다.
    expect(computeStreak(rows, [...WEEK, "2026-08-15"]).streak_broken_by).toBe("missing_data");
  });

  it("부호가 반전되면 정상 종료다 — 결손 사유를 붙이지 않는다", () => {
    const rows = [day("2026-08-12", -100), day("2026-08-13", 100), day("2026-08-14", 100)];
    expect(computeStreak(rows, ["2026-08-12", "2026-08-13", "2026-08-14"])).toMatchObject({
      streak_days: 2,
      streak_broken_by: null,
    });
  });

  it("가장 최근 거래일이 결손이면 연속은 0이고 사유가 남는다", () => {
    expect(computeStreak([day("2026-08-13", 100)], WEEK)).toMatchObject({
      streak_days: 0,
      streak_broken_by: "missing_data",
    });
  });
});

describe("buildFlowSnapshot — 매도 주체 식별(CTX-01 목표 3)", () => {
  it("기관이 사고 개미가 파는 것을 각각 식별한다", () => {
    const snap = buildFlowSnapshot({
      symbol: "065450",
      market: "KR",
      as_of: "2026-08-14",
      participants: [
        flow({ participant: "institution", net_value: 500, cumulative_value_streak: 5_000 }),
        flow({ participant: "retail", net_value: -400, cumulative_value_streak: -4_000 }),
        flow({ participant: "foreign", net_value: 100, cumulative_value_streak: 900 }),
      ],
    });
    expect(snap.net_buyers).toEqual(["institution", "foreign"]);
    expect(snap.net_sellers).toEqual(["retail"]);
    expect(snap.dominant_buyer).toBe("institution");
    expect(snap.dominant_seller).toBe("retail");
    expect(snap.coverage).toBe("full");
    // insider 는 일별 순매매 축이 아니라 커버리지에서 빠지지만 결손 목록에는 남는다.
    expect(snap.missing_participants).toEqual(["insider"]);
  });

  it("확보 안 된 주체는 어느 목록에도 넣지 않고 결손으로만 남긴다", () => {
    const snap = buildFlowSnapshot({
      symbol: "AAPL",
      market: "US",
      as_of: "2026-08-14",
      participants: [flow({ participant: "insider", net_value: 1_000, cumulative_value_streak: 1_000 })],
    });
    expect(snap.coverage).toBe("none");
    expect(snap.missing_participants).toEqual(["retail", "institution", "foreign"]);
    expect(snap.net_sellers).toEqual([]);
  });

  it("일부만 확보되면 partial 이다", () => {
    const snap = buildFlowSnapshot({
      symbol: "065450",
      market: "KR",
      as_of: "2026-08-14",
      participants: [
        flow({ participant: "institution", net_value: 500 }),
        flow({ participant: "foreign", net_value: -100 }),
      ],
    });
    expect(snap.coverage).toBe("partial");
    expect(snap.missing_participants).toEqual(["retail", "insider"]);
  });
});

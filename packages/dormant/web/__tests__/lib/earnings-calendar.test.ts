import { describe, expect, it } from "vitest";
import { composeWeeklyCalendar, selectDayEarnings, type EarningsRow } from "../../lib/earnings-calendar";

// 2026-07-15 주간 판단 캘린더 — 해자: 발견 유니버스 큐레이션 + 클라 localStorage 조인(개인화는 프론트).

describe("selectDayEarnings (어닝 필터·랭크)", () => {
  it("발견 유니버스 종목은 시총 무관 포함(한글명), 유니버스 밖은 메가캡($80B+)만", () => {
    const rows: EarningsRow[] = [
      { symbol: "TSM", marketCapUsd: 2_000_000_000_000, session: "장전" }, // 유니버스 안(TSMC)
      { symbol: "OKTA", marketCapUsd: 15_000_000_000, session: "장후" }, // 유니버스 안(옥타)
      { symbol: "MEGAX", marketCapUsd: 300_000_000_000 }, // 유니버스 밖 메가캡 — 포함(심볼 그대로)
      { symbol: "ZZZZ", marketCapUsd: 5_000_000_000 }, // 유니버스 밖 소형 — 제외
    ];
    const picked = selectDayEarnings(rows);
    expect(picked.map((p) => p.symbol)).toEqual(["TSM", "MEGAX", "OKTA"]);
    // 유니버스 종목은 canonical 매핑, 밖은 심볼 그대로(이름을 지어내지 않는다)
    expect(picked[0]!.canonical).toBe("TSMC");
    expect(picked.find((p) => p.symbol === "OKTA")!.canonical).not.toBe("OKTA");
    expect(picked.find((p) => p.symbol === "MEGAX")!.canonical).toBe("MEGAX");
    expect(picked[0]!.session).toBe("장전");
  });

  it("하루 상한 4종 — 시총 큰 순", () => {
    const rows: EarningsRow[] = Array.from({ length: 8 }, (_, i) => ({
      symbol: `BIG${i}`,
      marketCapUsd: (10 - i) * 100_000_000_000,
    }));
    const picked = selectDayEarnings(rows);
    expect(picked).toHaveLength(4);
    expect(picked[0]!.symbol).toBe("BIG0");
  });
});

describe("composeWeeklyCalendar (주간 합성)", () => {
  it("어닝+매크로를 날짜 그룹으로 — 이벤트 없는 날은 생략, 7일 창 밖은 제외", () => {
    const earnings = new Map([
      ["2026-07-16", [{ canonical: "넷플릭스", symbol: "NFLX", session: "장후" as const }]],
    ]);
    const macro = [
      { date: "2026-07-15", label: "미국 PPI 발표", detail: "생산자물가지수" },
      { date: "2026-07-29", label: "FOMC 금리 결정", detail: "창 밖 — 제외돼야 함" },
    ];
    const cal = composeWeeklyCalendar("2026-07-15", earnings, macro);
    expect(cal.days.map((d) => d.date)).toEqual(["2026-07-15", "2026-07-16"]);
    expect(cal.days[0]!.events[0]).toMatchObject({ kind: "macro", title: "미국 PPI 발표" });
    expect(cal.days[1]!.events[0]).toMatchObject({ kind: "earnings" });
    expect(cal.days[1]!.events[0]!.stocks?.[0]?.canonical).toBe("넷플릭스");
    // 금지 문형 없음(사실 일정만)
    const text = JSON.stringify(cal);
    expect(text).not.toMatch(/사세요|파세요|매수하세요|매도하세요|추천|서둘/);
  });

  it("이벤트가 하나도 없으면 days=[] — feed-hub가 카드를 만들지 않는다(정직)", () => {
    const cal = composeWeeklyCalendar("2026-07-15", new Map(), []);
    expect(cal.days).toEqual([]);
  });
});

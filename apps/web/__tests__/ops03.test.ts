/**
 * OPS-03 — 가동 감시 · 유효일 · 평가 자산 · 헤더 점.
 */
import { describe, expect, it } from "vitest";

import { equityOf } from "../lib/lab/equity";
import { inSession, sessionOf } from "../lib/lab/market-hours";
import {
  alertText,
  dayCoverage,
  evaluate,
  expectedSlots,
  measured03,
  slotsNow,
  trackDots,
  transitions,
  validStreak,
  type AlertState,
  type HeartbeatPayload,
} from "../lib/lab/watch";

const iso = (s: string) => new Date(s).toISOString();

function hb(
  now: string,
  over: Partial<{ jobs: Record<string, string | null>; reachable: boolean; stock: HeartbeatPayload["stock"] }> = {}
): { at: Date; payload: HeartbeatPayload } {
  const at = new Date(now);
  const fresh = iso(now);
  return {
    at,
    payload: {
      at: fresh,
      fce: {
        reachable: over.reachable ?? true,
        error: over.reachable === false ? "fetch failed" : null,
        jobs: over.jobs ?? { heartbeat: fresh, paper_engine: fresh, whale_follow_engine: fresh, refresh_market_data: fresh },
      },
      stock: over.stock ?? [
        { market: "KR" as const, status: "running", stopReason: null, observedAt: fresh },
        { market: "US" as const, status: "running", stopReason: null, observedAt: fresh },
      ],
    },
  };
}

describe("장 시간 (A-1 · C)", () => {
  it("KR 09:00 ~ 15:30 KST · 휴장일(추석 · 개천절 대체)은 장이 없다", () => {
    expect(inSession("KR", new Date("2026-09-29T00:30:00Z"))).toBe(true); // 09:30 KST
    expect(inSession("KR", new Date("2026-09-29T06:31:00Z"))).toBe(false); // 15:31 KST
    expect(sessionOf("KR", "2026-09-25")).toBeNull();
    expect(sessionOf("KR", "2026-10-05")).toBeNull();
    expect(sessionOf("KR", "2026-10-03")).toBeNull(); // 토요일
  });

  it("US 09:30 ~ 16:00 뉴욕 — 서머타임이 끝나면 한 시간 늦게 연다(22:30 → 23:30 KST)", () => {
    expect(sessionOf("US", "2026-09-28")?.open.toISOString()).toBe("2026-09-28T13:30:00.000Z");
    expect(sessionOf("US", "2026-11-02")?.open.toISOString()).toBe("2026-11-02T14:30:00.000Z");
    expect(sessionOf("US", "2026-11-27")?.close.toISOString()).toBe("2026-11-27T18:00:00.000Z"); // 조기 폐장
    expect(sessionOf("US", "2026-11-26")).toBeNull(); // 추수감사절
  });
});

describe("심장박동 판정 (A-1 · A-2)", () => {
  it("다 살아 있으면 전부 정상 — 주식은 장외면 판정하지 않는다", () => {
    const now = "2026-09-29T09:00:00Z"; // KR 장 끝 · US 장 전
    const r = evaluate(new Date(now), hb(now), new Date("2026-09-29T08:50:00Z"));
    expect(r.filter((x) => x.ok === false)).toEqual([]);
    expect(r.find((x) => x.key === "stock_kr")?.ok).toBeNull();
    expect(r.find((x) => x.key === "stock_us")?.ok).toBeNull();
  });

  it("맥 · 러너가 멈추면 **알림은 하나** — 아래는 모른다", () => {
    const now = new Date("2026-09-29T02:00:00Z");
    const r = evaluate(now, hb("2026-09-29T01:40:00Z"), new Date("2026-09-29T01:35:00Z"));
    expect(r.filter((x) => x.ok === false).map((x) => x.key)).toEqual(["host"]);
    expect(r.filter((x) => x.ok === null)).toHaveLength(7);
  });

  it("FCE 에 못 닿으면 FCE 하나 — 크립토 · 고래 · 주식은 모른다", () => {
    const now = "2026-09-29T02:00:00Z";
    const r = evaluate(new Date(now), hb(now, { reachable: false, jobs: {} }), new Date(now));
    expect(r.filter((x) => x.ok === false).map((x) => x.key)).toEqual(["fce"]);
  });

  it("크립토 42분 · 장중 KR 정지 → 알림 · 장외 US 는 조용", () => {
    const now = "2026-09-29T02:00:00Z"; // KR 11:00
    const r = evaluate(
      new Date(now),
      hb(now, {
        jobs: { heartbeat: iso(now), paper_engine: "2026-09-29T01:18:00Z", whale_follow_engine: iso(now), refresh_market_data: iso(now) },
        stock: [
          { market: "KR", status: "stopped", stopReason: "fill_price_outside_observed_range", observedAt: iso(now) },
          { market: "US", status: "running", stopReason: null, observedAt: "2026-09-28T20:00:00Z" },
        ],
      }),
      new Date(now)
    );
    expect(r.filter((x) => x.ok === false).map((x) => x.key).sort()).toEqual(["crypto", "stock_kr"]);
    const crypto = r.find((x) => x.key === "crypto");
    expect(crypto && alertText(crypto, new Date(now))).toBe(
      "🔴 크립토 트랙 42분째 멈춤\n마지막 틱 10:18 · FCE 는 살아 있음\n→ FCE 워커 확인: curl -s localhost:8875/api/system/worker"
    );
  });
});

describe("자기 주기 + 기준 (09-29 첫 가동)", () => {
  it("시세 수집이 10분마다 도는데 12분 전 틱이면 멈춤이 아니다 · 21분이면 멈춤", () => {
    const now = "2026-09-29T02:00:00Z";
    const at = (m: number) => new Date(Date.parse(now) - m * 60_000).toISOString();
    const beat = (m: number) => {
      const h = hb(now, { jobs: { heartbeat: iso(now), paper_engine: iso(now), whale_follow_engine: iso(now), refresh_market_data: at(m) } });
      h.payload.fce.every = { refresh_market_data: 600 };
      return h;
    };
    expect(evaluate(new Date(now), beat(12), new Date(now)).find((x) => x.key === "market")?.ok).toBe(true);
    expect(evaluate(new Date(now), beat(21), new Date(now)).find((x) => x.key === "market")?.ok).toBe(false);
  });
});

describe("알림 전이 (A-3 · A-4)", () => {
  it("멈춤은 한 번 · 복구는 멈춘 시간과 함께 · 판정 안 함(null)은 상태를 안 바꾼다", () => {
    const t0 = new Date("2026-09-29T02:00:00Z");
    const down = evaluate(t0, hb("2026-09-29T01:40:00Z"), t0);
    const first = transitions(down, new Map(), t0);
    expect(first.notices.map((n) => `${n.key}:${n.kind}`)).toEqual(["host:alert"]);

    const prev = new Map<string, AlertState>(first.next.map((s) => [s.key, s]));
    expect(transitions(down, prev, new Date("2026-09-29T02:05:00Z")).notices).toEqual([]); // 두 번 안 보낸다

    const t1 = new Date("2026-09-29T02:31:00Z");
    const up = transitions(evaluate(t1, hb("2026-09-29T02:31:00Z"), t1), prev, t1);
    expect(up.notices).toEqual([{ key: "host", kind: "recovery", text: "🟢 맥 · 러너 복구 · 멈춤 51분" }]);
  });
});

describe("유효일 (PART C)", () => {
  it("칸 — 크립토 · 고래는 늘 · 주식은 장중만 · 맥이 죽으면 전부 죽은 칸", () => {
    const now = new Date("2026-09-29T02:02:00Z"); // KR 장중 · US 장외
    expect(slotsNow(now, hb("2026-09-29T02:02:00Z")).map((s) => `${s.track}:${s.live}`)).toEqual([
      "crypto:true",
      "whale:true",
      "stock_kr:true",
    ]);
    expect(slotsNow(now, hb("2026-09-29T01:30:00Z")).every((s) => !s.live)).toBe(true);
  });

  it("있어야 하는 칸 — 크립토 288 · KR 78 · 휴장 0 · 감시 전은 세지 않는다", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    expect(expectedSlots("crypto", "2026-09-29", from)).toBe(288);
    expect(expectedSlots("stock_kr", "2026-09-29", from)).toBe(78);
    expect(expectedSlots("stock_kr", "2026-09-25", from)).toBe(0);
    expect(expectedSlots("crypto", "2026-09-29", new Date("2026-09-29T03:00:00Z"))).toBe(288 - 144);
    expect(dayCoverage("stock_kr", "2026-09-25", 0, from).pct).toBeNull();
    // 오늘은 지금까지만 — 01:55 KST(16:55 UTC 전날)면 00:00 ~ 01:55 의 24칸
    expect(expectedSlots("crypto", "2026-09-29", from, new Date("2026-09-28T16:57:00Z"))).toBe(24);
    expect(dayCoverage("crypto", "2026-09-29", 260, from).valid).toBe(true); // 90.3%
    expect(dayCoverage("crypto", "2026-09-29", 259, from).valid).toBe(false); // 89.9%
  });

  it("연구 03 — 크립토 · 고래가 둘 다 유효한 날이 이어진 만큼 · 30일이면 닫을 수 있다", () => {
    const days = ["2026-09-27", "2026-09-28"];
    const cov = [
      dayCoverage("crypto", "2026-09-27", 100, new Date("2026-09-01")),
      dayCoverage("whale", "2026-09-27", 288, new Date("2026-09-01")),
      dayCoverage("crypto", "2026-09-28", 288, new Date("2026-09-01")),
      dayCoverage("whale", "2026-09-28", 288, new Date("2026-09-01")),
    ];
    expect(validStreak(cov, days)).toBe(1);
    expect(measured03(cov, days).finding.note).toBe("30일 연속 유효면 닫는다 — 29일 남음");
  });
});

describe("헤더 점 (PART E)", () => {
  it("초록 운용중 · 회색 장외 · 주황 지연 · 빨강 정지", () => {
    const now = "2026-09-29T02:00:00Z";
    const dots = trackDots(
      new Date(now),
      hb(now, {
        jobs: { heartbeat: iso(now), paper_engine: iso(now), whale_follow_engine: "2026-09-29T01:45:00Z", refresh_market_data: iso(now) },
        stock: [
          { market: "KR", status: "stopped", stopReason: "x", observedAt: iso(now) },
          { market: "US", status: "running", stopReason: null, observedAt: iso(now) },
        ],
      })
    );
    expect(dots.map((d) => `${d.key}:${d.level}`)).toEqual(["crypto:live", "whale:live", "stock_kr:stopped", "stock_us:off"]);
    expect(trackDots(new Date(now), null).every((d) => d.level === "stopped")).toBe(true);
  });
});

describe("평가 자산 (PART D)", () => {
  it("실현은 FCE 그대로 · 평가는 FCE 미실현 + 그 뒤 가격 움직임만 · 환산은 트랙당 $10,000", () => {
    const e = equityOf(
      [
        { key: "crypto", startingCapital: 500, currentCapital: 400, unrealized: 99 },
        { key: "stock_us", startingCapital: 100_000, currentCapital: 98_000, unrealized: 500 },
      ],
      [{ trackKey: "crypto", symbol: "ADAUSDT", direction: "short", quantity: 100, markPrice: 1.0, unrealizedUsdt: 5 }],
      new Map([["ADAUSDT", 0.9]])
    );
    expect(e.realized).toBeCloseTo(8_000 + 9_800);
    // 크립토 미실현 5 + 100 × (0.9 − 1.0) × −1 = 15 → 415 / 500
    expect(e.tracks[0]?.unrealizedNative).toBeCloseTo(15);
    expect(e.marked).toBeCloseTo(8_300 + 9_850);
    expect(e.stalePrices).toBe(0);
  });
});

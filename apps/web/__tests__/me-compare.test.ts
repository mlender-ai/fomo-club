/**
 * TRADER-03 — 로그인 · 비교 · 매매법. 합성 데이터만(실계좌 데이터는 레포에 없다).
 */
import { describe, expect, it } from "vitest";

import {
  LOCK_MINUTES,
  MAX_FAILS,
  isLocked,
  passwordMatches,
  recordAttempt,
  sessionFromCookieHeader,
  signSession,
  verifySession,
} from "../lib/me/auth";
import { buildCompare, distribution, fmt, kstDay, subjectParticle } from "../lib/me/compare";
import { buildRulesView, condText } from "../lib/me/rules-view";
import type { AccountPayload, EngineInput, MeTrade, ReplicaPayload, RulesPayload } from "../lib/me/types";

const ENV = { ME_PASSWORD: "correct horse battery" } as unknown as NodeJS.ProcessEnv;
const NOW = Date.UTC(2026, 9, 1, 12);
const DAY = 86_400_000;
const H = 3_600_000;

describe("0-1 로그인", () => {
  it("쿠키는 30일 · 서명이 맞아야 · 비밀번호가 바뀌면 끊긴다", () => {
    const token = signSession(NOW, ENV) as string;
    expect(token).not.toContain("correct");
    expect(verifySession(token, NOW + 29 * DAY, ENV)).toBe(true);
    expect(verifySession(token, NOW + 31 * DAY, ENV)).toBe(false);
    const [v, exp, mac] = token.split(".");
    expect(verifySession(`${v}.${Number(exp) + DAY}.${mac}`, NOW, ENV)).toBe(false); // 만료를 늘리면 서명이 깨진다
    expect(verifySession(token, NOW, { ME_PASSWORD: "another password" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(verifySession(token, NOW, {} as NodeJS.ProcessEnv)).toBe(false); // 비밀번호가 없으면 아무도 못 들어간다
  });

  it("비밀번호 비교", () => {
    expect(passwordMatches("correct horse battery", ENV)).toBe(true);
    expect(passwordMatches("correct horse", ENV)).toBe(false);
    expect(passwordMatches("anything", { ME_PASSWORD: "short" } as unknown as NodeJS.ProcessEnv)).toBe(false); // 8자 미만은 설정 안 된 것
  });

  it(`${MAX_FAILS}번 틀리면 ${LOCK_MINUTES}분 잠금 · 잠긴 동안은 막힌다 · 풀린 뒤 다시 센다`, () => {
    let book = {};
    for (let i = 0; i < MAX_FAILS - 1; i++) book = recordAttempt(book, "1.1.1.1", false, NOW + i);
    expect(isLocked(book, "1.1.1.1", NOW + 10)).toBeNull();
    book = recordAttempt(book, "1.1.1.1", false, NOW + 10);
    expect(isLocked(book, "1.1.1.1", NOW + 11)).toBe(NOW + 10 + LOCK_MINUTES * 60_000);
    expect(isLocked(book, "2.2.2.2", NOW + 11)).toBeNull(); // 다른 IP 는 아니다
    const later = NOW + 10 + LOCK_MINUTES * 60_000 + 1;
    expect(isLocked(book, "1.1.1.1", later)).toBeNull();
    book = recordAttempt(book, "1.1.1.1", false, later);
    expect((book as Record<string, { fails: number }>)["1.1.1.1"]?.fails).toBe(1);
    book = recordAttempt(book, "1.1.1.1", true, later + 1);
    expect(book).toEqual({});
  });

  it("쿠키 헤더에서 세션만 꺼낸다", () => {
    expect(sessionFromCookieHeader("a=1; fomo_me=v1.2.x; fomo_me_ui=1")).toBe("v1.2.x");
    expect(sessionFromCookieHeader("fomo_me_ui=1")).toBeNull();
  });
});

function trade(i: number, net: number, over: Partial<MeTrade> = {}): MeTrade {
  const entry = NOW - 20 * DAY + i * DAY;
  return { id: `t${i}`, symbol: "SOLUSDT", side: "long", entryMs: entry, exitMs: entry + 5 * H, net, gross: net + 1, fees: 1, funding: 0, margin: 100, notional: 1000, leverage: 10, ...over };
}

function account(): AccountPayload {
  const trades = [trade(0, 50), trade(1, -10), trade(2, 80), trade(3, -8), trade(4, 120), trade(5, -12)];
  const daily: Record<string, number> = {};
  for (const t of trades) daily[kstDay(t.exitMs)] = (daily[kstDay(t.exitMs)] ?? 0) + t.net;
  // 지수: 기간 시작 전 1.0, 끝에 1.2 — 중간에 입금이 있었어도 지수는 손익만 따른다.
  const twr: Record<string, number> = { [kstDay(NOW - 40 * DAY)]: 1.0, [kstDay(NOW - 10 * DAY)]: 1.1, [kstDay(NOW - DAY)]: 1.2 };
  return { v: 1, asOf: NOW, trades, daily, twr, open: [] };
}

function engine(key: string, label: string, nets: number[]): EngineInput {
  return {
    key,
    label,
    startingCapital: 2000,
    leverage: 3,
    trades: nets.map((net, i) => {
      const entry = NOW - 20 * DAY + i * DAY + 10 * 60_000; // 광혁과 10분 차이 · 같은 종목
      return { symbol: "SOL/USDT", side: "long" as const, entryMs: entry, exitMs: entry + 2 * H, net, gross: net + 3, costs: 3, margin: 100, returnPct: net, leverage: 3 };
    }),
    capital: [
      { at: NOW - 40 * DAY, capital: 2000 },
      { at: NOW - 5 * DAY, capital: 1900 },
      { at: NOW - DAY, capital: 1950 },
    ],
  };
}

const BTC = [
  { at: NOW - 40 * DAY, close: 100 },
  { at: NOW - 15 * DAY, close: 90 },
  { at: NOW - DAY, close: 110 },
];

describe("PART A — 비교표", () => {
  const view = buildCompare({ account: account(), replica: null, engines: [engine("crypto", "크립토 엔진", [3, -5, 2, -6, 3, -5, 2])], btc: BTC, days: 30, now: NOW });

  it("첫 열 광혁 실계좌 · 열이 엔진 수만큼 · 복제는 준비 중 · BTC 끝", () => {
    expect(view.columns.map((c) => c.key)).toEqual(["account", "replica", "crypto", "btc"]);
    expect(view.columns[1]?.status).toBe("pending");
    const two = buildCompare({ account: account(), replica: null, engines: [engine("crypto", "크립토", [1]), engine("whale", "고래추종", [1])], btc: BTC, days: 30, now: NOW });
    expect(two.columns.length).toBe(5);
  });

  it("%는 시간가중 지수 — 거래 손익 합이나 입금과 무관", () => {
    const acc = view.columns[0]!;
    expect(acc.metrics.twr).toBeCloseTo(20, 6);
    expect(acc.metrics.net).toBe(220);
    expect(acc.metrics.payoff).toBeCloseTo(250 / 3 / 10, 6);
  });

  it("광혁보다 나쁜 칸은 빨강 · 좋은 칸은 초록 · BTC 와 방향 없는 줄은 칠하지 않는다", () => {
    const pf = view.rows.find((r) => r.key === "pf")!;
    expect(pf.cells[2]?.tone).toBe("dn");
    const cost = view.rows.find((r) => r.key === "costShare")!;
    expect(cost.cells[2]?.tone).toBe("dn");
    const twr = view.rows.find((r) => r.key === "twr")!;
    expect(twr.cells[3]?.tone).toBe("none");
    const per = view.rows.find((r) => r.key === "perDay")!;
    expect(per.cells.every((c) => c.tone === "none")).toBe(true);
  });

  it("결론이 맨 위 · 가장 큰 차이 한 줄이 자동으로", () => {
    expect(view.headline.text).toBe("광혁이 이기고 있다");
    expect(view.headline.netLine).toContain("엔진 최고");
    expect(view.gap?.line1).toMatch(/^가장 큰 차이: /);
    expect(view.gap?.line2.length).toBeGreaterThan(5);
  });

  it("엔진이 이기면 엔진 이름으로", () => {
    const losing: AccountPayload = { ...account(), twr: { [kstDay(NOW - 40 * DAY)]: 1, [kstDay(NOW - DAY)]: 0.9 } };
    const v = buildCompare({ account: losing, replica: null, engines: [engine("crypto", "크립토 엔진", [5])], btc: BTC, days: 30, now: NOW });
    expect(v.headline.text).toBe("크립토 엔진이 이기고 있다");
  });

  it("실계좌가 없으면 없다고 말한다", () => {
    const v = buildCompare({ account: null, replica: null, engines: [engine("crypto", "크립토", [1])], btc: BTC, days: 30, now: NOW });
    expect(v.hasAccount).toBe(false);
    expect(v.headline.text).toContain("아직 없다");
  });
});

describe("PART B · C · D", () => {
  const replica: ReplicaPayload = {
    v: 1,
    asOf: NOW,
    startMs: NOW - 25 * DAY,
    verdict: "일부만 따라간다",
    liveCandidate: false,
    capital: 1000,
    trades: [0, 2, 4].map((i) => ({ symbol: "SOLUSDT", side: "long" as const, entryMs: NOW - 20 * DAY + i * DAY + 5 * 60_000, exitMs: NOW - 20 * DAY + i * DAY + 3 * H, net: 20, notional: 1000, margin: 100 })),
    open: [],
  };
  const view = buildCompare({ account: account(), replica, engines: [engine("crypto", "크립토 엔진", [3, -5, 2, -6, 3, -5, 2])], btc: BTC, days: 30, now: NOW });

  it("곡선은 모두 같은 출발점 1,000", () => {
    const first = view.curve.points[0]!;
    for (const s of view.curve.series) {
      const firstValue = view.curve.points.find((p) => p[s.key] !== undefined && p[s.key] !== null)?.[s.key];
      expect(firstValue).toBe(1000);
    }
    expect(first).toBeDefined();
    expect(view.curve.series.map((s) => s.key)).toContain("btc");
  });

  it("일별 손익 나란히 — 같은 날 광혁 · 엔진", () => {
    const row = view.calendar.rows.find((r) => r.values.account !== null && r.values.crypto !== null)!;
    expect(row).toBeDefined();
    expect(Object.keys(row.values)).toEqual(expect.arrayContaining(["account", "crypto", "replica"]));
  });

  it("분포 — 오른쪽 꼬리 차이가 숫자로 보인다", () => {
    const d = view.dist.find((x) => x.key === "crypto")!;
    expect(d.tail?.account).toBeGreaterThan(d.tail?.engine ?? 100);
    expect(d.bins.reduce((s, b) => s + b.account, 0)).toBeCloseTo(100, 6);
    expect(d.lines.account.win).toBeGreaterThan(d.lines.engine.win ?? 0);
  });

  it("같은 순간 — 복제가 따라간 비율", () => {
    const rep = view.overlap.summary.find((s) => s.key === "replica")!;
    expect(rep.entered).toBe(3);
    expect(rep.total).toBe(6);
    const crypto = view.overlap.summary.find((s) => s.key === "crypto")!;
    expect(crypto.entered).toBe(6); // 같은 종목(SOL/USDT ↔ SOLUSDT) · 10분 차이
    expect(view.overlap.rows[0]?.cells.replica?.state).toMatch(/entered|none/);
  });

  it("분포 칸 — 넘친 값은 양 끝 칸으로", () => {
    const d = distribution([1, 2, 3, 500], [-1, 0], "x", "x");
    expect(d.bins[d.bins.length - 1]?.edge).toBe("hi");
    expect(d.bins.reduce((s, b) => s + b.account, 0)).toBeCloseTo(100, 6);
  });
});

describe("숫자 · 말", () => {
  it("단위와 부호", () => {
    expect(fmt(-41.2, "usdt")).toBe("−41.2");
    expect(fmt(964, "usdt")).toBe("+964");
    expect(fmt(88.6, "pct")).toBe("+88.6%");
    expect(fmt(null, "x")).toBe("—");
  });
  it("이/가", () => {
    expect(subjectParticle("크립토 엔진")).toBe("이");
    expect(subjectParticle("광혁")).toBe("이");
    expect(subjectParticle("고래추종")).toBe("이");
    expect(subjectParticle("광혁복제 페이퍼 트래커")).toBe("가");
  });
});

describe("PART E — 매매법", () => {
  const payload: RulesPayload = {
    v: 1,
    asOf: NOW,
    statedSealedAt: NOW - 10 * DAY,
    contamination: [],
    freezes: [{ at: NOW - 3 * DAY, hashes: { "광혁-말": "aaaaaaaa11", "광혁-데이터": "bbbbbbbb22" }, afterValidation: false }],
    definitions: {
      "광혁-데이터": {
        side: "long",
        entry: { all: [{ indicator: "pct_from_ma", period: 20, tf: "4h", min: 0 }, { indicator: "volume_ratio", period: 20, tf: "1h", min: 1.5 }] },
        exit: { stop_pct: -2, target_pct: null, scale_out: [{ at_pct: 3, size: 0.5 }, { trail: { pct: 1.5, activate_pct: 3 }, size: 0.5 }] },
        sizing: { type: "fixed_pct", fixed_pct: 10 },
        leverage: 10,
        max_positions: 2,
        pause: { after_consecutive_losses: 3, minutes: 120 },
      },
      "광혁-말": { side: "long", entry: { all: [{ indicator: "_todo" }] }, exit: { stop_pct: -3, target_pct: null }, pause: null },
    },
    compare: [
      { part: "A-4", item: "손절", said: "-3% 에서 자른다", data: "이긴 MAE 중앙 -1.8%", match: "부분", kwanghyuk: "" },
      { part: "A-6", item: "쉬는 조건", said: "3연패면 쉰다", data: "3연패 뒤 40분", match: "불일치", kwanghyuk: "" },
    ],
    validation: { verdict: "일부만 따라간다", table: {}, discretionary: { "광혁-데이터": { n: 13, of: 40, net: 120, share_of_net: 0.3, share_of_gross_profit: 0.38 } } },
  };

  it("항목마다 데이터 · 말 · 일치 · 재량 · 버전", () => {
    const v = buildRulesView(payload);
    expect(v.title).toBe("광혁 매매법 v1");
    const entry = v.lines.find((l) => l.key === "entry")!;
    expect(entry.data).toBe("롱: 4H 20선 대비 ≥ 0% · 1H 거래량 배수(20) ≥ 1.5");
    expect(entry.said).toContain("광혁 확인 대기");
    expect(v.lines.find((l) => l.key === "pause")?.match).toBe("불일치");
    expect(v.lines.find((l) => l.key === "exit")?.data).toContain("+3% 에서 50%");
    expect(v.discretionary).toEqual({ n: 13, of: 40, net: 120, shareOfGross: 0.38 });
    expect(v.versions[0]?.data).toBe("bbbbbbbb");
  });

  it("규칙 조건 → 사람 말", () => {
    expect(condText({ indicator: "consecutive", max: -3 })).toBe("연속 봉(+상승 · −하락) ≤ -3");
    expect(condText({ indicator: "rsi", period: 14, tf: "1h", max: 30 })).toBe("1H RSI(14) ≤ 30");
  });

  it("없으면 준비 중", () => {
    expect(buildRulesView(null).ready).toBe(false);
  });
});

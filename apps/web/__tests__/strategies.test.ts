/**
 * 전략 탭 (UI-05) — 완료 확인과 「하지 말 것」 을 테스트로 묶는다.
 *
 * - 기준 미달 전략에 순위를 매기지 않는다
 * - 레버리지를 숨기지 않는다
 * - 폐기 전략을 지우지 않는다
 * - 숫자만 두고 해석을 빼지 않는다
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StrategiesBody, chanceLabel } from "../components/tabs/StrategiesBody";
import { StrategyDetailBody } from "../components/tabs/StrategyDetailBody";
import { dailySharpe, distribution, verdictLine } from "../lib/lab/strategies";
import { fixtures } from "./fixtures/lab";

const data = fixtures();
const s = data.strategies;
const list = renderToStaticMarkup(createElement(StrategiesBody, { data: s }));
const detail = (id: string) => renderToStaticMarkup(createElement(StrategyDetailBody, { data: s, id }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("A-2 순위", () => {
  it("기준 미달 전략에는 순위가 없다", () => {
    for (const r of s.rows.filter((x) => x.verdict !== "beat")) expect(r.rank, r.key).toBeNull();
  });

  it("우연 확률이 50% 이상이면 넘은 전략에도 번호를 주지 않는다", () => {
    if (!s.chance.clearsRanks) for (const r of s.rows) expect(r.rank).toBeNull();
    expect(s.chance.clearsRanks).toBe(s.chance.familyP === null || s.chance.familyP < 0.5);
  });

  it("기준선 막대가 맨 위 회색이고, 진 전략은 빨강 + `기준 미달`", () => {
    const rows = [...list.matchAll(/<li class="ui-compare-row[^"]*">([\s\S]*?)<\/li>/g)].map((m) => m[1] ?? "");
    expect(rows[0]).toMatch(/is-baseline/);
    const under = rows.filter((r) => /is-lost/.test(r));
    expect(under.length).toBe(s.rows.filter((r) => r.verdict === "under").length);
    for (const r of under) {
      expect(r).toMatch(/기준 미달/);
      expect(r).not.toMatch(/ui-compare-rank/);
    }
  });

  it("정지·보류·제외는 막대 없이 사유만 — 줄은 남는다", () => {
    const empty = [...list.matchAll(/<li class="ui-compare-row is-empty">([\s\S]*?)<\/li>/g)];
    expect(empty.length).toBe(s.rows.filter((r) => r.verdict === "unmeasured").length);
    for (const m of empty) expect(m[1]).not.toMatch(/ui-compare-fill/);
  });
});

describe("UI-FIX C-2 — 정상이면 상태 글자가 없다", () => {
  it("돌고 있는데 거래가 없는 트랙도 `운용중` 을 띄우지 않는다", () => {
    const tracks = data.strategies.rows.map((r) =>
      r.key === "stock_kr" ? { ...r, status: "running", verdict: "unmeasured" as const, reason: "" } : r
    );
    const html = renderToStaticMarkup(createElement(StrategiesBody, { data: { ...s, rows: tracks } }));
    expect(text(html)).not.toMatch(/운용중/);
    expect(text(html)).toMatch(/잴 거래 없음/);
  });
});

describe("A-3 표 · 레버리지를 숨기지 않는다", () => {
  it("열 12개 — 레버리지 열이 있다", () => {
    const heads = [...list.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(heads).toEqual(
      expect.arrayContaining(["전략", "자산(환산)", "수익률", "MDD", "수익÷낙폭", "샤프", "승률", "PF", "거래", "평균 보유", "레버리지", "상태"])
    );
  });

  it("FCE 가 배수를 안 준 고래 추종도 체결에서 잰 배수가 나온다", () => {
    expect(s.rows.find((r) => r.key === "whale")?.leverage).toBe(3);
  });

  it("폰에서는 표가 가로로 밀린다 — 감싼 칸이 스크롤을 갖는다", () => {
    expect(list).toMatch(/class="ui-table-scroll"/);
  });
});

describe("A-4 우연 확률", () => {
  it("함께 잰 전략 수와 확률이 화면에 있다", () => {
    expect(text(list)).toMatch(new RegExp(`함께 잰 전략 ${s.chance.tested}개`));
    expect(text(list)).toContain(chanceLabel(s.chance.familyP));
  });

  it("반올림한 100% 를 쓰지 않는다", () => {
    expect(chanceLabel(0.9986)).toBe("99%+");
    expect(chanceLabel(0.42)).toBe("42%");
    expect(chanceLabel(null)).toBe("—");
  });
});

describe("A-5 폐기 전략을 지우지 않는다", () => {
  it("접힌 보관함에 셋 다 있다", () => {
    expect(list).toMatch(/<details class="st-archive">/);
    expect(list).not.toMatch(/<details class="st-archive" open/);
    expect(text(list)).toMatch(/폐기한 전략 3개/);
    for (const name of ["추세 스윙 v1", "평균회귀 v1", "고래 추종 v1"]) expect(text(list)).toContain(name);
  });

  it("거래가 0 이던 것은 `과거 데이터 없음`, 나머지는 `진입 우위 없음`", () => {
    expect(s.archive.find((a) => a.label === "고래 추종 v1")?.reason).toBe("과거 데이터 없음");
    expect(s.archive.find((a) => a.label === "추세 스윙 v1")?.reason).toBe("진입 우위 없음");
  });
});

describe("B 상세 — 숫자만 두고 해석을 빼지 않는다", () => {
  const html = detail("crypto");

  it("BTC 보유 비교 표 아래 해석 한 줄", () => {
    const row = s.rows.find((r) => r.key === "crypto");
    expect(row?.interpretation).toBeTruthy();
    expect(text(html)).toContain(row?.interpretation as string);
  });

  it("6칸 — 수익÷낙폭 · 승률 · PF · 최대 낙폭 · 거래 · 평균 보유", () => {
    const labels = [...html.matchAll(/<dt class="ui-stat-label">([^<]*)<\/dt>/g)].map((m) => m[1]);
    expect(labels.slice(0, 6)).toEqual(["수익 ÷ 낙폭", "승률", "PF", "최대 낙폭", "거래", "평균 보유"]);
  });

  it("분포 — 중앙값 · 최대 손실 · 최대 이익", () => {
    expect(text(html)).toMatch(/중앙값.*최대 손실.*최대 이익.*이긴 거래 평균.*진 거래 평균/);
    expect(text(html)).toMatch(/이긴 거래가 진 거래보다 (작|크)다/);
  });

  it("최근 10건 + 전체 보기", () => {
    const row = s.rows.find((r) => r.key === "crypto");
    expect(row?.recent.length).toBe(10);
    expect(text(html)).toContain(`전체 ${row?.ledger.length}건 보기`);
  });

  it("관련 연구가 트랙에 붙는다", () => {
    expect(s.rows.find((r) => r.key === "crypto")?.research.map((x) => x.no)).toEqual(["02", "03", "05"]);
  });

  it("레버리지 알약이 Hero 옆에 있다", () => {
    expect(text(html)).toMatch(/3배/);
  });

  it("멈춘 트랙도 열린다 — 사유 알약", () => {
    expect(text(detail("stock_us"))).toMatch(/체결 가격 이상/);
  });
});

describe("빌더", () => {
  it("해석 네 경우", () => {
    const btc = { returnPct: 10, mddPct: -20 };
    expect(verdictLine({ returnPct: 5, mddPct: -30, beats: false }, btc)).toBe("BTC 보유보다 덜 벌고 더 빠졌다");
    expect(verdictLine({ returnPct: 5, mddPct: -5, beats: false }, btc)).toBe("덜 빠졌지만 BTC 보유보다 덜 벌었다");
    expect(verdictLine({ returnPct: -7, mddPct: -8, beats: false }, btc)).toBe("낙폭은 BTC보다 작지만 수익이 음수라 기준 미달");
    expect(verdictLine({ returnPct: 30, mddPct: -80, beats: false }, btc)).toBe("더 벌었지만 더 빠져 BTC 보유에 못 미친다");
    expect(verdictLine({ returnPct: 30, mddPct: -10, beats: true }, btc)).toBe("BTC 를 들고만 있는 것보다 나았다");
    expect(verdictLine({ returnPct: 1, mddPct: -1, beats: null }, btc)).toBeNull();
  });

  it("분포 — 0 이 막대 경계다, 합이 건수다", () => {
    const d = distribution([-7, -3, -1, 0.5, 2, 9]);
    expect(d?.bins.some((b) => b.from === 0 || b.to === 0)).toBe(true);
    expect(d?.bins.reduce((n, b) => n + b.count, 0)).toBe(6);
    expect(d?.median).toBe(-0.25);
    expect([d?.worst, d?.best]).toEqual([-7, 9]);
  });

  it("샤프 — 변동이 없으면 null, 꾸준히 벌면 양수", () => {
    const t0 = Date.parse("2026-09-01T00:00:00Z");
    const day = 86_400_000;
    expect(dailySharpe([], 500, t0, t0 + 10 * day).sharpe).toBeNull();
    const gains = Array.from({ length: 10 }, (_, i) => ({
      trackKey: "x",
      symbol: "BTC",
      direction: "long",
      exitAt: new Date(t0 + (i + 0.5) * day),
      netPnlUsdt: i % 3 === 0 ? 2 : 1,
      netReturnPct: 1,
    }));
    expect(dailySharpe(gains, 500, t0, t0 + 10 * day).sharpe ?? 0).toBeGreaterThan(0);
  });
});

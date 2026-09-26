/**
 * 포지션 탭 (UI-06) — 완료 확인과 「하지 말 것」.
 *
 * - 청산 경고를 빼지 말 것 (A-4 · 완료 5)
 * - 위험한 것 먼저 (A-3 · 완료 4)
 * - 가격 레일 · 캔들 차트 선 (완료 3 · 6 · 8)
 * - FCE 가 페이퍼에 안 내는 것은 **없다고 말한다** — 지어내지 않는다
 * - 미니멀/프로 (완료 11)
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PositionDetailBody } from "../components/tabs/PositionDetailBody";
import { PositionsBody } from "../components/tabs/PositionsBody";
import { HealthRing, healthTone, price } from "../components/ui";
import { LIQUIDATION_PCT, type FcePositionRow } from "../lib/lab/fce-board";
import { positionFromOpenTrade } from "../lib/lab/fce-payload";
import { LIVE_ONLY, buildPositions, railOf, riskOrder } from "../lib/lab/positions";
import { POSITIONS, POSITIONS_AT, fixtures } from "./fixtures/lab";

const data = fixtures();
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const base = POSITIONS[0] as FcePositionRow;
const withPnl = (id: string, netReturnPct: number, over: Partial<FcePositionRow> = {}): FcePositionRow => ({
  ...base,
  id,
  netReturnPct,
  liquidationLevel: netReturnPct <= LIQUIDATION_PCT,
  ...over,
});

describe("A-4 청산 위험", () => {
  it("증거금 대비 −80% 이하면 경고 — 테두리 빨강 + 알약 + 맨 위", () => {
    const core = buildPositions({
      positions: [withPnl("ok", -10), withPnl("risk", -85)],
      trackLabels: { crypto: "크립토" },
      research: [],
      lastAt: POSITIONS_AT,
    });
    expect(core.liquidationLevel).toBe(1);
    expect(core.positions[0]?.id).toBe("risk");
    const html = renderToStaticMarkup(createElement(PositionsBody, { data: JSON.parse(JSON.stringify(core)) }));
    expect(html).toMatch(/class="ps-card is-risk"/);
    expect(text(html)).toMatch(/청산 위험/);
  });

  it("−79.9% 는 아직 아니다 · 기준은 −80%", () => {
    expect(LIQUIDATION_PCT).toBe(-80);
    expect(withPnl("x", -79.9).liquidationLevel).toBe(false);
  });
});

describe("A-3 위험한 것 먼저", () => {
  it("건강도가 있으면 낮은 순", () => {
    const a = withPnl("a", 5, { healthScore: 80 });
    const b = withPnl("b", 5, { healthScore: 30 });
    expect([a, b].sort(riskOrder).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("건강도가 없으면(페이퍼) 무효화에 가까운 순", () => {
    const far = withPnl("far", 1, { healthScore: null, invalidationDistancePct: -5 });
    const near = withPnl("near", 1, { healthScore: null, invalidationDistancePct: -0.5 });
    expect([far, near].sort(riskOrder).map((p) => p.id)).toEqual(["near", "far"]);
  });

  it("실측 다섯도 그 순서다", () => {
    const d = data.positions.positions.map((p) => Math.abs(p.invalidationDistancePct ?? Infinity));
    expect(d).toEqual([...d].sort((x, y) => x - y));
  });
});

describe("가격 레일", () => {
  it("롱 — 무효화 0 · 익절 1 · 사이면 그 비율", () => {
    const r = railOf({ entryPrice: 100, markPrice: 105, invalidationPrice: 90, takeProfitPrice: 120 });
    expect(r?.mark).toBeCloseTo(0.5);
    expect(r?.entry).toBeCloseTo(1 / 3);
    expect(r?.beyond).toBeNull();
  });

  it("숏 — 무효화가 위에 있어도 왼쪽이 무효화다", () => {
    const r = railOf({ entryPrice: 110.69, markPrice: 110.39, invalidationPrice: 112.33, takeProfitPrice: 109.05 });
    expect(r?.mark).toBeGreaterThan(r?.entry ?? 1);
  });

  it("선을 넘으면 끝에 붙이고 알린다 — 점이 화면 밖으로 사라지지 않는다", () => {
    const r = railOf({ entryPrice: 100, markPrice: 85, invalidationPrice: 90, takeProfitPrice: 120 });
    expect(r).toMatchObject({ mark: 0, beyond: "invalidation", left: 90, moved: false });
  });

  it("부분 익절 뒤 올라간 손절이 왼쪽 끝이다 — FCE 거리와 같은 선 (ADA 실측)", () => {
    const ada = POSITIONS.find((x) => x.symbol === "ADAUSDT") as FcePositionRow;
    const r = railOf(ada);
    expect(r?.moved).toBe(true);
    expect(r?.left).toBe(ada.stopPrice);
    // FCE 의 거리(−0.548%)가 이 선까지의 거리다.
    const dist = (((ada.stopPrice as number) - (ada.markPrice as number)) / (ada.markPrice as number)) * 100;
    expect(dist).toBeCloseTo(ada.invalidationDistancePct as number, 2);
  });

  it("가격선이 없으면 레일도 없다", () => {
    expect(railOf({ entryPrice: 1, markPrice: 1, invalidationPrice: null, takeProfitPrice: 2 })).toBeNull();
  });

  it("목록 카드마다 레일 · 무효 · 현재 · 익절", () => {
    const html = renderToStaticMarkup(createElement(PositionsBody, { data: data.positions }));
    expect((html.match(/class="ui-rail is-card"/g) ?? []).length).toBe(data.positions.total);
    expect(text(html)).toMatch(/무효 .* 현재 .* 익절/);
  });
});

describe("B 상세", () => {
  const html = renderToStaticMarkup(createElement(PositionDetailBody, { data: data.positionDetail }));
  const p = data.positionDetail.position;

  it("Hero — 심볼 · 방향 · 배수 · 손익 · 진입 · 현재", () => {
    expect(text(html)).toContain(`${p.symbol} · ${p.direction === "short" ? "숏" : "롱"} · ${p.leverage}배`);
    expect(text(html)).toContain(`진입 ${price(p.entryPrice)} · 현재 ${price(p.markPrice)}`);
  });

  it("지금 볼 것 자리 — 무효화·익절까지 남은 거리(FCE 값)", () => {
    expect(html).toMatch(/class="ps-watch"/);
    expect(text(html)).toMatch(/(무효화|손절)까지 .*% · 익절1까지 .*%/);
  });

  it("프로 기본(서버 렌더) — 차트 · 라이브 전용 · 정보 · 연구가 있다", () => {
    expect(text(html)).toMatch(/차트/);
    expect(text(html)).toMatch(/포지션 정보/);
    expect(text(html)).toMatch(/연결된 연구/);
    for (const name of LIVE_ONLY) expect(text(html)).toContain(name);
  });

  it("차트에 네 시간봉 캔들이 실려 온다", () => {
    expect(Object.keys(data.positionDetail.chart).sort()).toEqual(["15m", "1d", "1h", "4h"]);
  });

  it("비용은 FCE 한 칸 그대로 — 수수료와 펀딩을 나눠 지어내지 않는다", () => {
    expect(text(html)).toMatch(/수수료·펀딩 누적/);
    expect(text(html)).not.toMatch(/펀딩 누적 .*수수료 /);
  });
});

describe("지어내지 않는다", () => {
  it("건강도가 없으면 원을 그리지 않는다", () => {
    expect(renderToStaticMarkup(createElement(HealthRing, { score: null }))).toBe("");
    expect(healthTone(72)).toBe("up");
    expect(healthTone(55)).toBe("warn");
    expect(healthTone(12)).toBe("dn");
  });

  it("실측 페이퍼 포지션에 건강도가 없다 — FCE 가 안 싣는다", () => {
    expect(POSITIONS.every((x) => x.healthScore === null)).toBe(true);
  });

  it("매퍼는 칸을 이름으로 옮긴다 — 라이브 계좌 칸(planned_stop_price 등)은 받지 않는다", () => {
    const p = positionFromOpenTrade({
      id: "x",
      symbol: "BTCUSDT",
      direction: "long",
      planned_stop_price: 1,
      liquidation_price: 2,
      exit_monitor: { mark_price: 10, mark_net_return_pct: 1 },
      invalidation_price: 9,
      take_profit_price: 12,
    });
    expect(Object.keys(p ?? {})).not.toContain("planned_stop_price");
    expect(p?.invalidationPrice).toBe(9);
    expect(p?.markPrice).toBe(10);
  });
});

describe("가격 표기", () => {
  it("유효 숫자 5자리 — 싼 코인과 비싼 종목이 같이 선다", () => {
    expect(price(0.11568)).toBe("0.11568");
    expect(price(2.146)).toBe("2.146");
    expect(price(110.69)).toBe("110.69");
    expect(price(null)).toBe("—");
  });
});

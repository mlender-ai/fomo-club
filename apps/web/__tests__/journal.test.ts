/**
 * 복기 탭 (UI-09) — 완료 확인과 「하지 말 것」.
 *
 * - 청산 사유를 빼지 말 것 · 사후 채점을 숫자만 두지 말 것 · 손실 거래를 숨기지 말 것
 *
 * 거래는 **FCE 원장 실측 264건**(`fixtures/journal.json`).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JournalBody, applyFilters, DEFAULT_FILTERS } from "../components/tabs/JournalBody";
import { JournalDetailBody } from "../components/tabs/JournalDetailBody";
import { exitSummary } from "../lib/lab/journal";
import { exitCategory, postExitLine, postExitOf, type DailyCandle } from "../lib/lab/journal-extra";
import { TRADES, fixtures } from "./fixtures/lab";

const data = fixtures();
const j = data.journal;
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const list = renderToStaticMarkup(createElement(JournalBody, { data: j }));

describe("A 목록", () => {
  it("hero 가 누적 실현 손익 — 원장 전부의 합 (완료 1)", () => {
    const net = TRADES.reduce((s, t) => s + (t.netPnlUsdt ?? 0), 0);
    expect(j.total.netUsdt).toBeCloseTo(net, 6);
    expect(j.total.count).toBe(264);
    expect(text(list)).toMatch(/거래 264건/);
  });

  it("거래가 전부 나온다 — 손실 거래 포함 (완료 3 · 하지 말 것)", () => {
    const links = new Set([...list.matchAll(/href="\/journal\/([^"]+)"/g)].map((m) => m[1]));
    expect(links.size).toBe(264);
    expect(j.rows.filter((r) => (r.netPnlUsdt ?? 0) < 0).length).toBeGreaterThan(0);
  });

  it("보유중은 파랑 알약으로 위에", () => {
    expect(list).toMatch(/class="ui-pill is-blue[^"]*"[^>]*>(?:<span[^>]*><\/span>)?보유중/);
  });

  it("필터 넷이 동작한다 (완료 2)", () => {
    const crypto = applyFilters(j.rows, { ...DEFAULT_FILTERS, track: "crypto" });
    expect(crypto.every((r) => r.trackKey === "crypto")).toBe(true);
    const loss = applyFilters(j.rows, { ...DEFAULT_FILTERS, result: "loss" });
    expect(loss.every((r) => (r.netPnlUsdt ?? 0) < 0)).toBe(true);
    const stop = applyFilters(j.rows, { ...DEFAULT_FILTERS, exit: "stop" });
    expect(stop.every((r) => r.category === "stop")).toBe(true);
    const recent = applyFilters(j.rows, { ...DEFAULT_FILTERS, period: "7" }, Date.parse("2026-09-27T00:00:00Z"));
    expect(recent.length).toBeLessThan(j.rows.length);
    expect(recent.length).toBeGreaterThan(0);
    const us = applyFilters(j.rows, { ...DEFAULT_FILTERS, track: "stock_us" });
    expect(us.length).toBe(0); // 주식 거래는 원장에 없다 — 없다고 보인다
    const filtered = renderToStaticMarkup(
      createElement(JournalBody, { data: j, initialFilters: { ...DEFAULT_FILTERS, exit: "take" } })
    );
    expect(text(filtered)).toMatch(new RegExp(`거래 ${applyFilters(j.rows, { ...DEFAULT_FILTERS, exit: "take" }).length}건`));
  });

  it("청산 사유별 막대 — 넷 + 기타, 합이 전부 (완료 4 · 하지 말 것)", () => {
    const bars = exitSummary(j.rows);
    expect(bars.reduce((s, b) => s + b.count, 0)).toBe(264);
    expect(bars.map((b) => b.label)).toEqual(expect.arrayContaining(["손절", "익절", "시간"]));
    expect(text(list)).toMatch(/청산 사유별/);
  });

  it("청산 품질 — 7일 지난 것만 센다 (완료 7)", () => {
    const q = j.quality;
    expect(q.stopRebound.of).toBe(j.rows.filter((r) => r.category === "stop" && r.post?.matured).length);
    expect(q.stopRebound.pct).not.toBeNull();
    expect(text(list)).toMatch(/손절 후 반등/);
    expect(text(list)).toMatch(/익절 후 더 감/);
  });

  it("폰에서 표가 가로로 민다 (완료 9)", () => {
    expect(list).toMatch(/class="ui-table-scroll"/);
  });
});

describe("B 상세 — 진입 · 청산 · 비용 · 조건 · 사후 채점 (완료 5 · 6)", () => {
  for (const d of data.journalDetails) {
    const html = renderToStaticMarkup(createElement(JournalDetailBody, { data: d }));
    it(`${d.trade.trackLabel} · ${d.trade.symbol} · ${d.trade.category}`, () => {
      for (const s of ["차트", "진입", "청산", "비용", "당시 조건", "사후 채점"]) expect(text(html)).toContain(s);
      expect(d.postExitLine).toBeTruthy();
      expect(text(html)).toContain(d.postExitLine as string);
    });
  }

  it("고래 거래는 고래 체결 · 지연 · 이탈이 진입 사유다 — 주소는 앞뒤만", () => {
    const w = data.journalDetails.find((d) => d.trade.trackKey === "whale");
    expect(w?.detail?.whale?.short).toMatch(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/);
    expect(JSON.stringify(data.journalDetails)).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });
});

describe("사후 채점 규칙", () => {
  const day = 86_400;
  const t0 = Date.parse("2026-09-01T00:00:00Z") / 1000;
  const candles = (closes: number[]): DailyCandle[] => closes.map((c, i) => [t0 + i * day, c, c, c, c]);

  it("롱 손절 뒤 7일에 오르면 반등 — 해석 한 줄", () => {
    const p = postExitOf({ direction: "long", exitAt: "2026-09-01T12:00:00Z", exitPrice: 100 }, candles([100, 99, 98, 99, 101, 103, 104, 106, 107]), new Date("2026-09-20T00:00:00Z"));
    expect(p?.matured).toBe(true);
    expect(p?.movePct).toBeCloseTo(6, 5);
    expect(postExitLine("stop", p)).toBe("손절 뒤 되돌아왔다 — 손절이 빡빡했을 수 있다");
  });

  it("숏은 내린 게 + — 익절 뒤 더 내렸으면 '익절이 일렀을 수 있다'", () => {
    const p = postExitOf({ direction: "short", exitAt: "2026-09-01T12:00:00Z", exitPrice: 100 }, candles([100, 98, 96, 95, 94, 93, 92, 91, 90]), new Date("2026-09-20T00:00:00Z"));
    expect(p?.verdict).toBe("favorable");
    expect(postExitLine("take", p)).toBe("익절 뒤 더 갔다 — 익절이 일렀을 수 있다");
  });

  it("숏 손절 뒤 가격이 오르면 '더 밀렸다' — 차트가 아니라 포지션 기준 (실측 LINKUSDT)", () => {
    const p = postExitOf({ direction: "short", exitAt: "2026-09-01T12:00:00Z", exitPrice: 100 }, candles([100, 103, 106, 108, 110, 112, 113, 114, 115]), new Date("2026-09-20T00:00:00Z"));
    expect(p?.verdict).toBe("adverse");
    expect(postExitLine("stop", p)).toBe("손절 뒤 더 밀렸다 — 손절이 맞았다");
  });

  it("±1% 안은 변화 없음 · 7일 전이면 표시", () => {
    const p = postExitOf({ direction: "long", exitAt: "2026-09-01T12:00:00Z", exitPrice: 100 }, candles([100, 100.5, 100.2]), new Date("2026-09-03T12:00:00Z"));
    expect(p?.matured).toBe(false);
    expect(postExitLine("time", p)).toMatch(/^나온 뒤 큰 변화 없음 \(2일째 · 아직 7일 전\)$/);
  });

  it("FCE 사유 → 넷 · 모르는 사유는 기타로 남는다", () => {
    expect(exitCategory("invalidation_breach")).toBe("stop");
    expect(exitCategory("take_profit_pressure")).toBe("take");
    expect(exitCategory("opposite_stance_flip")).toBe("signal");
    expect(exitCategory("time_decay")).toBe("time");
    expect(exitCategory("duplicate_bootstrap_suppressed")).toBe("other");
  });
});

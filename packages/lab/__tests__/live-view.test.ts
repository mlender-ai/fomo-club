/**
 * LAB-08 PART B-2 — **청산 조건이 화면으로 나가지 않는다.**
 *
 * 이것은 주의력으로 지킬 수 없는 규칙이다. 보유 포지션 객체 안에 손절선·목표가가
 * 같이 들어 있어서, 한 번 스프레드로 내보내면 그 뒤로는 아무도 눈치채지 못한다.
 * 그래서 검사로 못박는다.
 */
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_LIVE_KEYS,
  findForbiddenKeys,
  toLivePosition,
  type OpenPosition,
} from "../src";

const NOW = new Date("2026-09-15T12:00:00Z");

function position(overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    symbol: "BTC",
    side: "LONG",
    entryAt: new Date("2026-09-15T00:00:00Z"),
    entryPrice: 100,
    entryReason: "ma_cross up",
    qty: 2,
    stopPrice: 92,
    targetPrice: 130,
    entryCost: 0.5,
    funding: 0.2,
    maxHoldBars: 720,
    barsHeld: 12,
    exitSignalPending: false,
    ...overrides,
  };
}

describe("toLivePosition — 내보낼 칸만 옮긴다", () => {
  it("손절선·목표가·시간 청산 기준이 **결과에 없다**", () => {
    const live = toLivePosition(position(), 110, NOW);
    const keys = Object.keys(live);

    for (const forbidden of FORBIDDEN_LIVE_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
    expect(findForbiddenKeys(live)).toEqual([]);
  });

  it("직렬화한 문자열에도 그 숫자가 없다 — 이름만 지우는 것으로는 부족하다", () => {
    const json = JSON.stringify(toLivePosition(position({ stopPrice: 92.345 }), 110, NOW));
    expect(json).not.toContain("92.345");
    expect(json).not.toContain("130");
  });

  it("보여주기로 한 것은 그대로 있다", () => {
    const live = toLivePosition(position(), 110, NOW);
    expect(live).toEqual({
      symbol: "BTC",
      side: "LONG",
      entryPrice: 100,
      pnlPct: 10,
      heldHours: 12,
    });
  });

  it("숏은 부호가 뒤집힌다", () => {
    const live = toLivePosition(position({ side: "SHORT" }), 90, NOW);
    expect(live.pnlPct).toBe(10);
  });

  it("기준가가 없으면 손익은 **null 이다** — 0 으로 채우지 않는다", () => {
    expect(toLivePosition(position(), null, NOW).pnlPct).toBeNull();
    expect(toLivePosition(position(), Number.NaN, NOW).pnlPct).toBeNull();
  });

  it("시계가 뒤로 가도 보유 시간이 음수가 되지 않는다", () => {
    const live = toLivePosition(position(), 110, new Date("2026-09-14T00:00:00Z"));
    expect(live.heldHours).toBe(0);
  });
});

describe("findForbiddenKeys — 나가기 전 마지막 확인", () => {
  it("깊이 숨어 있어도 찾는다", () => {
    const payload = { rows: [{ label: "추세", positions: [{ symbol: "BTC", stopPrice: 92 }] }] };
    expect(findForbiddenKeys(payload)).toEqual(["stopPrice"]);
  });

  it("전략 정의가 통째로 섞여 들어가는 것도 잡는다", () => {
    const payload = { row: { definition: { entries: [], stop_pct: 8 } } };
    expect(findForbiddenKeys(payload).sort()).toEqual(["definition", "entries", "stop_pct"]);
  });

  it("깨끗하면 빈 배열이고, 순환 참조에도 멈추지 않는다", () => {
    const payload: Record<string, unknown> = { symbol: "BTC", pnlPct: 1.2 };
    payload.self = payload;
    expect(findForbiddenKeys(payload)).toEqual([]);
  });
});

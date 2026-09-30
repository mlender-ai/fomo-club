/**
 * 병행 운용 대조 (OPS-04 PART D) — 한 줄이라도 어긋나면 불일치, 맥이 계속 운영한다.
 */
import { describe, expect, it } from "vitest";

import { compareShadow, shadowMarkdown, type ShadowSide } from "../lib/lab/shadow-diff";

const SINCE = "2026-10-01T00:00:00Z";

function side(over: Partial<ShadowSide> = {}): ShadowSide {
  return {
    at: "2026-10-02T00:00:00Z",
    tracks: [{ key: "crypto", trades: 10, currentCapital: 400, status: "running" }],
    trades: [],
    positions: [],
    ...over,
  };
}

const trade = (id: string, over: Partial<ShadowSide["trades"][number]> = {}) => ({
  id,
  trackKey: "crypto",
  symbol: "BTCUSDT",
  direction: "long",
  entryAt: "2026-10-01T04:00:00Z",
  entryPrice: 100,
  exitAt: "2026-10-01T12:00:00Z",
  exitPrice: 110,
  netPnlUsdt: 3,
  ...over,
});

describe("병행 대조", () => {
  it("같은 진입 · 같은 청산이면 일치 — id 는 달라도 된다(양쪽이 따로 만든 uuid)", () => {
    const r = compareShadow(side({ trades: [trade("mac-1")] }), side({ trades: [trade("srv-9")] }), { since: SINCE });
    expect(r.verdict).toBe("일치");
    expect(r.pairs).toHaveLength(1);
    expect(r.reasons).toEqual([]);
  });

  it("한쪽에만 있는 진입은 불일치 — 같은 신호가 안 나왔다", () => {
    const r = compareShadow(side({ trades: [trade("mac-1")] }), side(), { since: SINCE });
    expect(r.verdict).toBe("불일치");
    expect(r.onlyMac).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/맥에만 있는 진입/);
  });

  it("크립토는 진입 시각이 1분만 달라도 다른 진입이다 — 확정 봉 시각으로 들어간다", () => {
    const r = compareShadow(
      side({ trades: [trade("a")] }),
      side({ trades: [trade("b", { entryAt: "2026-10-01T04:01:00Z" })] }),
      { since: SINCE }
    );
    expect(r.onlyMac).toHaveLength(1);
    expect(r.onlyServer).toHaveLength(1);
  });

  it("고래 추종은 몇 분 차이를 같은 진입으로 본다 — 지갑 체결을 읽는 간격", () => {
    const w = { trackKey: "whale", symbol: "ETHUSDT" };
    const r = compareShadow(
      side({ trades: [trade("a", w)] }),
      side({ trades: [trade("b", { ...w, entryAt: "2026-10-01T04:06:00Z" })] }),
      { since: SINCE }
    );
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]?.entryLagMin).toBe(6);
  });

  it("가격이 1bp 넘게 다르면 불일치", () => {
    const r = compareShadow(side({ trades: [trade("a")] }), side({ trades: [trade("b", { exitPrice: 110.5 })] }), {
      since: SINCE,
    });
    expect(r.verdict).toBe("불일치");
    expect(r.reasons.join("\n")).toMatch(/청산가 .*bp 차이/);
  });

  it("갈라지기 전에 열린 거래는 id 로 짝짓고 청산만 본다 — 한쪽만 닫았으면 불일치", () => {
    const old = { entryAt: "2026-09-30T20:00:00Z" };
    const r = compareShadow(
      side({ trades: [trade("same", old)] }),
      side({ positions: [{ id: "same", trackKey: "crypto", symbol: "BTCUSDT", direction: "long", entryAt: old.entryAt, entryPrice: 100 }] }),
      { since: SINCE }
    );
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]?.exitMismatch).toBe(true);
    expect(r.verdict).toBe("불일치");
  });

  it("갈라지기 전에 끝난 거래는 대조하지 않는다 — 복사한 DB 라 같다", () => {
    const done = { entryAt: "2026-09-29T00:00:00Z", exitAt: "2026-09-30T00:00:00Z" };
    const r = compareShadow(side({ trades: [trade("x", done)] }), side(), { since: SINCE });
    expect(r.verdict).toBe("일치");
  });

  it("트랙 N · 상태가 다르면 불일치로 적는다", () => {
    const r = compareShadow(
      side(),
      side({ tracks: [{ key: "crypto", trades: 11, currentCapital: 401, status: "stopped" }] }),
      { since: SINCE }
    );
    expect(r.reasons).toEqual(["crypto 상태 — 맥 running · 서버 stopped", "crypto N — 맥 10 · 서버 11"]);
  });

  it("문서용 한 장 — 판정이 제목에 있다", () => {
    const md = shadowMarkdown(compareShadow(side(), side(), { since: SINCE }));
    expect(md).toMatch(/^## 2026-10-02 — \*\*일치\*\*/);
  });
});

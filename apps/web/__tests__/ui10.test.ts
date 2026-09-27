/**
 * UI-10 — 품질 점검에서 고친 것.
 *
 * - C-2 최근 활동 → **복기 상세**(전에는 목록으로 갔다) · 진입 → 포지션 상세
 * - B 검색 ⌘K — 심볼 · 전략 · 포지션 · 거래 · 연구 · 지갑 · 화면
 */
import { describe, expect, it } from "vitest";

import { searchFilter, searchItems } from "../components/shell/CommandPalette";
import { fixtures } from "./fixtures/lab";

const data = fixtures();

describe("C-2 최근 활동은 상세로 간다", () => {
  it("청산 → /journal/{id} · 진입 → /positions/{id}", () => {
    const ids = new Set(data.journal.rows.map((r) => r.id));
    for (const e of data.overview.activity) {
      if (e.kind === "exit") {
        expect(e.href).toMatch(/^\/journal\/.+/);
        expect(ids.has(e.href.replace("/journal/", ""))).toBe(true);
      } else {
        expect(e.href).toMatch(/^\/positions\/.+/);
      }
    }
  });
});

describe("검색 ⌘K", () => {
  const items = searchItems({
    strategies: data.strategies,
    positions: data.positions,
    research: data.research,
    journal: data.journal,
    whales: data.whales,
  } as Parameters<typeof searchItems>[0]);

  it("일곱 종류가 다 들어 있다", () => {
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of ["화면", "전략", "포지션", "거래", "연구", "지갑"]) expect(kinds.has(k as never)).toBe(true);
  });

  it("심볼로 찾으면 보유 포지션과 거래가 같이 나온다", () => {
    const hit = searchFilter(items, "trump");
    expect(hit.some((i) => i.kind === "포지션")).toBe(true);
    expect(hit.some((i) => i.kind === "거래")).toBe(true);
    for (const i of hit) expect(i.href).toMatch(/^\/(positions|journal)\//);
  });

  it("낱말이 전부 들어 있어야 한다 — `eth 고래` 는 고래 추종의 ETH 거래", () => {
    const hit = searchFilter(items, "eth 고래");
    expect(hit.length).toBeGreaterThan(0);
    for (const i of hit) expect(`${i.label} ${i.sub}`).toMatch(/ETH/);
  });

  it("연구는 번호와 제목으로", () => {
    expect(searchFilter(items, "청산")[0]?.href).toMatch(/^\/(research|strategies|journal)/);
    expect(searchFilter(items, "02").some((i) => i.href === "/research/02")).toBe(true);
  });

  it("빈 검색은 화면 · 전략 · 연구부터(거래 수백 건을 쏟지 않는다)", () => {
    expect(searchFilter(items, "").some((i) => i.kind === "거래")).toBe(false);
  });

  it("지갑은 앞뒤만", () => {
    for (const i of items.filter((x) => x.kind === "지갑")) expect(i.label).toMatch(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/);
  });
});

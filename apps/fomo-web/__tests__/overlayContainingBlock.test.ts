import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collapseRepeats } from "../lib/judgmentTimeline";
import type { LedgerTimelineEntry } from "../lib/fomoApi";

/**
 * 하단 잘림 회귀 방지(2026-07).
 *
 * 진짜 원인은 패딩이 아니라 **컨테이닝 블록**이었다.
 * transform 이 남아 있는 조상 안에서는 position:fixed 가 뷰포트가 아니라 그 조상 기준으로 잡힌다.
 * 홈 <main> 이 진입 애니메이션(animation-fill-mode: both)으로 translateY(0) 을 영구히 들고 있었고,
 * 그 안에서 열린 뎁스 오버레이 아래쪽이 화면 밖으로 밀려 잘렸다.
 * 두 겹으로 막는다 — ① CSS fill-mode ② 오버레이의 body 포털.
 */

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const COMPONENTS = join(__dirname, "..", "components");

/** transform 을 다루는 키프레임 이름 목록. */
function transformKeyframes(): string[] {
  const names: string[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g;
  for (let m = re.exec(CSS); m; m = re.exec(CSS)) {
    if (/transform\s*:/.test(m[2]!)) names.push(m[1]!);
  }
  return names;
}

describe("① CSS — 애니메이션이 transform 을 남기지 않는다", () => {
  it("transform 키프레임을 쓰는 클래스는 fill-mode 로 both/forwards 를 쓰지 않는다", () => {
    const offenders: string[] = [];
    for (const name of transformKeyframes()) {
      // 무한 반복(마퀴)은 항상 애니메이션 중이라 fill-mode 대상이 아니다.
      const decl = new RegExp(`animation:\\s*${name}\\b[^;]*;`, "g");
      for (let m = decl.exec(CSS); m; m = decl.exec(CSS)) {
        const value = m[0];
        if (/\binfinite\b/.test(value)) continue;
        if (/\b(both|forwards)\b/.test(value)) offenders.push(`${name}: ${value.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("실제로 쓰이는 진입 애니메이션이 backwards 로 선언돼 있다", () => {
    expect(CSS).toMatch(/\.fomo-phase-in\s*\{[^}]*\bbackwards\b/);
  });
});

describe("② 배선 — 전체화면 오버레이는 body 로 포털한다", () => {
  const overlayRe = /className=\{?\s*(?:inline\s*\?[^}]*:\s*)?["`][^"`]*\bfixed inset-0\b[^"`]*\bz-\[(6|7|8)\d\]/;

  it("fixed inset-0 전체화면 오버레이를 가진 컴포넌트는 OverlayPortal 을 쓴다", () => {
    const missing = readdirSync(COMPONENTS)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => {
        const src = readFileSync(join(COMPONENTS, f), "utf8");
        return overlayRe.test(src) && !src.includes("OverlayPortal");
      });
    expect(missing).toEqual([]);
  });

  it("포털은 body 에 붙는다", () => {
    const portal = readFileSync(join(COMPONENTS, "OverlayPortal.tsx"), "utf8");
    expect(portal).toContain("createPortal");
    expect(portal).toContain("document.body");
  });
});

describe("③ 기록 목록 — 같은 말이 날짜만 바꿔 반복되지 않는다", () => {
  const entry = (id: string, date: string, pickType = "quiet"): LedgerTimelineEntry =>
    ({ id, date, kind: "selection", priceAt: 10, payload: { pickType } }) as unknown as LedgerTimelineEntry;

  it("연속으로 같은 내용이면 한 줄로 접고 횟수를 남긴다", () => {
    const collapsed = collapseRepeats([
      entry("a", "2026-07-26"),
      entry("b", "2026-07-25"),
      entry("c", "2026-07-24"),
      entry("d", "2026-07-23"),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.repeats).toBe(4);
    expect(collapsed[0]!.entry.date).toBe("2026-07-26"); // 대표는 최신
    expect(collapsed[0]!.since).toBe("2026-07-23"); // 가장 오래된 반복
  });

  it("사이에 다른 사건이 끼면 접지 않는다(시점 순서 보존)", () => {
    const collapsed = collapseRepeats([
      entry("a", "2026-07-26"),
      entry("b", "2026-07-25", "daily30"),
      entry("c", "2026-07-24"),
    ]);
    expect(collapsed).toHaveLength(3);
    expect(collapsed.every((c) => c.repeats === 1)).toBe(true);
  });

  it("빈 입력 → 빈 배열", () => {
    expect(collapseRepeats([])).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quietCardBlocks, quietCardMinHeight } from "../lib/quietCardLayout";

/**
 * WO-SUB-HOOK PART 2 — 카드 앞면 위계 · 카드 높이 가변.
 *
 * 소스 스캔 + 순수 함수 스냅샷 두 층으로 본다. 이 저장소에는 DOM 렌더러가 없으므로
 * "실제 픽셀"은 e2e(`e2e/quiet-card.spec.ts`)가 보고, 여기서는 **높이를 결정하는 계약**과
 * 렌더 구조를 고정한다. 계약이 상수로 남아 있으면 화면 높이도 조합마다 달라진다.
 */

const card = readFileSync(new URL("../components/QuietPickCard.tsx", import.meta.url), "utf8");
const deck = readFileSync(new URL("../components/QuietPickDeck.tsx", import.meta.url), "utf8");

/** 주석은 화면에 안 나간다 — 렌더 구조를 볼 때는 지우고 본다(주석의 "종전 h-[540px]" 서술 오탐 방지). */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("카드 위계 — 훅 1순위 · 되돌아보는 선 4순위", () => {
  it("훅이 화면에서 가장 큰 글자다", () => {
    // 훅 22px > 종목명 24px 은 예외(식별자) — 훅은 문장 중 가장 크다.
    expect(card).toMatch(/text-\[22px\] font-bold leading-8 text-whiteout"[^>]*>\{hook\}/);
  });

  it("되돌아보는 선은 박스가 아니라 회색 한 줄이다 (D4 · 완료 조건 4)", () => {
    const line = card.slice(card.indexOf('data-testid="recheck-line"') - 200, card.indexOf('data-testid="recheck-line"') + 120);
    expect(line).toContain("<p");
    expect(line).toContain("text-muted");
    // 박스를 만드는 클래스가 없어야 한다 — 실측에서 무효선 박스가 회사 정보보다 무거웠다.
    expect(line).not.toMatch(/rounded-lg bg-black\/15|border border-hairline/);
    expect(card).toContain("되돌아보는 선 · ");
  });

  it("무효선·자리 같은 옛말이 카드에 남아 있지 않다", () => {
    expect(card).not.toContain("무효선</span>");
    expect(card).toContain("◆ 사기 시작한 시점");
    expect(card).not.toContain("돈이 들어오기 시작한 자리");
  });

  it("칩은 발행 페이로드를 쓰고 신호 라벨 칩을 따로 만들지 않는다", () => {
    expect(card).toContain("cardChips(pick)");
    // "내부자 클러스터" 같은 라벨 칩은 제거됐다(D7 · PART 5).
    expect(card).not.toContain("SIGNAL_LABEL");
    expect(card).not.toContain("클러스터");
  });

  it("서브라인은 H6 게이트를 통과한 것만 그린다", () => {
    expect(card).toContain("quietPickSubLine(hook, pick.signal.progress)");
    // 훅은 옛 payload 복구를 거친 값이다(배치 시차 대응).
    expect(card).toContain("pickHook(pick)");
  });
});

describe("카드 높이 — 슬롯 조합 4종 스냅샷 (D5 · 완료 조건 5)", () => {
  const combos = {
    "①만": { substance: false, valuation: false, signalStats: false },
    "①②": { substance: true, valuation: false, signalStats: false },
    "①③": { substance: false, valuation: true, signalStats: false },
    "①②③": { substance: true, valuation: true, signalStats: false },
  } as const;

  it("조합마다 최소 높이가 실제로 다르다", () => {
    const heights = Object.values(combos).map(quietCardMinHeight);
    expect(new Set(heights).size).toBe(heights.length);
    // 슬롯이 늘수록 카드가 커진다(빈 슬롯이 자리를 지키지 않는다).
    expect(quietCardMinHeight(combos["①만"])).toBeLessThan(quietCardMinHeight(combos["①②"]));
    expect(quietCardMinHeight(combos["①②"])).toBeLessThan(quietCardMinHeight(combos["①③"]));
    expect(quietCardMinHeight(combos["①③"])).toBeLessThan(quietCardMinHeight(combos["①②③"]));
  });

  it("높이 스냅샷 — 값이 바뀌면 의도한 변경인지 확인한다", () => {
    expect(Object.fromEntries(Object.entries(combos).map(([k, v]) => [k, quietCardMinHeight(v)]))).toEqual({
      "①만": 372,
      "①②": 404,
      "①③": 480,
      "①②③": 512,
    });
  });

  it("블록 목록에 빈 슬롯 자리표시자가 없다", () => {
    expect(quietCardBlocks(combos["①만"])).toEqual([
      "identity",
      "price",
      "hook",
      "chips",
      "sparkline",
      "recheckLine",
    ]);
    expect(quietCardBlocks(combos["①②③"])).toContain("valuation");
    expect(quietCardBlocks(combos["①만"])).not.toContain("valuation");
  });

  it("카드가 최소 높이를 실제로 쓴다 — 계약이 화면에 배선돼 있다", () => {
    expect(card).toContain("quietCardMinHeight(");
    expect(card).toContain("style={{ minHeight }}");
  });

  it("덱 무대가 고정 높이를 갖지 않는다 — 무대가 D5 의 진짜 원인이었다", () => {
    expect(code(deck)).not.toContain("h-[540px]");
    expect(deck).toMatch(/<div className="relative select-none">/);
    // 앞 카드는 문서 흐름 안에 있어야 무대 높이가 카드를 따라간다.
    expect(deck).toMatch(/className="relative max-h-\[76vh\]/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **DS-07 — 카드 껍데기와 넘김 흐름.**
 *
 * 2026-08-31 지적("카드 크기가 제각각")을 고친 계약이다. 픽셀은 e2e 가 재고, 여기서는
 * **계약이 우회되지 않았는가**를 본다. 세 카드가 각자 마크업으로 자란 것이 문제의 원인이었으니,
 * 껍데기를 안 쓰는 카드가 다시 생기면 그 자리에서 막아야 한다.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SHELL = code(read("../components/CardShell.tsx"));
const DECK = code(read("../components/QuietPickDeck.tsx"));
const REVEAL = code(read("../lib/cardReveal.ts"));
/** 덱에 서는 카드 세 종류. 새 종류가 늘면 여기에 추가한다 — 추가를 잊으면 §1 이 안 걸린다. */
const CARDS = [
  ["종목", code(read("../components/QuietPickCard.tsx"))],
  ["업종 흐름", code(read("../components/FlowCard.tsx"))],
  ["거시 뉴스", code(read("../components/MacroCard.tsx"))],
] as const;

describe("§1 CardShell — 모든 카드가 통과한다", () => {
  it.each(CARDS)("%s 카드가 CardShell 을 쓴다", (_name, source) => {
    expect(source).toMatch(/from "@\/components\/CardShell"/);
    expect(source).toContain("<CardShell");
  });

  it.each(CARDS)("%s 카드가 자기 높이를 따로 정하지 않는다", (_name, source) => {
    // 껍데기가 정한 최소 높이를 카드가 덮어쓰면 다시 제각각이 된다.
    expect(source).not.toMatch(/min-h-\[|minHeight/);
  });

  it("최소 높이 상수가 CardShell 한 곳에만 있다", () => {
    expect(SHELL).toMatch(/CARD_MIN_HEIGHT\s*=\s*460/);
    for (const [name, source] of CARDS) {
      expect(source, `${name} 카드에 460 이 복사돼 있다`).not.toMatch(/\b460\b/);
    }
  });

  it("본문이 남는 자리를 먹고 CTA 는 아래끝에 남는다", () => {
    expect(SHELL).toMatch(/min-h-0 flex-1/); // 본문
    expect(SHELL).toMatch(/shrink-0/); // CTA
  });
});

describe("§2 CardCta — 44px 하나", () => {
  it("h-touch 와 rounded-block 을 쓴다 — pill(999px)로 돌아가지 않는다", () => {
    expect(SHELL).toContain("h-touch");
    expect(SHELL).toContain("rounded-block");
    expect(SHELL).not.toMatch(/rounded-full|999px/);
  });

  it.each(CARDS)("%s 카드가 CTA 를 직접 만들지 않는다", (_name, source) => {
    // CardCta 를 거치지 않은 <button> 이 CTA 자리에 오면 모양이 갈린다.
    // 관심(별) 버튼은 예외이므로 CTA testid 만 본다.
    expect(source).not.toMatch(/data-testid="[a-z-]*cta"/);
  });
});

describe("§4-1 덱은 순환한다", () => {
  it("마지막에서 다음은 0, 첫 장에서 이전은 마지막이다", () => {
    expect(DECK).toMatch(/wrapping/);
    expect(DECK).toMatch(/dir === "next" \? 0 : last/);
  });

  it("한 바퀴를 처음 돈 순간에만 deck_complete 를 기록한다", () => {
    expect(DECK).toMatch(/completedRef/);
    expect(DECK).toMatch(/deck_complete/);
    // 순환할 때마다 쏘면 지표가 아니라 소음이 된다.
    expect(DECK).toMatch(/!completedRef\.current/);
  });

  it("빈 덱에서는 순환하지 않는다", () => {
    expect(DECK).toMatch(/deckSlots\.length === 0/);
  });
});

describe("§4-2 상세를 닫으면 다음 장으로", () => {
  it("onClose 가 선택을 비우고 다음으로 넘긴다", () => {
    expect(DECK.replace(/\s+/g, " ")).toMatch(/setSelected\(null\); move\("next"\)/);
  });
});

describe("§4-3 한 번 연 카드는 종목명을 보여준다", () => {
  it("상세를 여는 자리에서 reveal 을 부른다", () => {
    expect(DECK).toMatch(/import \{ reveal \} from "@\/lib\/cardReveal"/);
    expect(DECK).toMatch(/reveal\(pick\.subject\.canonical\)/);
  });

  it("카드 앞면이 해제 여부를 읽는다", () => {
    expect(code(read("../components/QuietPickCard.tsx"))).toMatch(/isRevealed\(pick\.subject\.canonical\)/);
  });

  it("해제는 되돌아가지 않는다 — 해제를 지우는 함수가 없다", () => {
    expect(REVEAL).not.toMatch(/export function (unreveal|hide|clear)/);
  });
});

describe("§3·DS-02 §3·§5 — 개수와 인디케이터를 지운 자리가 비어 있다", () => {
  it("덱 타이틀이 개수를 세지 않는다", () => {
    expect(DECK).not.toMatch(/deck-thin/);
    expect(DECK).not.toMatch(/곳 남음|\{count\}곳|\$\{count\}곳/);
  });

  it("진행 인디케이터가 없다", () => {
    expect(DECK).not.toMatch(/deck-dots|pick-dots/);
  });
});

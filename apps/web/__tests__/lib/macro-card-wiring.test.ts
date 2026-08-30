import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WO-RESET-09 — **거시 카드가 실제로 덱에 나와야 한다.**
 * 데이터층만 만들고 안 이으면 화면에 아무것도 안 나온다(2026-08-28 에 한 번 겪었다).
 */
const engine = readFileSync(new URL("../../lib/quiet-pick.ts", import.meta.url), "utf8");
const cron = readFileSync(new URL("../../app/api/fomo/cron/quiet-pick/route.ts", import.meta.url), "utf8");
const deck = readFileSync(new URL("../../../fomo-web/components/QuietPickDeck.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../../../fomo-web/components/MacroCard.tsx", import.meta.url), "utf8");
const core = readFileSync(
  new URL("../../../../packages/fomo-core/src/keyword-cards/macro-link.ts", import.meta.url), "utf8"
);

describe("배선 (완료 확인 1)", () => {
  it("엔진이 거시 지표를 읽는다", () => {
    expect(engine).toContain("readMacroCollection: typeof readMacroCollection;");
    expect(engine).toContain('guardedInput("readMacroCollection"');
  });

  it("최근 30일 픽을 **한 쿼리로** 읽는다 — 날짜마다 따로 읽으면 커넥션을 30개 잡는다(§12)", () => {
    expect(cron).toContain("const RECENT_PICK_DAYS = 30;");
    expect(cron).toContain("readFeedContentMany<QuietPickResponse>(recentDates.map(dateId))");
  });

  it("응답에 실리고 덱이 그린다", () => {
    expect(engine).toContain("...(macroCards.length > 0 ? { macroCards } : {}),");
    expect(deck).toContain("res.macroCards ?? []");
    expect(deck).toContain("<MacroCard card={slot.card} />");
  });
});

describe("연결이 없으면 카드가 아니다 (§B-3·§F-3 · 완료 확인 3)", () => {
  it("2곳 미만이면 만들지 않는다", () => {
    expect(core).toContain("if (favored.length + hurt.length < MACRO_MIN_LINKED) return null;");
    expect(core).toContain("export const MACRO_MIN_LINKED = 2;");
  });

  it("엔진이 그 판정을 실제로 쓴다 — 통과 못 하면 카드를 안 만든다", () => {
    expect(engine).toContain("const link = linkMacroToPicks(move, linkPicks);");
    expect(engine).toContain("if (!link) continue;");
  });

  it("업종을 모르는 종목은 잇지 않는다 — 억지로 연결하지 않는다 (§D-2)", () => {
    expect(core).toContain("if (!pick.sector) continue;");
  });
});

describe("덱 위치·상한 (§E · 완료 확인 9)", () => {
  it("하루 최대 2장", () => {
    expect(engine).toContain("const MACRO_MAX_CARDS = 2;");
    expect(engine).toContain("if (out.length >= MACRO_MAX_CARDS) break;");
  });

  it("앞쪽 3장에 안 온다 — 뉴스가 먼저 나오면 뉴스 앱처럼 보인다", () => {
    // 흐름(2·5번째)을 끼운 뒤 거시를 4·7번째에 넣는다 → 실제 위치가 3번째 아래로 안 내려간다.
    expect(deck).toContain("[3, 6].forEach((at, i) => {");
    const flowAt = deck.indexOf("[1, 4].forEach");
    const macroAt = deck.indexOf("[3, 6].forEach");
    expect(macroAt).toBeGreaterThan(flowAt);
  });
});

describe("예측하지 않는다 (§F-1 · 완료 확인 8)", () => {
  it("화면이 제 문장을 짓지 않는다 — 전부 서버가 만든 것을 그린다", () => {
    expect(card).toContain("{card.hook}");
    expect(card).toContain("{card.principle}");
    /**
     * 주석은 화면에 안 나간다. 이 파일의 주석이 **왜 그 말을 안 쓰는지**를 적고 있으므로,
     * 규칙을 적어둔 글이 위반으로 잡히지 않게 렌더되는 코드에만 건다.
     */
    const rendered = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of ["오를 거", "내릴 거", "전망", "예상", "수혜", "추천"]) {
      expect(rendered, banned).not.toContain(banned);
    }
  });

  it("관측일을 밝힌다 — 지표는 하루이틀 늦게 나온다", () => {
    expect(card).toContain("card.asOf");
  });
});

describe("본문을 쓰지 않는다 (§A-2·§F-2 · 완료 확인 2)", () => {
  it("거시는 **숫자**만 저장한다 — 기사 본문·요약이 없다", () => {
    const collect = readFileSync(new URL("../../lib/macro-collect.ts", import.meta.url), "utf8");
    for (const banned of ["summary", "content", "body", "description"]) {
      expect(collect, banned).not.toContain(banned);
    }
    expect(collect).toContain("value: number");
  });

  it("결측(`.`)을 0 으로 읽지 않는다 — 환율 0원 한 줄이 추이선을 망가뜨린다", () => {
    const collect = readFileSync(new URL("../../lib/macro-collect.ts", import.meta.url), "utf8");
    expect(collect).toContain('if (trimmed === "." || trimmed === "") continue;');
  });
});

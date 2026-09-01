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
const depth = readFileSync(new URL("../../../fomo-web/components/MacroDepth.tsx", import.meta.url), "utf8");
const core =
  readFileSync(new URL("../../../../packages/fomo-core/src/keyword-cards/macro-link.ts", import.meta.url), "utf8") +
  readFileSync(new URL("../../../../packages/fomo-core/src/keyword-cards/macro-move.ts", import.meta.url), "utf8") +
  readFileSync(new URL("../../../../packages/fomo-core/src/keyword-cards/macro-indicators.ts", import.meta.url), "utf8");

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
    // MACRO-01 §D-2 — 거시 카드도 CTA 를 갖는다. 종전에는 `onDetail` 없이 그려져
    // **버튼이 아예 렌더되지 않았다**(DS-07 §1 이 약속한 것과 어긋나 있었다).
    expect(deck).toContain('<MacroCard card={slot.card} onDetail={() => openDetail("button")} />');
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

describe("덱 위치·상한 (§E · MACRO-01 §C-2)", () => {
  /**
   * 상한이 **한 곳에만** 있어야 한다. 종전에는 엔진이 `MACRO_MAX_CARDS = 2` 를 따로 들고
   * 있어서 코어의 값(3)과 어긋났다 — 두 곳에 있으면 한쪽만 고치게 된다.
   */
  it("하루 최대 3장이고 상한은 코어가 정한다", () => {
    expect(core).toContain("export const MACRO_MAX_CARDS = 3;");
    expect(engine).not.toMatch(/const MACRO_MAX_CARDS = \d/);
    expect(engine).toContain("selectMacroMoves(candidates)");
  });

  /**
   * 덱 자리 수가 상한보다 적으면 **세 번째 카드가 조용히 사라진다** — 상한을 2로 둔 것과
   * 같아진다. 상한을 3으로 올리면서 자리도 같이 늘렸는지 여기서 본다.
   */
  it("덱 자리 수가 상한과 같다 — 자리가 모자라면 상한이 무의미하다", () => {
    const slots = deck.match(/\[3, 6(, \d+)*\]\.forEach/)?.[0] ?? "";
    expect(slots.match(/\d+/g)).toHaveLength(3);
  });

  it("같은 분류에서 2장을 넘지 않는다 — 금리 셋이 서면 금리 브리핑이 된다", () => {
    expect(core).toContain("export const MACRO_MAX_PER_CATEGORY = 2;");
    expect(core).toContain("if (used >= MACRO_MAX_PER_CATEGORY) continue;");
  });

  /**
   * 후보를 **다 모은 뒤에** 고른다. 목록 순서대로 돌다 상한에 닿으면 멈추면 목록 위쪽
   * 지표가 언제나 이긴다 — 더 크게 움직인 지표가 아래에 있어도 진다.
   */
  it("강한 순으로 고른다 — 목록 순서가 아니라", () => {
    expect(core).toContain("sort((a, b) => b.move.strength - a.move.strength)");
    expect(engine).toContain("candidates.push({ move, link });");
  });

  it("앞쪽 3장에 안 온다 — 뉴스가 먼저 나오면 뉴스 앱처럼 보인다", () => {
    // 흐름(2·5번째)을 끼운 뒤 거시를 4·7번째에 넣는다 → 실제 위치가 3번째 아래로 안 내려간다.
    expect(deck).toContain("[3, 6, 9].forEach((at, i) => {");
    const flowAt = deck.indexOf("[1, 4].forEach");
    const macroAt = deck.indexOf("[3, 6, 9].forEach");
    expect(macroAt).toBeGreaterThan(flowAt);
  });
});

describe("예측하지 않는다 (§F-1 · 완료 확인 8)", () => {
  it("화면이 제 문장을 짓지 않는다 — 전부 서버가 만든 것을 그린다", () => {
    expect(card).toContain("{card.hook}");
    // `principle` 은 카드에서 상세로 내려갔다(MACRO-01 §D-2) — 긴 카드는 눌리지 않는다.
    expect(card).not.toContain("{card.principle}");
    expect(depth).toContain("{card.principle}");
    /**
     * 주석은 화면에 안 나간다. 이 파일의 주석이 **왜 그 말을 안 쓰는지**를 적고 있으므로,
     * 규칙을 적어둔 글이 위반으로 잡히지 않게 렌더되는 코드에만 건다.
     */
    const rendered = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of ["오를 거", "내릴 거", "전망", "예상", "수혜", "추천"]) {
      expect(rendered, banned).not.toContain(banned);
    }
  });

  it("관측일을 **상대 시간**으로 밝힌다 (MACRO-01 §B-3)", () => {
    /**
     * `8월 25일 기준` 으로 쓰면 사용자가 오늘 날짜와 빼봐야 오래됐다는 걸 안다.
     * `어제 기준` 은 그 계산을 대신해 준다. 문장은 굽는 시점에 굳혀 보낸다 —
     * 화면이 계산하면 캐시된 페이지에서 어제 것이 오늘로 읽힌다.
     */
    expect(card).toContain("card.asOfLabel");
    expect(card).not.toMatch(/card\.asOf[^L]/);
    expect(engine).toContain("asOfLabel: macroFreshnessLabel(move.asOf, date),");
  });

  it("오래된 지표로는 카드를 만들지 않는다 (§B-3 · 완료 확인 3)", () => {
    expect(engine).toContain("if (!isMacroFresh(move.asOf, date)) continue;");
    expect(core).toContain("export const MACRO_MAX_STALE_TRADING_DAYS = 2;");
  });
});

describe("본문을 쓰지 않는다 (§A-2·§F-2 · 완료 확인 2)", () => {
  it("거시는 **숫자**만 저장한다 — 기사 본문·요약이 없다", () => {
    const collect = readFileSync(new URL("../../lib/macro-collect.ts", import.meta.url), "utf8");
    for (const banned of ["summary", "content", "body", "description"]) {
      expect(collect, banned).not.toContain(banned);
    }
    // 저장하는 것은 `{ date, value }` 뿐이다 — 타입은 `macro-naver.ts` 의 `MacroPoint` 다.
    expect(collect).toContain("MacroPoint");
    const point = readFileSync(new URL("../../lib/macro-naver.ts", import.meta.url), "utf8");
    expect(point).toContain("value: number;");
  });

  /**
   * 종전에는 FRED CSV 의 `.`(결측)을 걸렀다. FRED 를 걷어냈으므로(MACRO-01 §B — 느려서)
   * 이제 막아야 할 것은 **숫자가 아닌 칸**이다. 0 으로 읽으면 환율 0원 한 줄이 추이선을
   * 통째로 망가뜨리는 것은 소스가 바뀌어도 그대로다.
   */
  it("숫자가 아닌 칸을 0 으로 읽지 않는다 — 환율 0원 한 줄이 추이선을 망가뜨린다", () => {
    const naver = readFileSync(new URL("../../lib/macro-naver.ts", import.meta.url), "utf8");
    expect(naver).toContain('if (!/^-?\\d+(\\.\\d+)?$/.test(cleaned)) return null;');
    // 파싱 실패는 `null` 이고, 호출부는 `null` 이면 그 행을 통째로 버린다.
    expect(naver).toContain("if (value === null) continue;");

    const treasury = readFileSync(new URL("../../lib/macro-treasury.ts", import.meta.url), "utf8");
    expect(treasury).toContain("if (!Number.isFinite(value)) continue;");
  });

  it("장중 값을 종가로 쓰지 않는다 — 굽는 시각엔 오늘 장이 10분밖에 안 지났다", () => {
    const collect = readFileSync(new URL("../../lib/macro-collect.ts", import.meta.url), "utf8");
    expect(collect).toContain("return points.filter((p) => p.date < today);");
  });
});

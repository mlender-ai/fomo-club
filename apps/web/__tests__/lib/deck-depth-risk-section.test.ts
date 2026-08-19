import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WO-SUB-FILL PART 5 — **덱 뎁스에 "이게 틀리는 경우" 가 실제로 붙어 있는지.**
 *
 * ## 못 박는 것
 *
 * 06 이 만든 `WhereThisIsWrong` 은 `StockInsightView`(KeywordDepthPage)에만 붙어 있었다.
 * 그런데 **주 화면인 픽 카드의 "자세히" 는 `QuietPickDepth` 를 연다** — 거기엔 이 섹션이
 * 아예 없었다. 즉 리스크 배치가 채워져도 주 화면에는 뜨지 않는 구조였다.
 *
 * DOM 으로 확인해서야 드러났다. 페이로드(`card-slots`)에는 유형 리스크가 3~4건씩 실려
 * 있었으므로 API 만 보면 "채워졌다" 로 읽힌다 — **API 응답과 화면 렌더는 다른 층이다.**
 *
 * 소스 스캔인 이유: 이 컴포넌트를 렌더하려면 오버레이·탭·비동기 fetch 를 다 태워야 하는데,
 * 그 환경을 단위 테스트로 세우는 비용이 검사하려는 사실보다 크다. 여기서 막는 것은
 * "**두 뎁스 중 하나에서 섹션이 빠지는 회귀**" 이고 그건 사용 여부로 충분히 잡힌다.
 *
 * DS-03 이후 덱 뎁스는 `WhereThisIsWrong` 컴포넌트를 쓰지 않는다 — ⑤ 틀리는 경우를 라벨-값
 * 형식으로 **인라인**으로 그린다(박스는 ⑥ 하나뿐이라는 규칙). 지키는 사실은 그대로다:
 * 리스크 데이터가 이 화면에 닿고, 없으면 섹션이 사라지고, 가격 무효선의 정본은 하나다.
 */

const DECK_DEPTH = readFileSync(new URL("../../../fomo-web/components/QuietPickDepth.tsx", import.meta.url), "utf8");
const INSIGHT_DEPTH = readFileSync(new URL("../../../fomo-web/components/KeywordDepthPage.tsx", import.meta.url), "utf8");
const DECK = readFileSync(new URL("../../../fomo-web/components/QuietPickDeck.tsx", import.meta.url), "utf8");

/** JSX 사용처. `<WhereThisIsWrong` 뒤에 공백·개행·`/`·`>` 가 와야 한다(제네릭 인자 오탐 방지). */
const USAGE = /<WhereThisIsWrong[\s/>]/;

describe("두 뎁스 모두 이게 틀리는 경우를 렌더한다", () => {
  it("덱 뎁스(QuietPickDepth) — 픽 카드의 자세히가 여는 화면 (DS-03 ⑤ 인라인)", () => {
    expect(DECK_DEPTH).toContain('title="틀리는 경우"');
    expect(DECK_DEPTH).toContain('data-testid="depth-archetype-risk"');
    expect(DECK_DEPTH).toContain('data-testid="depth-symbol-risk"');
  });

  it("종목 뎁스(StockInsightView) — 관심목록·검색·피드가 여는 화면", () => {
    expect(INSIGHT_DEPTH).toMatch(USAGE);
  });

  it("덱의 자세히가 여는 것이 QuietPickDepth 라는 전제가 유지된다", () => {
    // 이 전제가 깨지면 위 첫 단정이 엉뚱한 파일을 지키게 된다.
    expect(DECK).toContain("QuietPickDepth");
  });
});

describe("리스크 블록을 페이로드에서 받아온다", () => {
  it("덱 뎁스가 card-slots 를 조회한다 — 컨텍스트로 실어오지 않는다", () => {
    // 뎁스는 덱·피드·검색 여러 경로에서 열리므로 호출 지점에서 받는다.
    expect(DECK_DEPTH).toContain("fetchCardSlots");
    expect(DECK_DEPTH).toMatch(/slots\[stock\] \?\? null/);
    expect(DECK_DEPTH).toMatch(/slotPayload\?\.risk/);
  });

  it("블록이 없으면 섹션을 렌더하지 않는다 — 빈 섹션 금지", () => {
    expect(DECK_DEPTH).toMatch(/\{hasWrongSection && \(/);
    expect(DECK_DEPTH).toContain("const hasWrongSection = Boolean(");
  });

  it("유형 리스크는 2개까지만 — 3개면 종목과 무관한 템플릿 노이즈로 읽힌다 (DS-03 §8)", () => {
    expect(DECK_DEPTH).toMatch(/archetype\.items \?\? \[\]\)\.slice\(0, 2\)/);
    expect(DECK_DEPTH).toContain("archetype.disclaimer");
  });

  it("미확보 사유와 문구를 그대로 쓴다 — 화면이 '확보하지 못함' 을 말할 수 있어야 한다", () => {
    for (const field of ["unavailable_reason", "unavailable_text"]) {
      expect(DECK_DEPTH, field).toContain(field);
    }
  });
});

/**
 * 가격 무효선을 **두 번 내보내지 않는다.**
 *
 * 픽에는 이미 `pick.invalidation.text` 가 있고 카드·차트가 그것을 쓴다. 리스크 페이로드에도
 * 가격 무효선을 실어 두 경로가 생기면, 한쪽만 갱신될 때 화면 두 곳이 다른 무효선을 말한다.
 */
describe("가격 무효선은 정본이 하나다", () => {
  it("덱 뎁스는 픽의 무효선 문구를 쓴다", () => {
    // 문구는 픽의 것이 정본이고, 옛 payload 는 읽는 쪽에서 용어만 고친다(WO-SUB-HOOK 배치 시차).
    expect(DECK_DEPTH).toMatch(/repairPickCopy\(pick\.invalidation\.text\)/);
  });

  it("리스크 페이로드의 가격 무효선은 픽에 값이 없을 때만 쓴다", () => {
    expect(DECK_DEPTH).toMatch(/repairPickCopy\(pick\.invalidation\.text\) \|\| risk\?\.invalidation\.price_text/);
  });
});

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
 * ## WO-RESET-05 §0-2 로 방향이 **뒤집혔다**
 *
 * 덱 뎁스에서 「틀리는 경우」를 **뺐다.** 이유는 채워지지 않아서가 아니라, 채워진 뒤 실제
 * 화면을 보니 `52주 저점 63,000원 이탈 여부가 다음 판단 기준이에요` 가 **모든 종목에
 * 똑같이** 나왔고 그걸 보고 사용자가 할 수 있는 것이 없었기 때문이다.
 *
 * 그래서 이 파일이 지키는 사실도 뒤집힌다 — 이제 막는 회귀는 **"뺀 섹션이 슬그머니
 * 돌아오는 것"** 이다. 레거시 뎁스(관심목록·검색이 여는 화면)에는 그대로 있고,
 * 데이터(`/risk` 응답·`pick.invalidation`)도 그대로 둔다. **화면만 뺐다.**
 */

const DECK_DEPTH = readFileSync(new URL("../../../fomo-web/components/QuietPickDepth.tsx", import.meta.url), "utf8");
const INSIGHT_DEPTH = readFileSync(new URL("../../../fomo-web/components/KeywordDepthPage.tsx", import.meta.url), "utf8");
const DECK = readFileSync(new URL("../../../fomo-web/components/QuietPickDeck.tsx", import.meta.url), "utf8");

/** JSX 사용처. `<WhereThisIsWrong` 뒤에 공백·개행·`/`·`>` 가 와야 한다(제네릭 인자 오탐 방지). */
const USAGE = /<WhereThisIsWrong[\s/>]/;

describe("덱 뎁스에서 「틀리는 경우」를 뺐다 (WO-RESET-05 §0-2)", () => {
  /** 주석은 화면에 안 나간다 — 왜 뺐는지 적어둔 글이 위반으로 잡히면 안 된다. */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("덱 뎁스에 섹션도, 그 재료를 읽는 코드도 없다", () => {
    const body = strip(DECK_DEPTH.slice(DECK_DEPTH.indexOf("export function QuietPickDepth")));
    expect(USAGE.test(body)).toBe(false);
    expect(body).not.toContain("틀리는 경우");
    expect(body).not.toContain('data-testid="depth-wrong"');
    expect(body).not.toContain("archetype");
    expect(body).not.toContain("unavailable");
  });

  it("모든 종목에 똑같이 나오던 그 문장을 안 그린다", () => {
    const body = strip(DECK_DEPTH.slice(DECK_DEPTH.indexOf("export function QuietPickDepth")));
    expect(body).not.toContain("invalidation.text");
    expect(body).not.toMatch(/이탈 여부/);
  });

  it("레거시 뎁스에는 그대로 있다 — 화면만 뺀 것이지 기능을 지운 것이 아니다", () => {
    expect(USAGE.test(INSIGHT_DEPTH)).toBe(true);
  });

  it("데이터는 남는다 — 픽 페이로드의 무효선은 카드가 계속 쓴다", () => {
    // 카드 그림의 무효선(점선)이 이 값을 쓴다. 지우면 그림이 거짓이 된다.
    expect(DECK_DEPTH).toContain("pick.invalidation.level");
  });

  it("덱의 자세히가 여는 것이 QuietPickDepth 라는 전제가 유지된다", () => {
    // 상세를 닫으면 다음 카드로 넘기는 핸들러가 붙어 여러 줄로 갈렸다(2026-08-31).
    expect(DECK).toContain("<QuietPickDepth");
    expect(DECK).toContain("pick={selected}");
  });
});

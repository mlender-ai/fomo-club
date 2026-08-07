import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WO-SUB-06.5 — 배선 감시.
 *
 * 컴포넌트가 있어도 **붙지 않으면 사용자에게 0** 이다. WO-SUB-04 의 차트가 정확히 그 상태였다
 * (`buildValuationChart` 가 테스트에서만 호출되고 프론트 경로가 없었다 — payload.ts 주석 참조).
 * 같은 일이 리스크 섹션에 반복되지 않게 배선 자체를 단정한다.
 */

const DEPTH = readFileSync(new URL("../components/KeywordDepthPage.tsx", import.meta.url), "utf8");
const API = readFileSync(new URL("../lib/fomoApi.ts", import.meta.url), "utf8");

describe("뎁스 배선", () => {
  it("WhereThisIsWrong 을 실제로 렌더한다", () => {
    expect(DEPTH).toContain('import { WhereThisIsWrong } from "@/components/WhereThisIsWrong"');
    // 제네릭(`useState<WhereThisIsWrongBlock | null>`)이 아니라 JSX 사용을 본다.
    expect(DEPTH).toMatch(/<WhereThisIsWrong[\s>]/);
  });

  it("'언제 틀리는가' 섹션 안에 있다 — 무효선 계약과 같은 자리", () => {
    const heading = DEPTH.indexOf('label="언제 틀리는가"');
    const component = DEPTH.search(/<WhereThisIsWrong[\s>]/);
    expect(heading).toBeGreaterThan(-1);
    expect(component).toBeGreaterThan(heading);
    // 다음 헤딩 전에 있어야 같은 섹션이다
    const nextHeading = DEPTH.indexOf("DepthDocHeading", heading + 10);
    expect(component).toBeLessThan(nextHeading === -1 ? DEPTH.length : nextHeading);
  });

  it("card-slots 에서 리스크를 받는다 — context 에 실어 오지 않는다(진입 경로가 여러 개다)", () => {
    expect(DEPTH).toContain("fetchCardSlots");
    expect(DEPTH).toMatch(/slots\[stock\]\?\.risk/);
  });

  it("가격 무효선은 verdict 를 쓴다 — payload 로 두 번 내보내지 않는다", () => {
    expect(DEPTH).toMatch(/priceText:\s*front\?\.verdict\?\.invalidation/);
  });

  it("리스크가 없으면 섹션만 빠지고 뎁스는 그대로다", () => {
    expect(DEPTH).toMatch(/\{riskBlock &&/);
  });
});

describe("API 계약", () => {
  it("CardSlotPayload 에 risk 필드가 있다", () => {
    expect(API).toMatch(/risk:\s*WhereThisIsWrongBlock \| null/);
  });
});

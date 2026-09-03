/**
 * DETAIL-03 PART C — **섹터가 왜 안 나왔나.**
 *
 * 국내 섹터를 `sectorOf()` 하나로만 찾았다. 그건 손으로 관리하는 사전이고 **80종목**뿐인데
 * 픽 유니버스는 **760종목**이다 — 프로덕션 15장 중 13장이 섹터 없이 나갔다(2026-09-03 실측).
 * 신뢰도 게이트도 표시 로직도 아니었다. **찾을 곳이 하나뿐이었다.**
 */
import { describe, expect, it } from "vitest";
import { companyIdentity } from "../../lib/quiet-pick";

const front = {} as never;

function sig(over: Record<string, unknown> = {}) {
  return {
    subject: { canonical: "테스트종목", country: "KR", market: "KOSDAQ" },
    kind: "foreign_streak",
    code: "foreign_streak",
    actorNoun: "외국인",
    actors: "외국인",
    scale: "1만주",
    days: 3,
    startedAt: "2026-08-31",
    baseStrength: 10,
    attentionKey: "테스트종목",
    ...over,
  } as never;
}

function sheet(classification: { sector?: string | null; industry?: string | null }) {
  return { classification: { scheme: null, source: null, sector: null, industry: null, ...classification } } as never;
}

describe("companyIdentity — 팩트시트 분류를 섹터 폴백으로 쓴다", () => {
  it("사전에 없으면 팩트시트 `industry` 에서 받는다", () => {
    expect(companyIdentity(front, sig(), sheet({ industry: "반도체와반도체장비" }))).toBe("반도체");
  });

  it("표시명 표에 없는 업종은 **원문 그대로** — 모르면 지어내지 않는다", () => {
    expect(companyIdentity(front, sig(), sheet({ industry: "손해보험" }))).toBe("손해보험");
  });

  it("`industry` 가 없으면 `sector` 로 내려간다", () => {
    expect(companyIdentity(front, sig(), sheet({ industry: null, sector: "경기관련소비재" })))
      .toBe("경기관련소비재");
  });

  it("`industry` 를 `sector` 보다 먼저 본다 — 대분류는 업종으로 읽히지 않는다", () => {
    // 표시명 표가 `게임엔터테인먼트` → `게임` 으로 옮긴다(프로덕션 실측 라벨이다).
    expect(companyIdentity(front, sig(), sheet({ industry: "게임엔터테인먼트", sector: "경기관련소비재" })))
      .toBe("게임");
  });

  it("사전에 있으면 사전이 이긴다 — 큐레이션이 우선이다", () => {
    // `네패스` 는 사전에 `반도체` 로 등재돼 있다.
    expect(companyIdentity(front, sig({ subject: { canonical: "네패스", country: "KR", market: "KOSDAQ" } }), sheet({ industry: "손해보험" })))
      .toBe("반도체");
  });

  it("팩트시트가 없으면 빈 문자열 — 화면은 섹터 줄을 그리지 않는다", () => {
    expect(companyIdentity(front, sig(), undefined)).toBe("");
  });

  it("테마 라벨은 섹터가 아니다 — 폴백에서도 막는다", () => {
    expect(companyIdentity(front, sig(), sheet({ industry: "코인" }))).toBe("");
  });

  it("20자를 넘는 라벨은 쓰지 않는다 — 섹터가 아니라 문장이다", () => {
    expect(companyIdentity(front, sig(), sheet({ industry: "가".repeat(21) }))).toBe("");
  });

  it("빈 분류는 빈 문자열", () => {
    expect(companyIdentity(front, sig(), sheet({ industry: "  ", sector: null }))).toBe("");
  });
});

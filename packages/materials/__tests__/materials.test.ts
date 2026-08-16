import { describe, expect, it } from "vitest";
import { classifyEventType, classifyEventTypes } from "../src/classify/event-type";
import { isNewsEvent, POTENTIAL_DIRECTION, type MaterialEvent, type NewsLinkEvent } from "../src/types";

describe("§4 재료 유형 분류 — 규칙 기반", () => {
  it.each([
    ["매출액또는손익구조30%(대규모법인은15%)이상변동", "EARNINGS_RESULT"],
    ["연결재무제표 기준 영업(잠정)실적", "EARNINGS_RESULT"],
    ["단일판매·공급계약체결", "CONTRACT"],
    ["신규 시설투자 등", "CAPACITY"],
    ["회사합병 결정", "MNA"],
    ["유상증자 결정", "CAPITAL_RAISE"],
    ["전환사채권 발행결정", "CAPITAL_RAISE"],
    ["자기주식 취득 결정", "BUYBACK_DIVIDEND"],
    ["현금·현물배당 결정", "BUYBACK_DIVIDEND"],
    ["임원ㆍ주요주주 특정증권등 소유상황보고서", "INSIDER_TRADE"],
    ["주식등의 대량보유상황보고서", "INSIDER_TRADE"],
    ["최대주주 변경", "GOVERNANCE"],
    ["소송 등의 제기·신청", "REGULATORY"],
    ["실적 전망 공시", "GUIDANCE"],
  ])("%s → %s", (title, expected) => {
    expect(classifyEventTypes(title)).toContain(expected);
  });

  it("US 서식도 분류한다", () => {
    expect(classifyEventTypes("Form 4 - Statement of changes")).toContain("INSIDER_TRADE");
    expect(classifyEventTypes("Form 10-Q quarterly report")).toContain("EARNINGS_RESULT");
  });

  it("**분류 실패는 OTHER 다 — 억지로 넣지 않는다**", () => {
    expect(classifyEventTypes("기타 경영사항(자율공시)")).toEqual(["OTHER"]);
    expect(classifyEventTypes("")).toEqual(["OTHER"]);
    expect(classifyEventType("알 수 없는 제목")).toBe("OTHER");
  });

  it("**한 공시가 복수 유형이면 복수 태그를 허용한다**", () => {
    const types = classifyEventTypes("합병 및 유상증자 결정");
    expect(types).toContain("MNA");
    expect(types).toContain("CAPITAL_RAISE");
    expect(types.length).toBeGreaterThan(1);
  });

  it("결정론 — 같은 입력에 같은 출력", () => {
    const title = "단일판매·공급계약체결";
    expect(classifyEventTypes(title)).toEqual(classifyEventTypes(title));
  });
});

describe("§3 규칙 1 — 소스 종류 분리 (완료조건 3)", () => {
  it("뉴스 이벤트에는 제목·본문 필드가 아예 없다", () => {
    const news: NewsLinkEvent = {
      id: "n1",
      symbol: "065450",
      kind: "news",
      event_type: "OTHER",
      disclosed_at: "2026-08-16",
      url: "https://example.com/article",
      source: "연합뉴스",
      fetched_at: "2026-08-16T00:00:00Z",
    };
    // 저장할 자리가 없어야 저장되지 않는다 — 옵셔널로 두면 언젠가 채워진다.
    expect(Object.keys(news)).not.toContain("title");
    expect(Object.keys(news)).not.toContain("body_excerpt");
  });

  it("가드로 뉴스와 공시가 갈린다", () => {
    const filing: MaterialEvent = {
      id: "f1",
      symbol: "065450",
      kind: "filing",
      event_type: "CONTRACT",
      title: "단일판매·공급계약체결",
      disclosed_at: "2026-08-16",
      url: null,
      body_excerpt: null,
      source: "DART",
      fetched_at: "2026-08-16T00:00:00Z",
    };
    const news: MaterialEvent = {
      id: "n1",
      symbol: "065450",
      kind: "news",
      event_type: "OTHER",
      disclosed_at: "2026-08-16",
      url: "https://example.com/a",
      source: "연합뉴스",
      fetched_at: "2026-08-16T00:00:00Z",
    };
    expect(isNewsEvent(news)).toBe(true);
    expect(isNewsEvent(filing)).toBe(false);
    // 좁혀진 타입에서만 title 에 접근할 수 있다.
    if (!isNewsEvent(filing)) expect(filing.title).toBe("단일판매·공급계약체결");
  });
});

describe("§4-1 잠재 방향 — 내부 신호", () => {
  it("표대로 매핑된다", () => {
    expect(POTENTIAL_DIRECTION.CONTRACT).toBe("positive");
    expect(POTENTIAL_DIRECTION.CAPITAL_RAISE).toBe("negative");
    expect(POTENTIAL_DIRECTION.EARNINGS_RESULT).toBe("mixed");
  });

  it("OTHER·NONE 에는 방향이 없다 — 없는 것을 만들지 않는다", () => {
    expect(POTENTIAL_DIRECTION.OTHER).toBeUndefined();
    expect(POTENTIAL_DIRECTION.NONE).toBeUndefined();
  });
});

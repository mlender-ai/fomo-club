/** WO-RESET-02 A-2 — 제목을 종류로 분류한다. 모르겠으면 `기타`. */
import { describe, expect, it } from "vitest";
import { classifyDisclosure, disclosureKindLabel } from "../src/keyword-cards/disclosure-kind";

describe("classifyDisclosure — WO A-2 표", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["매출액또는손익구조30%이상변동", "실적"],
    ["연결재무제표 기준 영업(잠정)실적", "실적"],
    ["단일판매·공급계약체결", "수주"],
    ["신규시설투자등", "투자"],
    ["타법인 주식 및 출자증권 취득결정", "투자"],
    ["유상증자결정", "자금"],
    ["전환사채권발행결정", "자금"],
    ["주요사항보고서(자기주식취득결정)", "주주환원"],
    ["현금·현물배당 결정", "주주환원"],
    ["최대주주변경", "지분"],
    ["임원ㆍ주요주주특정증권등소유상황보고서", "지분"],
  ];
  for (const [title, kind] of cases) {
    it(`${title} → ${kind}`, () => expect(classifyDisclosure(title)).toBe(kind));
  }

  it("모르겠으면 기타 — 억지로 넣지 않는다", () => {
    for (const title of ["투자판단 관련 주요경영사항", "조회공시요구(풍문또는보도)", "기타경영사항(자율공시)", ""]) {
      expect(classifyDisclosure(title), title).toBe("기타");
    }
    expect(classifyDisclosure(undefined)).toBe("기타");
  });

  it("정정 접두는 원래 종류를 물려받는다 — 정정은 상태이지 종류가 아니다", () => {
    expect(classifyDisclosure("[기재정정]단일판매·공급계약체결")).toBe("수주");
    expect(classifyDisclosure("[정정]유상증자결정")).toBe("자금");
  });

  it("SEC 폼 번호도 같은 창구로 분류한다", () => {
    expect(classifyDisclosure("10-Q")).toBe("실적");
    expect(classifyDisclosure("4")).toBe("지분");
    expect(classifyDisclosure("SC 13D")).toBe("지분");
    expect(classifyDisclosure("424B5")).toBe("자금");
    // 8-K 는 무엇이든 담는다 — 억지로 분류하지 않는다.
    expect(classifyDisclosure("8-K")).toBe("기타");
  });

  it("라벨은 화면에 그대로 쓸 수 있는 말이다", () => {
    expect(disclosureKindLabel("수주")).toBe("수주 공시");
    expect(disclosureKindLabel("기타")).toBe("공시");
  });
});

import { describe, it, expect } from "vitest";
import { disclosurePhrase } from "../src/keyword-cards/disclosure-phrase";

describe("공시 제목을 사람 말로 — WO-RESET-05 §3-1", () => {
  it("실제로 화면에 올라가던 세 건을 바꾼다 (2026-08-26 프로덕션 실측)", () => {
    expect(disclosurePhrase("임원ㆍ주요주주특정증권등소유상황보고서").text)
      .toBe("임원이나 주요 주주의 보유 주식이 바뀌었어요");
    expect(disclosurePhrase("주식등의대량보유상황보고서(일반)").text)
      .toBe("누군가 지분 5% 이상을 신고했어요");
    expect(disclosurePhrase("타인에대한담보제공결정").text)
      .toBe("회사가 다른 곳에 담보를 제공하기로 했어요");
  });

  it("중점·공백 표기가 달라도 같은 것으로 본다", () => {
    for (const t of ["임원·주요주주특정증권등소유상황보고서", "임원 ㆍ 주요주주 특정증권등 소유상황보고서"]) {
      expect(disclosurePhrase(t).translated).toBe(true);
    }
  });

  it("부기 `(일반)`·`(약식)`·`(공정공시)`는 종류를 바꾸지 않는다", () => {
    const a = disclosurePhrase("주식등의대량보유상황보고서(일반)").text;
    const b = disclosurePhrase("주식등의대량보유상황보고서(약식)").text;
    expect(a).toBe(b);
    expect(disclosurePhrase("영업(잠정)실적(공정공시)").translated).toBe(true);
  });

  it("정정은 종류가 아니라 상태다 — 종류를 물려받고 정정 사실을 남긴다", () => {
    const p = disclosurePhrase("[기재정정]타법인주식및출자증권취득결정");
    expect(p.text).toBe("다른 회사 지분을 사기로 했어요 (정정)");
    expect(p.translated).toBe(true);
  });

  it("표에 없으면 **원문 그대로** — 억지로 비슷한 칸에 넣지 않는다", () => {
    const p = disclosurePhrase("투자판단관련주요경영사항");
    expect(p.text).toBe("투자판단관련주요경영사항");
    expect(p.translated).toBe(false);
  });

  it("자기주식은 취득·처분·소각·신탁을 섞지 않는다 — 반대 사건이다", () => {
    const buy = disclosurePhrase("자기주식취득결정").text;
    const sell = disclosurePhrase("자기주식처분결정").text;
    const burn = disclosurePhrase("자기주식소각결정").text;
    expect(new Set([buy, sell, burn]).size).toBe(3);
    expect(sell).toContain("팔기로");
    expect(burn).toContain("없애기로");
  });

  it("제목에 없는 것(금액·평가·전망)을 지어내지 않는다", () => {
    const banned = /좋|나쁘|유망|저평가|호재|악재|기대|전망|억원|%|배/;
    for (const t of [
      "단일판매ㆍ공급계약체결", "유상증자결정", "매출액또는손익구조30%이상변동",
      "최대주주변경", "소송등의제기ㆍ신청", "조회공시요구(현저한시황변동)",
    ]) {
      const p = disclosurePhrase(t);
      expect(p.translated).toBe(true);
      expect(p.text).not.toMatch(banned);
    }
  });

  it("빈 제목은 빈 문자열 — 지어내지 않는다", () => {
    expect(disclosurePhrase("").text).toBe("");
    expect(disclosurePhrase(null).text).toBe("");
  });
});

describe("제목이 들고 있던 숫자는 버리지 않는다", () => {
  it("뒤에 붙은 실제 수치를 그대로 남긴다 — 서식 이름만 옮긴다", () => {
    const p = disclosurePhrase("단일판매ㆍ공급계약체결 · 계약금액 320억");
    expect(p.translated).toBe(true);
    expect(p.text).toBe("큰 계약을 따냈어요 · 계약금액 320억");
  });

  it("서식 이름 안의 중점은 부기가 아니다 — 공백 없는 구분자는 안 가른다", () => {
    expect(disclosurePhrase("단일판매ㆍ공급계약체결").text).toBe("큰 계약을 따냈어요");
    expect(disclosurePhrase("임원ㆍ주요주주특정증권등소유상황보고서").text)
      .toBe("임원이나 주요 주주의 보유 주식이 바뀌었어요");
  });

  it("수치와 정정이 함께 오면 둘 다 남는다", () => {
    expect(disclosurePhrase("[정정]단일판매ㆍ공급계약체결 · 계약금액 320억").text)
      .toBe("큰 계약을 따냈어요 · 계약금액 320억 (정정)");
  });
});

describe("문서와 코드가 어긋나지 않는다 — 문서가 정본이다", () => {
  it("표의 모든 문구가 docs/wo/DISCLOSURE_PHRASEBOOK.md 에 있다", async () => {
    const fs = await import("node:fs/promises");
    const [src, doc] = await Promise.all([
      fs.readFile("packages/fomo-core/src/keyword-cards/disclosure-phrase.ts", "utf8"),
      fs.readFile("docs/wo/DISCLOSURE_PHRASEBOOK.md", "utf8"),
    ]);
    const block = src.slice(src.indexOf("const RULES"), src.indexOf("공시 제목을 사람 말로."));
    const phrases = [...block.matchAll(/\[\/.+?\/,\s*"(.+?)"\],/g)].map((m) => m[1]!);
    expect(phrases.length).toBeGreaterThan(40);
    const missing = phrases.filter((p) => !doc.includes(p));
    expect(missing).toEqual([]);
  });

  it("어떤 문구도 평가어를 쓰지 않는다 — 비교 사실만 (WO 하지 말 것)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("packages/fomo-core/src/keyword-cards/disclosure-phrase.ts", "utf8");
    const block = src.slice(src.indexOf("const RULES"), src.indexOf("공시 제목을 사람 말로."));
    const phrases = [...block.matchAll(/\[\/.+?\/,\s*"(.+?)"\],/g)].map((m) => m[1]!);
    const banned = /저평가|유망|좋은|나쁜|호재|악재|기대되|추천|매력/;
    expect(phrases.filter((p) => banned.test(p))).toEqual([]);
  });
});

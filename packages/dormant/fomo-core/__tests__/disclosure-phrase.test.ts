import { describe, it, expect } from "vitest";
import { disclosurePhrase, DISCLOSURE_RULES } from "../src/keyword-cards/disclosure-phrase";
import { WHY_NOW_FORBIDDEN } from "../src/keyword-cards/why-now";

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
  /**
   * 종전에는 소스를 정규식으로 긁어 문구를 뽑았다. **표를 그대로 읽는다** — 표 모양이
   * 바뀌면(DETAIL-04 에서 튜플 → 객체) 정규식이 조용히 0건을 뽑고 검사가 통과해 버린다.
   */
  it("표의 모든 문구와 **뜻풀이**가 docs/wo/DISCLOSURE_PHRASEBOOK.md 에 있다", async () => {
    const fs = await import("node:fs/promises");
    const doc = await fs.readFile("docs/wo/DISCLOSURE_PHRASEBOOK.md", "utf8");
    expect(DISCLOSURE_RULES.length).toBeGreaterThan(40);
    const missing = DISCLOSURE_RULES.flatMap((r) =>
      [r.text, r.meaning].filter((line) => !doc.includes(line))
    );
    expect(missing).toEqual([]);
  });

  it("어떤 문구도 평가어를 쓰지 않는다 — 비교 사실만 (WO 하지 말 것)", () => {
    const banned = /저평가|유망|좋은|나쁜|호재|악재|기대되|추천|매력/;
    const hits = DISCLOSURE_RULES.flatMap((r) => [r.text, r.meaning].filter((l) => banned.test(l)));
    expect(hits).toEqual([]);
  });
});

/**
 * DETAIL-04 — 뜻풀이. `공시 원문 →` 링크를 화면에서 뺀 자리를 이 줄이 메운다.
 * 링크가 없어졌으므로 **여기서 틀리면 사용자가 바로잡을 방법이 없다** — 그래서 게이트가 세다.
 */
describe("뜻풀이는 서식의 뜻이지 회사 사실이 아니다 — DETAIL-04", () => {
  it("표의 모든 줄이 뜻풀이를 갖는다 — 못 쓰겠으면 표에 넣지 않는다", () => {
    const empty = DISCLOSURE_RULES.filter((r) => r.meaning.trim().length === 0);
    expect(empty).toEqual([]);
  });

  it("뜻풀이도 인과·평가·예측 금지 게이트를 통과한다 (WHY_NOW_FORBIDDEN)", () => {
    const hits = DISCLOSURE_RULES.filter((r) => WHY_NOW_FORBIDDEN.test(r.meaning)).map((r) => r.meaning);
    expect(hits).toEqual([]);
  });

  it("뜻풀이에 회사별 사실(금액·기간·주체)을 지어 넣지 않는다", () => {
    // 원(₩)·달러 금액이나 `320억` 같은 개별 수치는 본문에만 있다 — 우리는 본문을 저장하지 않는다.
    const fabricated = /\d+억|\d+조|\$\d|원\)/;
    const hits = DISCLOSURE_RULES.filter((r) => fabricated.test(r.meaning)).map((r) => r.meaning);
    expect(hits).toEqual([]);
  });

  it("번역된 공시는 뜻풀이가 함께 온다", () => {
    const p = disclosurePhrase("주식등의대량보유상황보고서(일반)");
    expect(p.translated).toBe(true);
    expect(p.meaning).toContain("5%");
  });

  it("수치·정정이 붙어도 뜻은 서식의 것이라 그대로다", () => {
    const plain = disclosurePhrase("단일판매ㆍ공급계약체결");
    const rich = disclosurePhrase("[정정]단일판매ㆍ공급계약체결 · 계약금액 320억");
    expect(rich.text).not.toBe(plain.text);
    expect(rich.meaning).toBe(plain.meaning);
  });

  it("표에 없는 서식은 뜻풀이가 **없다** — 모르는 것을 지어내지 않는다", () => {
    const p = disclosurePhrase("투자판단관련주요경영사항");
    expect(p.translated).toBe(false);
    expect(p.meaning).toBeUndefined();
  });

  it("한 줄로 읽히는 길이다 — 카드 안이라 문단이 될 수 없다", () => {
    const tooLong = DISCLOSURE_RULES.filter((r) => r.meaning.length > 110).map((r) => r.meaning);
    expect(tooLong).toEqual([]);
  });
});

describe("프로덕션 화면에서 원문 서식 이름으로 나가던 것을 채웠다 (2026-09-04 실측 · 종근당)", () => {
  it("`임원ㆍ주요주주특정증권등거래계획보고서` 는 소유상황보고서와 **다른 사건**이다", () => {
    const plan = disclosurePhrase("임원ㆍ주요주주특정증권등거래계획보고서");
    const owned = disclosurePhrase("임원ㆍ주요주주특정증권등소유상황보고서");
    expect(plan.translated).toBe(true);
    expect(plan.text).not.toBe(owned.text);
    // 계획은 **앞으로**, 소유상황은 **이미 바뀐 것**이다.
    expect(plan.text).toContain("미리");
    // 방향(사는 계획/파는 계획)은 제목에 없다 — 없다고 말하는 것이 이 줄의 일이다.
    expect(plan.meaning).toContain("알 수 없어요");
  });

  it("스톡옵션·대표이사·증권신고서·감자·공개매수도 사람 말로 나간다", () => {
    for (const [title, needle] of [
      ["주식매수선택권부여에관한신고", "살 권리"],
      ["대표이사변경(안내공시)", "대표이사"],
      ["증권신고서(지분증권)", "서류를 냈어요"],
      ["감자결정", "자본을 줄이기로"],
      ["공개매수신고서", "공개로 사 모으"],
      ["단기차입금증가결정", "짧게 빌린 돈"],
    ] as const) {
      const p = disclosurePhrase(title);
      expect(p.translated, title).toBe(true);
      expect(p.text, title).toContain(needle);
      expect(p.meaning, title).toBeTruthy();
    }
  });
});

describe("프로덕션에서 원문으로 나가던 것들을 채웠다 (2026-08-27 실측 5건)", () => {
  it("자기주식취득**결과보고서**는 취득 결정과 다른 사건이다", () => {
    const done = disclosurePhrase("자기주식취득결과보고서");
    const plan = disclosurePhrase("자기주식취득결정");
    expect(done.translated).toBe(true);
    expect(done.text).not.toBe(plan.text);
    expect(done.text).toContain("얼마나 샀는지");
  });

  it("나머지 넷도 사람 말로 나간다", () => {
    for (const [title, needle] of [
      ["주주명부폐쇄기간또는기준일설정", "주주 명단"],
      ["기업설명회(IR)개최(안내공시)", "투자자 설명회"],
      ["기업가치제고계획예고", "주주가치"],
      ["주주총회소집결의", "주주총회"],
    ] as const) {
      const p = disclosurePhrase(title);
      expect(p.translated, title).toBe(true);
      expect(p.text, title).toContain(needle);
    }
  });
});

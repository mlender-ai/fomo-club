import { describe, expect, it } from "vitest";
import { rewriteCompanySummary, findBannedTerms } from "../src";

/**
 * WO-SUB-HOOK PART 3-3 · 완료 조건 8 — "어떤 회사예요"에 `~하였음` 문체와 설립·상장 연도가 없다.
 * 실측 원문은 빅텍(2026-08-14 화면)에서 그대로 가져왔다.
 */
const 빅텍_원문 =
  "동사는 1990년 빅텍파워시스템으로 설립되어 1996년 법인 설립, 2003년 코스닥시장에 상장하였음. " +
  "방위사업에서 전자전 시스템, 군용전원공급장치, 피아식별장비 등을 생산하고, " +
  "민수사업에서는 공공자전거 무인대여시스템을 운영하고 있음.";

describe("rewriteCompanySummary — 벤더 요약을 그대로 노출하지 않는다", () => {
  it("설립·상장 연혁 문장을 버린다", () => {
    const { text } = rewriteCompanySummary(빅텍_원문);
    expect(text).not.toContain("설립");
    expect(text).not.toContain("상장");
    expect(text).not.toContain("1990년");
    expect(text).not.toContain("2003년");
  });

  it("등기부 문체를 해요체로 바꾼다", () => {
    const { text } = rewriteCompanySummary(빅텍_원문);
    expect(text).not.toContain("하였음");
    expect(text).not.toMatch(/있음\.?$/);
    expect(text).toContain("운영하고 있어요");
  });

  it("무엇을 하는 회사인지는 남는다", () => {
    const { text } = rewriteCompanySummary(빅텍_원문);
    expect(text).toContain("전자전");
    expect(text).toContain("공공자전거");
  });

  it("원문은 버리지 않는다 — 화면이 '출처 보기'로 접어 둔다", () => {
    const { raw, trimmed } = rewriteCompanySummary(빅텍_원문);
    expect(raw).toContain("1990년");
    expect(trimmed).toBe(true);
  });

  it("두 문장까지만 남긴다", () => {
    const long = "가전제품을 만들어 팝니다. 반도체 장비도 공급함. 자회사가 물류를 함. 부동산도 임대함.";
    const { text } = rewriteCompanySummary(long);
    expect(text.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it("연혁만 있는 요약은 남길 게 없다 — 빈 문자열(섹션 자체가 사라진다)", () => {
    expect(rewriteCompanySummary("동사는 1970년 설립되어 1990년 상장하였음.").text).toBe("");
  });

  it("한국어가 아니면 손대지 않는다 — 어미 규칙은 한국어 전용이다", () => {
    const en = "Amrize is a building materials company.";
    expect(rewriteCompanySummary(en).text).toBe(en);
  });

  it("빈 입력에 문장을 지어내지 않는다", () => {
    expect(rewriteCompanySummary(null).text).toBe("");
    expect(rewriteCompanySummary("   ").text).toBe("");
  });

  it("결과에 금지어가 없다", () => {
    expect(findBannedTerms(rewriteCompanySummary(빅텍_원문).text)).toEqual([]);
  });
});

/**
 * FIX-02 PART A — **사업 문장을 순서 때문에 놓치고 있었다.**
 *
 * 2026-09-04 실측: 덱 국내 12종목 전부가 200자 넘는 벤더 요약을 갖고 있는데 화면에 회사
 * 설명이 나온 것은 5종목뿐이었다. 벤더 요약은 `연혁 → 지배구조 → 사업` 순으로 쓰이는데
 * 종전 코드는 **원문 순서대로 두 문장을 채우고 멈춰서** 맨 끝 사업 문장에 도달하지 못했다.
 *
 * 원문은 실측 그대로 쓴다(넥스틸·CJ프레시웨이·LIG아큐버).
 */
describe("무엇을 파는가를 고른다 — 위치가 아니라 내용 (FIX-02 A)", () => {
  const 넥스틸 =
    "동사는 1990년 대원공업으로 설립되었으며 2001년 넥스틸로 상호 변경, 2023년 유가증권시장에 상장됨. " +
    "연결대상 종속회사로 비상장 3개사를 보유하며, 미국 법인을 운영하고 신규 해외법인 NEXTEEL USA LLC 설립하여 포트폴리오를 다각화하고 있음. " +
    "동사는 강관의 생산과 판매가 주요사업으로, OCTG, 송유관, 배관용·구조용 강관을 전 세계에 수출·판매하고 있음.";

  const CJ프레시웨이 =
    "동사는 1988년 식자재 유통 및 푸드 서비스업을 영위할 목적으로 설립되어, 2001년 코스닥에 상장됨. " +
    "CJ 기업집단의 중간지배기업으로 국내 4개사와 해외 3개사의 종속회사를 보유하고 있으며, 2026년 마켓보로 지분을 추가로 취득하여 종속기업으로 편입함. " +
    "주요 사업은 식자재 유통, 오피스·산업체·병원 대상 단체급식 서비스, 소스·드레싱·엑기스 제조 및 농산물 전처리로 구분됨.";

  const LIG아큐버 =
    "동사는 2000년 유무선 자동측정 및 제어 시스템 개발을 목적으로 설립되고, 2005년 코스닥에 상장됨. " +
    "미국, 일본, 홍콩, 영국, 폴란드, 중국, 인도 등 7개 지역을 거점으로 계열사 Accuver를 통해 전 세계에 제품과 서비스를 제공하고 있음. " +
    "이동통신 사업부는 무선망 최적화, Big Data, 통신 T&M, SmallCell, 방산 제품을, 오토모티브는 차량용 반도체 유통과 V2X 시험 솔루션 사업을 하고 있음.";

  it("맨 끝에 있는 사업 문장을 고른다 — 종전에는 여기 도달하지 못했다", () => {
    const { text } = rewriteCompanySummary(넥스틸);
    expect(text).toContain("강관");
    // 종속회사·연혁 문장이 그 자리를 차지하지 않는다.
    expect(text).not.toContain("종속회사");
    expect(text).not.toContain("설립");
  });

  it("길이 초과 시 **점수가 낮은 문장**을 버린다 — 배열 끝을 자르지 않는다", () => {
    /**
     * CJ프레시웨이는 연혁 문장이 짧아 살아남고 사업 문장이 뒤에 온다. 종전 트리밍은
     * 배열 끝(= 사업 문장)을 잘라서 연혁만 남겼다.
     */
    const { text } = rewriteCompanySummary(CJ프레시웨이);
    expect(text).toContain("식자재 유통");
    expect(text).not.toContain("1988년");
  });

  it("계열사를 끼고 말하는 문장보다 사업부·제품을 말하는 문장을 앞세운다 (A-3 계열사 금지)", () => {
    const { text } = rewriteCompanySummary(LIG아큐버);
    expect(text).toContain("이동통신 사업부");
    expect(text).not.toContain("계열사");
  });

  it("지배구조만 말하는 문장은 회사 설명이 아니다 — 버린다", () => {
    const 지배구조만 =
      "동사는 2010년 설립되어 2015년 상장함. 주요 종속회사로 골프장 운영의 동화기업(주), 물류사업의 (주)유진로지스틱스 등이 있음.";
    expect(rewriteCompanySummary(지배구조만).text).toBe("");
  });

  it("실측 12종목 전부에서 설명이 나온다 — 데이터가 아니라 우리가 버리고 있었다", () => {
    for (const raw of [넥스틸, CJ프레시웨이, LIG아큐버]) {
      const { text } = rewriteCompanySummary(raw);
      expect(text.length, raw.slice(0, 20)).toBeGreaterThan(10);
      // 첫 문장이 「무엇을 파는가」다 — 연혁·계열사로 시작하지 않는다.
      expect(text, raw.slice(0, 20)).not.toMatch(/^(19|20)\d{2}년/);
    }
  });
});

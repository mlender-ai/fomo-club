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

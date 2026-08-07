import { describe, expect, it } from "vitest";
import { extractKrRiskSections } from "../../lib/risk/dart-risk-section";

/**
 * WO-SUB-06 §5-2 (KR) — 실측 목차를 픽스처로 고정한다.
 *
 * 프로브(4종목 전부 동일 서식)로 확인한 것:
 *  · `II. 사업의 내용` 안에 `5. 위험관리 및 파생거래` 가 표준 절로 있다
 *  · 재무제표 주석에 `재무위험관리의 목적 및 정책(위험관리)` 이 따로 있다
 *  · 모든 절이 `<TITLE>` 로 열리므로 다음 제목이 곧 종료점이다
 */

const BODY_TEXT = "당사는 환율·금리 변동에 대응해 통화선도 계약을 이용하고 있습니다. ".repeat(12);
const NOTE_TEXT = "연결실체는 신용위험·유동성위험에 노출되어 있으며 정책에 따라 관리합니다. ".repeat(12);

function doc(parts: Array<[string, string]>): string {
  return parts.map(([title, body]) => `<TITLE ATOC="Y">${title}</TITLE><P>${body}</P>`).join("");
}

describe("extractKrRiskSections", () => {
  it("사업의 내용 안 '5. 위험관리 및 파생거래' 를 business 로 뽑는다", () => {
    const xml = doc([
      ["4. 매출 및 수주상황", "매출 내역"],
      ["5. 위험관리 및 파생거래", BODY_TEXT],
      ["6. 주요계약 및 연구개발활동", "계약 내역"],
    ]);
    const { sections } = extractKrRiskSections(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.section).toBe("business");
    expect(sections[0]!.text).toContain("통화선도");
    expect(sections[0]!.text).not.toContain("계약 내역");
  });

  it("주석의 재무위험관리는 financial 로 따로 잡는다 — 사업 리스크와 합치지 않는다", () => {
    const xml = doc([
      ["5. 위험관리 및 파생거래", BODY_TEXT],
      ["6. 주요계약 및 연구개발활동", "계약"],
      ["29-1. 재무위험관리의 목적 및 정책(위험관리) (연결)", NOTE_TEXT],
      ["30. 특수관계자", "거래 내역"],
    ]);
    const { sections } = extractKrRiskSections(xml);
    expect(sections.map((section) => section.section)).toEqual(["business", "financial"]);
  });

  it("목차 줄(짧은 구간)은 뽑지 않는다", () => {
    const xml = doc([
      ["목 차", "5. 위험관리 및 파생거래 ... 24"],
      ["5. 위험관리 및 파생거래", "짧음"],
      ["6. 주요계약", "x"],
    ]);
    expect(extractKrRiskSections(xml).sections).toHaveLength(0);
  });

  it("위험 절이 없으면 빈 배열 — 제목 수는 진단으로 남는다", () => {
    const xml = doc([
      ["1. 사업의 개요", "개요"],
      ["2. 주요 제품 및 서비스", "제품"],
    ]);
    const result = extractKrRiskSections(xml);
    expect(result.sections).toEqual([]);
    expect(result.titles).toBe(2);
  });

  it("마지막 절이어도 문서 끝까지 자른다", () => {
    const xml = doc([["5. 위험관리 및 파생거래", BODY_TEXT]]);
    expect(extractKrRiskSections(xml).sections).toHaveLength(1);
  });

  it("금융업 서식('재무건전성 등 기타 참고사항')도 business 로 잡는다", () => {
    // 실측(BNK금융지주): 위험관리 및 파생거래 절이 없고 이것이 그 자리다. 제목 수도 70개.
    const xml = doc([
      ["3. 파생상품거래 현황", "거래 내역"],
      ["5. 재무건전성 등 기타 참고사항", BODY_TEXT],
      ["III. 재무에 관한 사항", "재무"],
    ]);
    const { sections } = extractKrRiskSections(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.section).toBe("business");
  });

  it("절 번호가 없어도 잡는다", () => {
    const xml = doc([["위험관리", BODY_TEXT], ["다음 절", "x"]]);
    expect(extractKrRiskSections(xml).sections).toHaveLength(1);
  });

  it("financial 이 여러 벌이면 가장 긴 것만 남긴다 — 합성 예산 낭비 방지", () => {
    // 실측(종근당): 연결·별도 × 하위 항목으로 financial 6개가 잡혔다.
    const short = "짧은 주석입니다. ".repeat(25);
    const long = "긴 주석 전문입니다. ".repeat(80);
    const xml = doc([
      ["5. 위험관리 및 파생거래", BODY_TEXT],
      ["29-1. 재무위험관리의 목적 및 정책(위험관리) (연결)", long],
      ["29-2. 재무위험관리의 목적 및 정책(위험관리) (연결)", short],
      ["30-1. 재무위험관리의 목적 및 정책(위험관리)", short],
      ["31. 특수관계자", "거래"],
    ]);
    const { sections } = extractKrRiskSections(xml);
    expect(sections.map((section) => section.section)).toEqual(["business", "financial"]);
    expect(sections[1]!.text.length).toBeGreaterThan(short.length);
  });
});

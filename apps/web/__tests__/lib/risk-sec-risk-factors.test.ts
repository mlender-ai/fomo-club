import { describe, expect, it } from "vitest";
import {
  INCORPORATED_BY_REFERENCE_REASON,
  extractBusinessSection,
  extractRiskFactorsSection,
} from "../../lib/business-context/sec-filing";

/**
 * WO-SUB-06 §5-2 — Item 1A 추출.
 *
 * 실측으로 확인된 함정을 픽스처로 고정한다(네트워크 없음):
 *  · 목차 줄과 본문에 같은 헤더가 중복 등장 → 짧은 구간을 고르면 안 된다
 *  · 종료 헤더가 발행사마다 1B / 2 / 3 로 다르다
 *  · 소규모 발행사는 Item 1A 자체를 쓰지 않는다(면제) → 실패는 정상 결과
 */

const RISK_BODY = "우리 사업은 다음 위험에 노출되어 있습니다. ".repeat(40); // ≈ 1,000자
const BIZ_BODY = "우리는 반도체 장비를 설계하고 판매합니다. ".repeat(180); // ≈ 4,000자

function doc(parts: string[]): string {
  return parts.join("\n");
}

describe("extractRiskFactorsSection", () => {
  it("표준 순서(1A → 1B)에서 구간을 뽑는다", () => {
    const plain = doc([
      "Item 1. Business",
      BIZ_BODY,
      "Item 1A. Risk Factors",
      RISK_BODY,
      "Item 1B. Unresolved Staff Comments",
      "None.",
    ]);
    const result = extractRiskFactorsSection(plain);
    expect(result.reason).toBeNull();
    expect(result.text).toContain("다음 위험에 노출되어 있습니다");
    expect(result.text).not.toContain("Unresolved Staff Comments");
  });

  it("1B 를 생략하고 Item 2 로 가는 발행사도 뽑는다", () => {
    const plain = doc(["Item 1. Business", BIZ_BODY, "Item 1A. Risk Factors", RISK_BODY, "Item 2. Properties", "본사는 서울."]);
    const result = extractRiskFactorsSection(plain);
    expect(result.reason).toBeNull();
    expect(result.text).not.toContain("Properties");
  });

  it("Item 1·2 합본 발행사는 Item 3 이 종료점이다", () => {
    // Valero 형: "ITEMS 1 AND 2. BUSINESS AND PROPERTIES" — Item 2 헤더가 따로 없다.
    const plain = doc([
      "ITEMS 1 AND 2. BUSINESS AND PROPERTIES",
      BIZ_BODY,
      "Item 1A. Risk Factors",
      RISK_BODY,
      "Item 3. Legal Proceedings",
      "계류 중인 소송 없음.",
    ]);
    const result = extractRiskFactorsSection(plain);
    expect(result.reason).toBeNull();
    expect(result.text).toContain("다음 위험에 노출되어 있습니다");
    expect(result.text).not.toContain("Legal Proceedings");
  });

  it("목차 줄을 고르지 않는다 — 본문 구간이 더 길다", () => {
    const plain = doc([
      "목차",
      "Item 1. Business ... 3",
      "Item 1A. Risk Factors ... 12",
      "Item 1B. Unresolved Staff Comments ... 40",
      "Item 1. Business",
      BIZ_BODY,
      "Item 1A. Risk Factors",
      RISK_BODY,
      "Item 1B. Unresolved Staff Comments",
      "None.",
    ]);
    const result = extractRiskFactorsSection(plain);
    expect(result.reason).toBeNull();
    // 목차 구간(수십 자)이 아니라 본문 구간(≈1,000자)을 골랐다
    expect(result.diagnostics.chosenChars).toBeGreaterThan(900);
    expect(result.text).toContain("다음 위험에 노출되어 있습니다");
  });

  it("Item 1A 가 없는 발행사(면제)는 사유를 남기고 실패한다 — 조용히 빈 값 금지", () => {
    const plain = doc(["Item 1. Business", BIZ_BODY, "Item 1B. Unresolved Staff Comments", "None."]);
    const result = extractRiskFactorsSection(plain);
    expect(result.text).toBeNull();
    expect(result.reason).toContain("Item 1A Risk Factors 헤더 미발견");
  });

  it("종료 헤더가 전부 없으면 문서 전체를 반환하지 않는다", () => {
    const plain = doc(["Item 1A. Risk Factors", RISK_BODY]);
    const result = extractRiskFactorsSection(plain);
    expect(result.text).toBeNull();
    expect(result.reason).toContain("Item 1B/2/3");
  });
});

describe("extractBusinessSection 회귀 — 일반화 리팩터로 동작이 바뀌지 않았다", () => {
  it("사업 섹션을 그대로 뽑는다", () => {
    const plain = doc(["Item 1. Business", BIZ_BODY, "Item 1A. Risk Factors", RISK_BODY]);
    const result = extractBusinessSection(plain);
    expect(result.reason).toBeNull();
    expect(result.text).toContain("반도체 장비를 설계하고");
    expect(result.text).not.toContain("다음 위험에 노출");
  });

  it("사업 섹션 하한(3,000자)은 유지된다 — 목차 줄이 통과하지 않는다", () => {
    const plain = doc(["Item 1. Business ... 3", "Item 1A. Risk Factors ... 12"]);
    expect(extractBusinessSection(plain).text).toBeNull();
  });
});

describe("참조 편입 탐지 (실측: USB 10-K)", () => {
  // USB 10-K 2026-02-23 제출본의 Item 1A 본문 그대로.
  const USB_1A =
    "Item 1A . Risk Factors \n Information in response to this Item 1A can be found in the 2025 Annual Report on pages 135 to 150 under the heading Risk Factors. That information is incorporated into this report by reference. \n \n Item 1B. Unresolved Staff Comments";

  it("안내문을 위험요소로 오인하지 않는다", () => {
    const result = extractRiskFactorsSection(USB_1A);
    expect(result.text).toBeNull();
    expect(result.reason).toBe(INCORPORATED_BY_REFERENCE_REASON);
  });

  it("안내문이 하한을 넘겨도 걸러진다 — 길이에 기대지 않는다", () => {
    const padded = USB_1A.replace(
      "by reference.",
      "by reference. " + "추가 안내 문구가 길게 이어집니다. ".repeat(30)
    );
    const result = extractRiskFactorsSection(padded);
    expect(result.text).toBeNull();
    expect(result.reason).toBe(INCORPORATED_BY_REFERENCE_REASON);
  });

  it("실제 위험요소 본문 안의 상호참조 문구는 걸러내지 않는다", () => {
    const body = doc([
      "Item 1A. Risk Factors",
      RISK_BODY,
      "자세한 내용은 incorporated herein by reference 로 표기된 부속명세서를 참조하십시오.",
      RISK_BODY,
      "Item 1B. Unresolved Staff Comments",
    ]);
    const result = extractRiskFactorsSection(body);
    expect(result.reason).toBeNull();
    expect(result.text).toContain("다음 위험에 노출되어 있습니다");
  });
});

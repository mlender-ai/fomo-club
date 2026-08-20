import { describe, expect, it } from "vitest";
import { INDUSTRY_KO, sectorFromIndustry } from "../../lib/quiet-pick";

/**
 * 섹터 매핑 감시 (DS-05 §4).
 *
 * **섹터가 틀리면 나머지 전부를 못 믿는다** — 사용자가 "AI가 지어낸 얘기 같다"고 느끼는 직접
 * 원인이다. 실측에서 나온 오분류를 케이스로 고정하고, 규칙의 **순서**를 못 박는다.
 */

describe("실측 오분류 재발 방지", () => {
  it("`Rubber & Plastics Footwear` 는 화학이 아니라 의류·섬유다 (On Holding)", () => {
    expect(sectorFromIndustry("Rubber & Plastics Footwear")).toBe("의류·섬유");
  });

  it("신발·의류가 화학보다 앞에 있다 — 순서가 규칙이다", () => {
    const apparel = INDUSTRY_KO.findIndex(([, ko]) => ko === "의류·섬유");
    const chemical = INDUSTRY_KO.findIndex(([, ko]) => ko === "화학");
    expect(apparel).toBeGreaterThanOrEqual(0);
    expect(apparel).toBeLessThan(chemical);
  });
});

describe("소스가 없으면 섹터를 만들지 않는다", () => {
  it("매핑이 없는 산업명은 undefined — `기타 업종` 같은 폴백을 만들지 않는다", () => {
    expect(sectorFromIndustry("Unclassifiable Establishments")).toBeUndefined();
    expect(sectorFromIndustry("")).toBeUndefined();
    expect(sectorFromIndustry(undefined)).toBeUndefined();
  });
});

describe("대표 분류가 유지된다", () => {
  it.each([
    ["State Commercial Banks", "은행"],
    ["Semiconductors & Related Devices", "반도체"],
    ["Pharmaceutical Preparations", "바이오·제약"],
    ["Crude Petroleum & Natural Gas", "에너지"],
    ["Ordnance & Accessories", "방산"],
    ["Motor Vehicle Parts & Accessories", "자동차"],
    ["Real Estate Investment Trusts", "부동산"],
    ["Services-Motion Picture & Video Tape Production", "미디어·레저"],
  ])("%s → %s", (industry, sector) => {
    expect(sectorFromIndustry(industry)).toBe(sector);
  });
});

describe("섹터 라벨 자체가 테마가 아니다", () => {
  it("매핑 결과에 자산군·거시 라벨이 없다", () => {
    const banned = ["코인", "환율", "금리", "유가", "비트코인", "지수"];
    for (const [, ko] of INDUSTRY_KO) {
      for (const label of banned) expect(ko.includes(label), `${ko}`).toBe(false);
    }
  });
});

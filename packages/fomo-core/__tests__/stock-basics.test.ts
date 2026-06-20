import { describe, expect, it } from "vitest";
import {
  parseNaverStockBasic,
  parseNaverTotalInfos,
  parseNaverFinanceAnnual,
  assembleStockBasics,
  formatEok,
} from "../src";

describe("formatEok — 억원 → 친구 단위(조/억)", () => {
  it("조 단위 변환", () => {
    expect(formatEok("3,336,059")).toBe("333.6조"); // 삼성 매출 ≈ 333조
    expect(formatEok("436,011")).toBe("43.6조");
  });
  it("억 단위 유지", () => {
    expect(formatEok("4,360")).toBe("4,360억");
  });
  it("음수·결측 안전", () => {
    expect(formatEok("-1,200")).toBe("-1,200억");
    expect(formatEok("N/A")).toBeNull();
  });
});

describe("parseNaverStockBasic — 주가·등락(객관 사실)", () => {
  it("현재가·등락·시장·방향", () => {
    const r = parseNaverStockBasic({
      stockName: "삼성전자",
      stockExchangeName: "코스피",
      closePrice: "362,500",
      fluctuationsRatio: "0.55",
      compareToPreviousClosePrice: "2,000",
    });
    expect(r.priceText).toBe("362,500원");
    expect(r.changeText).toContain("2,000");
    expect(r.changeText).toContain("0.55%");
    expect(r.changeDir).toBe("up");
    expect(r.market).toBe("코스피");
  });
  it("하락 방향", () => {
    expect(parseNaverStockBasic({ closePrice: "100", fluctuationsRatio: "-1.2", compareToPreviousClosePrice: "-5" }).changeDir).toBe("down");
  });
});

describe("parseNaverTotalInfos — 시총·핵심지표(쉬운 라벨 + 정확 값 + 보조 용어)", () => {
  const json = {
    totalInfos: [
      { key: "시총", value: "2,069조 5,826억" },
      { key: "PER", value: "28.61배" },
      { key: "EPS", value: "12,372원" },
      { key: "PBR", value: "4.92배" },
      { key: "52주 최고", value: "380,000" },
      { key: "외인소진율", value: "47.62%" },
    ],
  };
  it("시총 추출", () => {
    expect(parseNaverTotalInfos(json).marketCap).toBe("2,069조 5,826억");
  });
  it("PER/EPS 는 쉬운 라벨 + 정확 값 + 보조 용어(term)", () => {
    const m = parseNaverTotalInfos(json).metrics;
    const per = m.find((x) => x.term === "PER");
    const eps = m.find((x) => x.term === "EPS");
    expect(per?.value).toBe("28.61배");
    expect(eps?.label).toContain("번 돈"); // 쉬운 라벨
    expect(eps?.value).toBe("12,372원"); // 정확 값
  });
  it("없는 지표는 채우지 않음(가짜 금지)", () => {
    const m = parseNaverTotalInfos({ totalInfos: [{ key: "PER", value: "-" }] }).metrics;
    expect(m.find((x) => x.term === "PER")).toBeUndefined(); // "-" 는 제외
  });
});

describe("parseNaverFinanceAnnual — 연간 재무(추정치 구분, 결측 미채움)", () => {
  const json = {
    corporationSummary: "반도체와 디스플레이를 만드는 회사.",
    financeInfo: {
      trTitleList: [
        { title: "2024.12.", key: "202412", isConsensus: "N" },
        { title: "2025.12.", key: "202512", isConsensus: "N" },
        { title: "2026.12.", key: "202612", isConsensus: "Y" },
      ],
      rowList: [
        { title: "매출액", columns: { "202412": { value: "3,008,709" }, "202512": { value: "3,336,059" }, "202612": { value: "7,004,880" } } },
        { title: "영업이익", columns: { "202412": { value: "327,259" }, "202512": { value: "436,011" }, "202612": { value: "3,631,658" } } },
      ],
    },
  };
  it("회사개요 + 매출/영업이익 행 + 친구단위 변환", () => {
    const r = parseNaverFinanceAnnual(json);
    expect(r.summary).toContain("반도체");
    expect(r.financials?.rows.find((x) => x.label.includes("매출"))?.values[1]).toBe("333.6조");
  });
  it("추정 기간은 estimate=true", () => {
    const r = parseNaverFinanceAnnual(json);
    expect(r.financials?.periods[2]).toMatchObject({ title: "2026.12", estimate: true });
    expect(r.financials?.periods[0].estimate).toBe(false);
  });
  it("재무 없으면 financials 생략(빈 객체에도 안전)", () => {
    expect(parseNaverFinanceAnnual({}).financials).toBeUndefined();
  });
  it("회사개요 dict(comment1/2/3) 형태도 합쳐서 추출", () => {
    const r = parseNaverFinanceAnnual({
      corporationSummary: { comment1: "1969년 설립된 전자 기업.", comment2: "메모리·파운드리 사업.", comment3: "" },
    });
    expect(r.summary).toBe("1969년 설립된 전자 기업. 메모리·파운드리 사업.");
  });
});

describe("assembleStockBasics — 기본 정보는 항상(원문 무관), name 최소 보장", () => {
  it("세 소스 합치고, 비어도 name + metrics 배열은 보장(빈 화면 박멸)", () => {
    const b = assembleStockBasics("저스템", {}, {}, {});
    expect(b.name).toBe("저스템");
    expect(Array.isArray(b.metrics)).toBe(true); // 항상 배열(없으면 빈 배열)
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

describe("SEC EDGAR Form 4 insider purchases", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("surfaces only significant Form 4 open-market purchases", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "fomo-test contact@example.com");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("data.sec.gov/submissions")) {
        return Response.json({
          filings: {
            recent: {
              form: ["4", "8-K"],
              filingDate: ["2026-06-16", "2026-06-15"],
              primaryDocument: ["ownership.xml", "form8k.htm"],
              accessionNumber: ["0001045810-26-000123", "0001045810-26-000122"],
            },
          },
        });
      }
      if (url.includes("ownership.xml")) {
        return new Response(
          `<?xml version="1.0"?>
          <ownershipDocument>
            <reportingOwner>
              <reportingOwnerId><rptOwnerName>Jane Huang</rptOwnerName></reportingOwnerId>
              <reportingOwnerRelationship>
                <isDirector>1</isDirector>
                <isOfficer>1</isOfficer>
                <officerTitle>CEO</officerTitle>
              </reportingOwnerRelationship>
            </reportingOwner>
            <nonDerivativeTable>
              <nonDerivativeTransaction>
                <transactionDate><value>2026-06-15</value></transactionDate>
                <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
                <transactionAmounts>
                  <transactionShares><value>210000</value></transactionShares>
                  <transactionPricePerShare><value>33.50</value></transactionPricePerShare>
                </transactionAmounts>
              </nonDerivativeTransaction>
            </nonDerivativeTable>
          </ownershipDocument>`,
          { headers: { "content-type": "application/xml" } },
        );
      }
      return Response.json({});
    });

    const { fetchRecentSecFilings } = await import("../../lib/sec-edgar");
    const hits = await fetchRecentSecFilings("NVDA", 2);

    expect(hits[0]?.source).toBe("SEC Form 4");
    expect(hits[0]?.label).toBe("CEO Jane Huang이 $7.0M 규모 자사주 매수 · 6/15");
    expect(hits[0]?.insiderPurchase).toMatchObject({
      ownerName: "Jane Huang",
      ownerRole: "CEO",
      shares: 210000,
      price: 33.5,
      transactionDate: "2026-06-15",
    });
  });

  // 2026-07-15 User Zero: "IBM 실적 부진 8-K가 왜 그냥 '공시 확인'이냐" — Item 코드로 실제 사유 표시.
  it("8-K의 items 필드(2.02=실적 발표)를 한국어 사유로 반영한다", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "fomo-test contact@example.com");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("data.sec.gov/submissions")) {
        return Response.json({
          filings: {
            recent: {
              form: ["8-K"],
              filingDate: ["2026-07-14"],
              primaryDocument: ["form8k.htm"],
              accessionNumber: ["0001045810-26-000200"],
              items: ["2.02,9.01"],
            },
          },
        });
      }
      return Response.json({});
    });

    const { fetchRecentSecFilings } = await import("../../lib/sec-edgar");
    const hits = await fetchRecentSecFilings("IBM", 2);
    expect(hits[0]?.label).toBe("실적 발표 8-K 공시 · 7/14");
    // 브리핑 detail 경로(safeWhy→hasForbiddenCopy)에서 폐기되지 않아야 한다 —
    // "공시가 확인됐어요" 시절 라벨이 추상 슬롭 블록리스트에 걸려 IBM '왜'가 통째로 사라졌던 회귀 방지.
    const { hasForbiddenCopy } = await import("../../lib/copy-guards");
    expect(hasForbiddenCopy(hits[0]!.label)).toBe(false);
  });

  it("items 필드가 없거나 매핑되지 않은 코드면 기존 일반 문구로 폴백한다", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "fomo-test contact@example.com");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("data.sec.gov/submissions")) {
        return Response.json({
          filings: {
            recent: {
              form: ["8-K"],
              filingDate: ["2026-07-14"],
              primaryDocument: ["form8k.htm"],
              accessionNumber: ["0001045810-26-000201"],
            },
          },
        });
      }
      return Response.json({});
    });

    const { fetchRecentSecFilings } = await import("../../lib/sec-edgar");
    const hits = await fetchRecentSecFilings("IBM", 2);
    expect(hits[0]?.label).toBe("8-K 공시 제출 · 7/14");
    const { hasForbiddenCopy } = await import("../../lib/copy-guards");
    expect(hasForbiddenCopy(hits[0]!.label)).toBe(false);
  });
});

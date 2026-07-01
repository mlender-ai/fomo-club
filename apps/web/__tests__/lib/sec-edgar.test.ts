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
});

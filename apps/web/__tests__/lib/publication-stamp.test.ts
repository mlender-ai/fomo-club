import { beforeEach, describe, expect, it, vi } from "vitest";
import { RULESET_VERSION, type FactSheet } from "@fomo/core";

/**
 * 발행 시점 스탬프 (WO-SUB-07 [F]).
 *
 * 이 테스트가 지키는 것은 **"결측을 값으로 채우지 않는다"** 와
 * **"확보하지 못함과 없음의 구분"** 두 개다(배치 공통 양보 불가 항목).
 * `earnings_date: null` 하나만 쓰면 나중에 읽는 쪽이 "어닝이 없다" 로 오독한다.
 */

const { readFactSheet, readWeeklyCalendar } = vi.hoisted(() => ({
  readFactSheet: vi.fn(),
  readWeeklyCalendar: vi.fn(),
}));

vi.mock("../../lib/fundamentals/repository", () => ({ readFactSheet }));
vi.mock("../../lib/earnings-calendar", () => ({ readWeeklyCalendar }));

import {
  buildPublicationStamp,
  buildQuietPickStamps,
  loadEarningsIndex,
  PUBLICATION_STAMP_VERSION,
} from "../../lib/publication-stamp";

function factsheet(overrides: Partial<FactSheet> = {}): FactSheet {
  return {
    symbol: "AAA",
    market: "US",
    currency: "USD",
    snapshot_at: "2026-08-06T00:00:00.000Z",
    display_name: "AAA Corp",
    canonical: "AAA Corp",
    fiscal: {
      ttm: { revenue: 1_000_000_000, operating_income: 100_000_000, net_income: 80_000_000, eps: 2 },
      quarters: [],
      annual: [],
      coverage_flag: "full",
    },
    growth: { revenue_yoy: 4, revenue_cagr_3y: 3, operating_income_yoy: null, eps_yoy: null },
    margin: { operating_margin_ttm: 10, operating_stdev_8q: null, operating_stdev_annual: 1.2, operating_stdev_annual_years: 5 },
    valuation: { per_ttm: 15, per_forward: null, pbr: 2, psr_ttm: null, dividend_yield: null, ev_ebitda: null },
    balance: { equity: 1_000, debt: 100, net_cash: 50, equity_quarters: [] },
    cashflow: { operating_cf_ttm: null, capex_ttm: null, fcf_ttm: null, composed_of: [], observed_quarters: 0, coverage_flag: "none" },
    market_data: { market_cap: 10_000_000_000, shares_outstanding: null, price: 100, price_as_of: "2026-08-06" },
    consensus: { available: false, revenue_fy1: null, revenue_fy2: null, revenue_fy3: null, eps_fy1: null, eps_fy2: null, source: null, as_of: null, analyst_count: null, periods: [] },
    classification: { scheme: "nasdaq_industry", sector: "Technology", industry: "Computer Software: Prepackaged Software", source: "nasdaq", as_of: "2026-08-06" },
    missing_fields: [],
    field_sources: {},
    source_manifest: {},
    ...overrides,
  } as FactSheet;
}

const facts = { reference_price: 100, reference_price_as_of: "2026-08-06T01:00:00.000Z" };

beforeEach(() => {
  readFactSheet.mockReset();
  readWeeklyCalendar.mockReset();
  readWeeklyCalendar.mockResolvedValue(null);
});

describe("발행 시점 스탬프", () => {
  it("팩트시트가 있으면 아키타입·해시·룰셋 버전을 발행 시점에 고정한다", async () => {
    readFactSheet.mockResolvedValue({ factsheet: factsheet(), factsheet_hash: "hash-abc" });

    const stamp = await buildPublicationStamp({ market: "US", canonical: "AAA Corp", symbol: "AAA" }, facts, await loadEarningsIndex());

    expect(stamp.stamp_version).toBe(PUBLICATION_STAMP_VERSION);
    expect(stamp.ruleset_version).toBe(RULESET_VERSION);
    expect(stamp.factsheet_hash).toBe("hash-abc");
    expect(stamp.factsheet_as_of).toBe("2026-08-06T00:00:00.000Z");
    expect(stamp.archetype).not.toBeNull();
    expect(stamp.missing).not.toContain("factsheet_hash");
  });

  it("팩트시트가 없으면 해시·아키타입을 미확보로 등재한다 — 값을 만들지 않는다", async () => {
    readFactSheet.mockResolvedValue(null);

    const stamp = await buildPublicationStamp({ market: "KR", canonical: "없는회사" }, facts, await loadEarningsIndex());

    expect(stamp.factsheet_hash).toBeNull();
    expect(stamp.archetype).toBeNull();
    expect(stamp.missing).toContain("factsheet_hash");
    expect(stamp.missing).toContain("archetype");
  });

  it("KR 은 어닝일 사전 공표 소스가 없다는 사실을 상태로 남긴다", async () => {
    readFactSheet.mockResolvedValue(null);

    const stamp = await buildPublicationStamp({ market: "KR", canonical: "빅텍", country: "KR" }, facts, await loadEarningsIndex());

    expect(stamp.earnings_date).toBeNull();
    expect(stamp.earnings_date_status).toBe("no_source_kr");
  });

  it("캘린더를 못 읽은 것과 7일 창 밖인 것을 구분한다", async () => {
    readFactSheet.mockResolvedValue(null);

    const unavailable = await buildPublicationStamp({ market: "US", canonical: "AAA Corp", symbol: "AAA" }, facts, await loadEarningsIndex());
    expect(unavailable.earnings_date_status).toBe("calendar_unavailable");

    readWeeklyCalendar.mockResolvedValue({
      asOf: "2026-08-06",
      days: [{ date: "2026-08-10", events: [{ kind: "earnings", title: "어닝", stocks: [{ canonical: "BBB Corp", symbol: "BBB" }] }] }],
    });
    const outside = await buildPublicationStamp({ market: "US", canonical: "AAA Corp", symbol: "AAA" }, facts, await loadEarningsIndex());
    expect(outside.earnings_date_status).toBe("outside_window");
    expect(outside.missing).toContain("earnings_date");
  });

  it("캘린더에 있으면 발표일을 잡는다 — 같은 심볼이 여러 날이면 가장 이른 날", async () => {
    readFactSheet.mockResolvedValue(null);
    readWeeklyCalendar.mockResolvedValue({
      asOf: "2026-08-06",
      days: [
        { date: "2026-08-08", events: [{ kind: "earnings", title: "어닝", stocks: [{ canonical: "AAA Corp", symbol: "aaa" }] }] },
        { date: "2026-08-11", events: [{ kind: "earnings", title: "어닝", stocks: [{ canonical: "AAA Corp", symbol: "AAA" }] }] },
      ],
    });

    const stamp = await buildPublicationStamp({ market: "US", canonical: "AAA Corp", symbol: "AAA" }, facts, await loadEarningsIndex());

    expect(stamp.earnings_date).toBe("2026-08-08");
    expect(stamp.earnings_date_status).toBe("found");
    expect(stamp.missing).not.toContain("earnings_date");
  });

  it("사업 무효 조건은 06 미착수를 상태로 밝힌다 — 빈 문자열로 채우지 않는다", async () => {
    readFactSheet.mockResolvedValue(null);

    const stamp = await buildPublicationStamp({ market: "US", canonical: "AAA Corp" }, facts, await loadEarningsIndex());

    expect(stamp.invalidation_business).toBeNull();
    expect(stamp.invalidation_business_status).toBe("pending_wo_sub_06");
    expect(stamp.missing).toContain("invalidation_business");
  });

  it("가격 무효선이 있으면 기록하고, 없으면 미확보로 등재한다", async () => {
    readFactSheet.mockResolvedValue(null);

    const withLevel = await buildPublicationStamp(
      { market: "US", canonical: "AAA Corp" },
      { ...facts, invalidation_price: 88.5, invalidation_text: "88.5 아래면 이 판단은 틀렸다" },
      await loadEarningsIndex()
    );
    expect(withLevel.invalidation_price).toBe(88.5);
    expect(withLevel.missing).not.toContain("invalidation_price");

    const without = await buildPublicationStamp({ market: "US", canonical: "AAA Corp" }, facts, await loadEarningsIndex());
    expect(without.invalidation_price).toBeNull();
    expect(without.missing).toContain("invalidation_price");
  });

  it("덱 단위 조립은 한 종목이 실패해도 나머지를 남긴다", async () => {
    readFactSheet.mockImplementation(async (_market: string, canonical: string) => {
      if (canonical === "터지는회사") throw new Error("store down");
      return { factsheet: factsheet(), factsheet_hash: "hash-ok" };
    });

    const stamps = await buildQuietPickStamps({
      asOf: "2026-08-06T01:00:00.000Z",
      picks: [
        { subject: { canonical: "터지는회사", market: "KR", country: "KR" }, price: { current: 1000 } },
        { subject: { canonical: "정상회사", market: "KR", country: "KR" }, price: { current: 2000 }, invalidation: { level: 1800, text: "1800 이탈" } },
      ],
    });

    // `readFactSheet` 실패는 스탬프 안에서 미확보로 흡수된다 — 행 자체는 남는다.
    expect(stamps.size).toBe(2);
    expect(stamps.get("터지는회사")?.factsheet_hash).toBeNull();
    expect(stamps.get("정상회사")?.invalidation_price).toBe(1800);
    expect(stamps.get("정상회사")?.reference_price).toBe(2000);
  });
});

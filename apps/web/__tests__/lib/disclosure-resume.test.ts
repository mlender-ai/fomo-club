/**
 * WO-RESET-02 A-3 — 잘린 수집이 **이어받아야** 한다.
 *
 * 첫 실행 실측(2026-08-25): `days=90` 요청 → 예산에 잘려 20일만 훑고 `truncated: true`.
 * 그때 종전 구현은 다시 돌려도 **같은 최근 20일을 또 훑어** 더 과거로 영영 못 갔다.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// 네트워크를 타지 않는다 — 어떤 날짜를 훑으려 했는지만 본다.
const requested: string[] = [];
vi.stubGlobal("fetch", async (input: string | URL) => {
  const url = new URL(String(input));
  const bgn = url.searchParams.get("bgn_de");
  if (bgn) requested.push(`${bgn.slice(0, 4)}-${bgn.slice(4, 6)}-${bgn.slice(6, 8)}`);
  return new Response(JSON.stringify({ status: "013", list: [] }), { status: 200 });
});

import { collectDisclosures } from "../../lib/disclosure-collect";

describe("collectDisclosures — 이어받기", () => {
  beforeEach(() => {
    requested.length = 0;
    process.env.DART_API_KEY = "test-key";
    delete process.env.DISCOVERY_DART_LIVE;
  });
  afterEach(() => {
    delete process.env.DART_API_KEY;
  });

  it("덮은 구간이 없으면 오늘부터 거슬러 올라간다", async () => {
    await collectDisclosures({ today: "2026-08-25", lookbackDays: 4 });
    expect(requested).toEqual(["2026-08-25", "2026-08-24", "2026-08-23", "2026-08-22"]);
  });

  it("잘린 수집을 이어받는다 — 최근 며칠 + `coveredFrom` 앞부터 과거로", async () => {
    await collectDisclosures({
      today: "2026-08-25",
      lookbackDays: 5,
      // `coveredUniverse` 를 크게 둬 **유니버스가 안 커졌다**는 전제를 못 박는다 —
      // 커졌으면 과거를 다시 훑는 것이 맞고, 그건 아래 별도 케이스가 본다.
      previous: { asOf: "", coveredFrom: "2026-08-20", coveredUniverse: 9_999, byStock: {}, truncated: true, errors: [] },
    });
    // 최근 2일은 새 공시 때문에 다시 본다. 그 다음은 08-20 **앞**부터다 — 같은 구간을 또 훑지 않는다.
    expect(requested).toEqual(["2026-08-25", "2026-08-24", "2026-08-19", "2026-08-18", "2026-08-17"]);
  });

  it("90일 창 밖으로는 내려가지 않는다", async () => {
    await collectDisclosures({
      today: "2026-08-25",
      lookbackDays: 90,
      previous: { asOf: "", coveredFrom: "2026-05-29", coveredUniverse: 9_999, byStock: {}, truncated: true, errors: [] },
    });
    const oldest = requested.at(-1)!;
    expect(oldest >= "2026-05-27").toBe(true);
  });

  it("커버리지는 뒤로만 늘어난다 — 이어받아도 앞서 덮은 구간을 잃지 않는다", async () => {
    const out = await collectDisclosures({
      today: "2026-08-25",
      lookbackDays: 5,
      // `coveredUniverse` 를 크게 둬 **유니버스가 안 커졌다**는 전제를 못 박는다 —
      // 커졌으면 과거를 다시 훑는 것이 맞고, 그건 아래 별도 케이스가 본다.
      previous: { asOf: "", coveredFrom: "2026-08-20", coveredUniverse: 9_999, byStock: {}, truncated: true, errors: [] },
    });
    expect(out.coveredFrom <= "2026-08-20").toBe(true);
  });
});

describe("유니버스가 커지면 과거를 다시 훑는다 (2026-08-27)", () => {
  beforeEach(() => {
    requested.length = 0;
    process.env.DART_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.DART_API_KEY;
  });

  it("종전 커버리지가 좁은 유니버스로 만들어졌으면 이어받지 않는다", async () => {
    await collectDisclosures({
      today: "2026-08-25",
      lookbackDays: 4,
      // 5종목으로 훑어둔 커버리지 — 지금 유니버스(사전 기본)는 그보다 훨씬 크다.
      previous: { asOf: "", coveredFrom: "2026-08-20", coveredUniverse: 5, byStock: {}, truncated: true, errors: [] },
    });
    // 08-20 앞으로 건너뛰지 않고 **오늘부터** 다시 본다 — 그 날들에 새 종목이 걸린다.
    expect(requested).toEqual(["2026-08-25", "2026-08-24", "2026-08-23", "2026-08-22"]);
  });

  it("커졌으면 `coveredFrom` 도 물려받지 않는다 — 안 본 과거를 봤다고 하면 거짓말이다", async () => {
    const out = await collectDisclosures({
      today: "2026-08-25",
      lookbackDays: 3,
      previous: { asOf: "", coveredFrom: "2026-05-29", coveredUniverse: 5, byStock: {}, truncated: false, errors: [] },
    });
    expect(out.coveredFrom).toBe("2026-08-23");
    expect(out.coveredFrom).not.toBe("2026-05-29");
  });

  it("훑은 유니버스 크기를 남긴다 — 다음 실행이 이걸 보고 판단한다", async () => {
    const out = await collectDisclosures({ today: "2026-08-25", lookbackDays: 2 });
    expect(out.coveredUniverse).toBeGreaterThan(0);
  });
});

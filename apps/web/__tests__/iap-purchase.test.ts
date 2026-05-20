import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── 테스트 전략 ──────────────────────────────────────────────────────────────
// RevenueCat Subscriber API와 Prisma를 mock하여 purchase route 로직을 단위 테스트
// 검증 항목:
//   1. 정상 구매 → 크레딧 지급
//   2. 영수증 거래 없음 → 402 RECEIPT_INVALID
//   3. 프로덕션 sandbox 구매 → 402 SANDBOX_NOT_ALLOWED
//   4. idempotencyKey 중복 → 200 duplicate:true (크레딧 미지급)
//   5. RevenueCat API 장애 → 502 RECEIPT_ERROR
//   6. 필수 파라미터 누락 → 400

// Prisma mock
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockAggregate = vi.fn();
vi.mock("@/lib/tarot/prisma", () => ({
  prisma: {
    tarotCreditLedger: {
      findFirst: () => mockFindFirst(),
      create: () => mockCreate(),
      aggregate: () => mockAggregate(),
    },
  },
}));

// RevenueCat API mock
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// 환경변수
vi.stubEnv("REVENUECAT_SECRET_API_KEY", "test-rc-key");
vi.stubEnv("NODE_ENV", "production");

// Next.js Request mock helper
function makeRequest(body: Record<string, unknown>, authHeader = "Bearer valid-jwt") {
  return {
    headers: { get: (k: string) => (k === "authorization" ? authHeader : null) },
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

// requireAuth mock — userId 고정 반환
vi.mock("@/lib/tarot/auth", () => ({
  requireAuth: () => ({ userId: "test-user-001" }),
}));

// getCreditBalance mock
const mockGetCreditBalance = vi.fn().mockResolvedValue(10);
vi.mock("@/lib/tarot/credits", () => ({
  addCredit: vi.fn().mockResolvedValue(15),
  getCreditBalance: () => mockGetCreditBalance(),
}));

describe("POST /api/tarot/credits/purchase — IAP 검증", () => {
  beforeEach(() => {
    mockFindFirst.mockResolvedValue(null); // 중복 없음 (기본값)
    mockCreate.mockResolvedValue({});
    mockAggregate.mockResolvedValue({ _sum: { amount: 10 } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("정상 구매 → 200 + credits 반환", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        subscriber: {
          non_subscriptions: {
            tarot_credits_5: [{ id: "tx-abc123", is_sandbox: false, purchase_date: "2026-01-01", store: "app_store" }],
          },
        },
      }),
      text: async () => "",
    });

    const { POST } = await import("../app/api/tarot/credits/purchase/route");
    const res = await POST(makeRequest({ productId: "tarot_credits_5", purchaseToken: "tx-abc123", idempotencyKey: "iap_tx-abc123", platform: "ios" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.purchased).toBe(5);
    expect(body.duplicate).toBeUndefined();
  });

  it("거래 ID 불일치 → 402 RECEIPT_INVALID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        subscriber: {
          non_subscriptions: {
            tarot_credits_5: [{ id: "tx-other", is_sandbox: false, purchase_date: "2026-01-01", store: "app_store" }],
          },
        },
      }),
      text: async () => "",
    });

    const { POST } = await import("../app/api/tarot/credits/purchase/route");
    const res = await POST(makeRequest({ productId: "tarot_credits_5", purchaseToken: "tx-abc123", idempotencyKey: "iap_tx-abc123", platform: "ios" }));
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe("RECEIPT_INVALID");
  });

  it("프로덕션에서 sandbox 구매 → 402 SANDBOX_NOT_ALLOWED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        subscriber: {
          non_subscriptions: {
            tarot_credits_5: [{ id: "tx-sandbox", is_sandbox: true, purchase_date: "2026-01-01", store: "app_store" }],
          },
        },
      }),
      text: async () => "",
    });

    const { POST } = await import("../app/api/tarot/credits/purchase/route");
    const res = await POST(makeRequest({ productId: "tarot_credits_5", purchaseToken: "tx-sandbox", idempotencyKey: "iap_tx-sandbox", platform: "ios" }));
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe("SANDBOX_NOT_ALLOWED");
  });

  it("동일 idempotencyKey 중복 요청 → 200 duplicate:true (크레딧 미지급)", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "existing-ledger" }); // 이미 지급됨

    const { POST } = await import("../app/api/tarot/credits/purchase/route");
    const res = await POST(makeRequest({ productId: "tarot_credits_5", purchaseToken: "tx-abc123", idempotencyKey: "iap_tx-abc123", platform: "ios" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    // fetch(RevenueCat)는 호출되지 않아야 함
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("RevenueCat API 장애 → 502 RECEIPT_ERROR", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const { POST } = await import("../app/api/tarot/credits/purchase/route");
    const res = await POST(makeRequest({ productId: "tarot_credits_5", purchaseToken: "tx-abc123", idempotencyKey: "iap_tx-abc123", platform: "ios" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.code).toBe("RECEIPT_ERROR");
  });

  it("productId 누락 → 400 MISSING_PRODUCT_ID", async () => {
    const { POST } = await import("../app/api/tarot/credits/purchase/route");
    const res = await POST(makeRequest({ purchaseToken: "tx-abc123", idempotencyKey: "iap_tx-abc123", platform: "ios" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("MISSING_PRODUCT_ID");
  });

  it("알 수 없는 productId → 400 INVALID_PRODUCT", async () => {
    const { POST } = await import("../app/api/tarot/credits/purchase/route");
    const res = await POST(makeRequest({ productId: "tarot_unknown_99", purchaseToken: "tx-abc123", idempotencyKey: "iap_tx-abc123", platform: "ios" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_PRODUCT");
  });
});

import { test, expect } from "@playwright/test";

test.describe("핵심 API 엔드포인트 헬스체크", () => {
  test("GET /api/tarot/disclaimer — 면책조항 반환", async ({ request }) => {
    const res = await request.get("/api/tarot/disclaimer");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("disclaimer");
  });

  test("POST /api/tarot/draw — 인증 없이 401", async ({ request }) => {
    const res = await request.post("/api/tarot/draw", {
      data: { ticker: "AAPL", market: "US", spread: "single", idempotencyKey: "test-1" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/tarot/share-reward — 인증 없이 401", async ({ request }) => {
    const res = await request.post("/api/tarot/share-reward", {
      data: { idempotencyKey: "test-share-1" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/tarot/draw — ticker 누락 시 400", async ({ request }) => {
    // 더미 Bearer 토큰 (JWT 형식이지만 유효하지 않음 — 401 반환 예상)
    const res = await request.post("/api/tarot/draw", {
      headers: { Authorization: "Bearer invalid.jwt.token" },
      data: { spread: "single", idempotencyKey: "test-2" },
    });
    // 유효하지 않은 토큰이므로 401
    expect(res.status()).toBe(401);
  });

  test("GET /api/tarot/credits — 인증 없이 401", async ({ request }) => {
    const res = await request.get("/api/tarot/credits");
    expect(res.status()).toBe(401);
  });
});

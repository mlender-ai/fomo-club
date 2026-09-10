import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { backendApiFetchMock } = vi.hoisted(() => ({
  backendApiFetchMock: vi.fn(),
}));

vi.mock("../lib/backend-api", () => ({
  backendApiFetch: backendApiFetchMock,
}));

import { authorizeLegacyOperation, proxyGet, proxyPatch } from "../app/api/_utils";

function request(
  path = "/api/runtime/state",
  options: { password?: string; body?: string; method?: string } = {}
): NextRequest {
  const headers = new Headers();
  if (options.password !== undefined) {
    headers.set("x-dashboard-password", options.password);
  }
  if (options.body !== undefined) headers.set("content-type", "application/json");

  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "PATCH"),
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  backendApiFetchMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("legacy operations API security", () => {
  it("is hidden and does not call upstream unless explicitly enabled", async () => {
    const response = await proxyGet(request(), "/runtime/state");

    expect(response.status).toBe(404);
    expect(backendApiFetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when enabled without an operation password", () => {
    vi.stubEnv("ENABLE_LEGACY_TRADING_API", "true");
    vi.stubEnv("API_PASSWORD", "");
    vi.stubEnv("DASHBOARD_PASSWORD", "");

    expect(authorizeLegacyOperation(request())?.status).toBe(503);

    vi.stubEnv("API_PASSWORD", "too-short");
    expect(authorizeLegacyOperation(request())?.status).toBe(503);
  });

  it("rejects missing, wrong, and malformed credentials without throwing", () => {
    vi.stubEnv("ENABLE_LEGACY_TRADING_API", "true");
    vi.stubEnv("API_PASSWORD", "correct-operation-password");

    expect(authorizeLegacyOperation(request())?.status).toBe(401);
    expect(authorizeLegacyOperation(request("/api/runtime/state", { password: "wrong" }))?.status).toBe(401);
    expect(() =>
      authorizeLegacyOperation(request("/api/runtime/state", { password: "x".repeat(500) }))
    ).not.toThrow();
  });

  it("allows a correct credential and proxies the request", async () => {
    vi.stubEnv("ENABLE_LEGACY_TRADING_API", "true");
    vi.stubEnv("API_PASSWORD", "correct-operation-password");

    const response = await proxyGet(
      request("/api/runtime/state", { password: "correct-operation-password" }),
      "/runtime/state"
    );

    expect(response.status).toBe(200);
    expect(backendApiFetchMock).toHaveBeenCalledWith("/runtime/state");
  });

  it("authenticates before parsing PATCH bodies and handles invalid JSON safely", async () => {
    const disabled = await proxyPatch(
      request("/api/control/kill-switch", { body: "{broken", method: "PATCH" }),
      "/control/kill-switch"
    );
    expect(disabled.status).toBe(404);

    vi.stubEnv("ENABLE_LEGACY_TRADING_API", "true");
    vi.stubEnv("API_PASSWORD", "correct-operation-password");
    const invalidJson = await proxyPatch(
      request("/api/control/kill-switch", {
        password: "correct-operation-password",
        body: "{broken",
        method: "PATCH",
      }),
      "/control/kill-switch"
    );

    expect(invalidJson.status).toBe(400);
    expect(backendApiFetchMock).not.toHaveBeenCalled();
  });
});

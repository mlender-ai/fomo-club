import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../lib/logger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("structured logger security", () => {
  it("suppresses debug logs in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    createLogger("security-test").debug("hidden", { token: "raw-token" });

    expect(debug).not.toHaveBeenCalled();
  });

  it("redacts nested credentials while preserving non-sensitive context", () => {
    vi.stubEnv("NODE_ENV", "test");
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    createLogger("security-test").info("request", {
      requestId: "req-1",
      auth: {
        authorization: "Bearer raw-token",
        apiKey: "raw-api-key",
        profile: { displayName: "Fomo" },
      },
    });

    const entry = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(entry.requestId).toBe("req-1");
    expect(entry.auth.authorization).toBe("[REDACTED]");
    expect(entry.auth.apiKey).toBe("[REDACTED]");
    expect(entry.auth.profile.displayName).toBe("Fomo");
  });
});

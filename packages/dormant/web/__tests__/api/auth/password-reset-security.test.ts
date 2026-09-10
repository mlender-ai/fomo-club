import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { debugMock, updateMock, findUniqueMock } = vi.hoisted(() => ({
  debugMock: vi.fn(),
  updateMock: vi.fn(),
  findUniqueMock: vi.fn(),
}));

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

vi.mock("../../../lib/logger", () => ({
  createLogger: () => ({
    debug: debugMock,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { POST as requestReset } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { hashResetToken, tokenStore } from "../../../lib/passwordResetStore";

function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tokenStore.clear();
  updateMock.mockResolvedValue({ id: "user-1" });
});

describe("password reset security", () => {
  it("stores only a digest of the reset token and never logs the raw token", async () => {
    findUniqueMock.mockResolvedValue({ id: "user-1" });

    const response = await requestReset(
      jsonRequest("/api/auth/forgot-password", { email: "USER@example.com" })
    );

    expect(response.status).toBe(200);
    expect(tokenStore.size).toBe(1);
    const [storedKey] = tokenStore.keys();
    expect(storedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(debugMock.mock.calls.some((call) => JSON.stringify(call).includes('"token"'))).toBe(false);
  });

  it("writes a bcrypt hash instead of a reversible password marker", async () => {
    const rawToken = "reset-token-123";
    const newPassword = "SecurePass123";
    tokenStore.set(hashResetToken(rawToken), {
      email: "user@example.com",
      expiresAt: Date.now() + 60_000,
      used: false,
    });

    const response = await resetPassword(
      jsonRequest("/api/auth/reset-password", { token: rawToken, newPassword })
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
    const passwordHash = updateMock.mock.calls[0]?.[0]?.data?.passwordHash as string;
    expect(passwordHash).not.toContain(newPassword);
    expect(passwordHash).not.toMatch(/^hashed:/);
    await expect(bcrypt.compare(newPassword, passwordHash)).resolves.toBe(true);
    expect(tokenStore.size).toBe(0);
  });

  it("rejects passwords that exceed bcrypt's 72-byte input limit", async () => {
    const rawToken = "long-password-token";
    tokenStore.set(hashResetToken(rawToken), {
      email: "user@example.com",
      expiresAt: Date.now() + 60_000,
      used: false,
    });

    const response = await resetPassword(
      jsonRequest("/api/auth/reset-password", {
        token: rawToken,
        newPassword: `A1${"가".repeat(24)}`,
      })
    );

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

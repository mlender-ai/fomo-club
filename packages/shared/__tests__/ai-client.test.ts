import { afterEach, describe, expect, it, vi } from "vitest";

import { callAI, isAiConfigured } from "../src/ai-client";

const ENV_KEYS = ["AI_API_URL", "AI_API_KEY", "AI_MODEL", "GROQ_API_KEY", "GROQ_MODEL", "ALLOW_GEMINI_API"] as const;
const oldEnv = new Map<string, string | undefined>();

function snapshotEnv() {
  oldEnv.clear();
  for (const key of ENV_KEYS) oldEnv.set(key, process.env[key]);
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = oldEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("ai-client provider routing", () => {
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
  });

  it("blocks Gemini model calls by default when no Groq fallback exists", async () => {
    snapshotEnv();
    process.env.AI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    process.env.AI_API_KEY = "gemini-key";
    process.env.AI_MODEL = "gemini-2.5-flash";
    delete process.env.GROQ_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isAiConfigured()).toBe(false);
    const res = await callAI({ messages: [{ role: "user", content: "hello" }] });

    expect(res.ok).toBe(false);
    expect(res.model).toBe("gemini-2.5-flash");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reroutes Gemini model config to Groq when GROQ_API_KEY is available", async () => {
    snapshotEnv();
    process.env.AI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    process.env.AI_API_KEY = "gemini-key";
    process.env.AI_MODEL = "gemini-2.5-flash";
    process.env.GROQ_API_KEY = "groq-key";
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(isAiConfigured()).toBe(true);
    const res = await callAI({ messages: [{ role: "user", content: "hello" }] });

    expect(res.ok).toBe(true);
    expect(res.content).toBe("ok");
    expect(res.model).toBe("llama-3.3-70b-versatile");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer groq-key" }),
      })
    );
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { model: string };
    expect(body.model).toBe("llama-3.3-70b-versatile");
  });

  it("uses Groq by default when only GROQ_API_KEY is configured", async () => {
    snapshotEnv();
    delete process.env.AI_API_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    process.env.GROQ_API_KEY = "groq-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(isAiConfigured()).toBe(true);
    const res = await callAI({ messages: [{ role: "user", content: "hello" }] });

    expect(res.ok).toBe(true);
    expect(res.model).toBe("llama-3.3-70b-versatile");
    expect(fetchMock).toHaveBeenCalledWith("https://api.groq.com/openai/v1/chat/completions", expect.any(Object));
  });
});

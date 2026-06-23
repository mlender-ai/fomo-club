import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedGet, clearApiCache, readCached, refreshCached } from "../lib/apiCache";

beforeEach(() => {
  vi.useRealTimers();
  clearApiCache();
});

describe("apiCache", () => {
  it("dedupes concurrent requests with the same key", async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));

    const [a, b] = await Promise.all([
      cachedGet("same", fetcher, 1_000),
      cachedGet("same", fetcher, 1_000),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
  });

  it("serves cached values within ttl", async () => {
    const fetcher = vi
      .fn<() => Promise<{ value: number }>>()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    const first = await cachedGet("ttl", fetcher, 1_000);
    const second = await cachedGet("ttl", fetcher, 1_000);

    expect(first.value).toBe(1);
    expect(second.value).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readCached<{ value: number }>("ttl")?.value).toBe(1);
  });

  it("refetches after ttl expires", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<() => Promise<{ value: number }>>()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    await expect(cachedGet("expire", fetcher, 1_000)).resolves.toEqual({ value: 1 });
    vi.advanceTimersByTime(1_001);
    await expect(cachedGet("expire", fetcher, 1_000)).resolves.toEqual({ value: 2 });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back to the previous value when refresh fails", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<() => Promise<{ value: number }>>()
      .mockResolvedValueOnce({ value: 1 })
      .mockRejectedValueOnce(new Error("network"));

    await expect(cachedGet("stale", fetcher, 1_000)).resolves.toEqual({ value: 1 });
    vi.advanceTimersByTime(1_001);
    await expect(cachedGet("stale", fetcher, 1_000)).resolves.toEqual({ value: 1 });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshCached ignores fresh cache but shares inflight refreshes", async () => {
    const fetcher = vi
      .fn<() => Promise<{ value: number }>>()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    await cachedGet("refresh", fetcher, 10_000);
    const [a, b] = await Promise.all([
      refreshCached("refresh", fetcher, 10_000),
      refreshCached("refresh", fetcher, 10_000),
    ]);

    expect(a.value).toBe(2);
    expect(b.value).toBe(2);
    expect(readCached<{ value: number }>("refresh")?.value).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

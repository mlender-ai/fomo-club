import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));

vi.mock("../../../lib/fomo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/fomo")>();
  return {
    ...actual,
    kstDate: () => "2026-06-23",
    cacheVersion: () => "test",
  };
});

vi.mock("../../../lib/keyword-snapshot", () => ({
  readKeywordSnapshot: vi.fn(),
  readLatestKeywordSnapshot: vi.fn(),
}));

vi.mock("../../../lib/keyword-pipeline", () => ({
  computeKeywordCards: vi.fn(),
}));

import { MOCK_KEYWORD_CARDS } from "@fomo/core";
import { GET } from "@/app/api/fomo/keywords/route";
import { computeKeywordCards } from "../../../lib/keyword-pipeline";
import {
  readKeywordSnapshot,
  readLatestKeywordSnapshot,
} from "../../../lib/keyword-snapshot";

const mockToday = vi.mocked(readKeywordSnapshot);
const mockLatest = vi.mocked(readLatestKeywordSnapshot);
const mockCompute = vi.mocked(computeKeywordCards);

const cards = MOCK_KEYWORD_CARDS.slice(0, 2);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/fomo/keywords Phase 3 snapshot-first policy", () => {
  it("returns today's snapshot without live compute", async () => {
    mockToday.mockResolvedValueOnce({ date: "2026-06-23", cards, confidence: "low" });

    const res = await GET(new Request("https://example.com/api/fomo/keywords"));
    const body = await res.json();

    expect(body.live).toBe(false);
    expect(body.stale).toBe(false);
    expect(body.snapshotDate).toBe("2026-06-23");
    expect(body.cards).toHaveLength(2);
    expect(mockLatest).not.toHaveBeenCalled();
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it("returns latest snapshot as stale when today's snapshot is missing", async () => {
    mockToday.mockResolvedValueOnce(null);
    mockLatest.mockResolvedValueOnce({ date: "2026-06-22", cards, confidence: "medium" });

    const res = await GET(new Request("https://example.com/api/fomo/keywords"));
    const body = await res.json();

    expect(body.date).toBe("2026-06-23");
    expect(body.live).toBe(false);
    expect(body.stale).toBe(true);
    expect(body.snapshotDate).toBe("2026-06-22");
    expect(body.confidence).toBe("medium");
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it("returns fallback cards without live compute when no snapshot exists", async () => {
    mockToday.mockResolvedValueOnce(null);
    mockLatest.mockResolvedValueOnce(null);

    const res = await GET(new Request("https://example.com/api/fomo/keywords"));
    const body = await res.json();

    expect(body.live).toBe(false);
    expect(body.stale).toBe(true);
    expect(body.snapshotDate).toBeNull();
    expect(body.confidence).toBe("fallback");
    expect(body.cards.length).toBeGreaterThan(0);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it("runs live compute only when live=1 is explicit", async () => {
    mockCompute.mockResolvedValueOnce({ cards, confidence: "low" });

    const res = await GET(new Request("https://example.com/api/fomo/keywords?live=1"));
    const body = await res.json();

    expect(body.live).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.snapshotDate).toBeNull();
    expect(body.cards).toHaveLength(2);
    expect(mockToday).not.toHaveBeenCalled();
    expect(mockLatest).not.toHaveBeenCalled();
    expect(mockCompute).toHaveBeenCalledTimes(1);
  });
});

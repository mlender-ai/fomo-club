import { describe, it, expect } from "vitest";
import { normalizeAnnouncement, deduplicateByTitle, sortByDateDesc } from "../app/api/market/announcements/utils";

describe("normalizeAnnouncement", () => {
  it("returns null when title is missing", () => {
    const result = normalizeAnnouncement({ id: "1", publishedAt: "2026-05-31T00:00:00Z", type: "earnings" }, "SEC");
    expect(result).toBeNull();
  });

  it("returns null when title is empty string", () => {
    const result = normalizeAnnouncement({ id: "1", title: "  ", publishedAt: "2026-05-31T00:00:00Z" }, "SEC");
    expect(result).toBeNull();
  });

  it("normalizes a valid announcement", () => {
    const raw = {
      id: "abc123",
      title: "Quarterly Earnings Report",
      type: "earnings",
      publishedAt: "2026-05-30T12:00:00Z",
      url: "https://example.com/filing",
    };
    const result = normalizeAnnouncement(raw, "SEC");
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Quarterly Earnings Report");
    expect(result?.source).toBe("SEC");
    expect(result?.type).toBe("earnings");
    expect(result?.url).toBe("https://example.com/filing");
  });

  it("falls back to ISO now when publishedAt is invalid", () => {
    const raw = { id: "x", title: "Test", publishedAt: "NOT_A_DATE" };
    const result = normalizeAnnouncement(raw, "DART");
    expect(result).not.toBeNull();
    // Should produce a valid ISO date
    expect(() => new Date(result!.publishedAt).toISOString()).not.toThrow();
  });

  it("handles missing optional url field gracefully", () => {
    const raw = { id: "y", title: "Dividend announcement", publishedAt: "2026-05-01T00:00:00Z" };
    const result = normalizeAnnouncement(raw, "company");
    expect(result).not.toBeNull();
    expect(result?.url).toBeUndefined();
  });
});

describe("deduplicateByTitle", () => {
  it("removes items with duplicate titles (case-insensitive)", () => {
    const items = [
      { id: "1", title: "Earnings Q1", type: "earnings", publishedAt: "2026-05-01T00:00:00Z", source: "SEC" },
      { id: "2", title: "earnings q1", type: "earnings", publishedAt: "2026-05-02T00:00:00Z", source: "SEC" },
      { id: "3", title: "Dividend Report", type: "dividend", publishedAt: "2026-05-03T00:00:00Z", source: "SEC" },
    ];
    const result = deduplicateByTitle(items);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("1");
    expect(result[1]?.id).toBe("3");
  });

  it("returns all items when there are no duplicates", () => {
    const items = [
      { id: "1", title: "Alpha", type: "other", publishedAt: "2026-05-01T00:00:00Z", source: "SEC" },
      { id: "2", title: "Beta", type: "other", publishedAt: "2026-05-02T00:00:00Z", source: "SEC" },
    ];
    expect(deduplicateByTitle(items)).toHaveLength(2);
  });

  it("handles empty array", () => {
    expect(deduplicateByTitle([])).toHaveLength(0);
  });
});

describe("sortByDateDesc", () => {
  it("sorts items from newest to oldest", () => {
    const items = [
      { id: "1", title: "Old", type: "other", publishedAt: "2026-01-01T00:00:00Z", source: "SEC" },
      { id: "2", title: "Newer", type: "other", publishedAt: "2026-05-01T00:00:00Z", source: "SEC" },
      { id: "3", title: "Newest", type: "other", publishedAt: "2026-05-31T00:00:00Z", source: "SEC" },
    ];
    const sorted = sortByDateDesc(items);
    expect(sorted[0]?.id).toBe("3");
    expect(sorted[1]?.id).toBe("2");
    expect(sorted[2]?.id).toBe("1");
  });

  it("does not mutate the original array", () => {
    const items = [
      { id: "1", title: "A", type: "other", publishedAt: "2026-01-01T00:00:00Z", source: "SEC" },
      { id: "2", title: "B", type: "other", publishedAt: "2026-05-01T00:00:00Z", source: "SEC" },
    ];
    const originalFirst = items[0]?.id;
    sortByDateDesc(items);
    expect(items[0]?.id).toBe(originalFirst);
  });

  it("handles empty array", () => {
    expect(sortByDateDesc([])).toHaveLength(0);
  });
});

export interface Announcement {
  id: string;
  title: string;
  type: string;
  publishedAt: string;
  source: string;
  url?: string;
}

export function normalizeAnnouncement(raw: Record<string, unknown>, source: string): Announcement | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : null;
  const id = typeof raw.id === "string" ? raw.id : String(raw.accessionNo ?? raw.id ?? Math.random());
  const publishedAt = typeof raw.publishedAt === "string"
    ? raw.publishedAt
    : typeof raw.filedAt === "string"
      ? raw.filedAt
      : new Date().toISOString();
  const type = typeof raw.type === "string" ? raw.type : "other";

  if (!title) return null;

  const safeDate = (() => {
    const d = new Date(publishedAt);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  })();

  const result: Announcement = { id, title, type, publishedAt: safeDate, source };
  if (typeof raw.url === "string") result.url = raw.url;
  return result;
}

export function deduplicateByTitle(items: Announcement[]): Announcement[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sortByDateDesc(items: Announcement[]): Announcement[] {
  return [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

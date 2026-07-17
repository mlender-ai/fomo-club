import { describe, expect, it, vi } from "vitest";

// 아카이브는 발행된 실콘텐츠(FeedContentCache 행)만 읽는다 — 저장소를 날짜별로 흉내 낸다.
const store = new Map<string, unknown>();
vi.mock("../../lib/feed-content-store", () => ({
  readFeedContent: vi.fn(async (id: string) => store.get(id) ?? null),
  writeFeedContent: vi.fn(async () => {}),
  readFeedContentByPrefix: vi.fn(async () => []),
  deleteFeedContent: vi.fn(async () => {}),
}));

import { buildFeedArchiveResponse } from "../../lib/feed-hub";
import { kstDate } from "../../lib/fomo";

function briefingRow(id: string, headline: string) {
  return {
    card: {
      kind: "content",
      id,
      contentType: "briefing",
      scope: "domestic",
      headline,
      facts: [],
      source: "테스트",
      asOf: id.slice(-10),
    },
  };
}

// 2026-07-18 User Zero: "무한스크롤처럼 피드를 계속" — 지난 브리핑·버즈가 페이지 단위로 이어진다.
describe("feed archive (무한 피드)", () => {
  it("before 이전 3일치의 발행 콘텐츠를 날짜 내림차순으로 반환하고 커서를 넘긴다", async () => {
    store.clear();
    const d1 = kstDate(-1);
    const d2 = kstDate(-2);
    store.set(`briefing:kr:${d1}`, briefingRow(`content:briefing:kr:${d1}`, "어제의 국장 브리핑"));
    store.set(`buzz:${d2}`, briefingRow(`content:buzz:${d2}`, "그제의 버즈"));

    const page = await buildFeedArchiveResponse(kstDate());
    const ids = page.items.map((i) => (i as { content: { id: string } }).content.id);
    expect(ids).toEqual([`content:briefing:kr:${d1}`, `content:buzz:${d2}`]);
    expect(page.nextBefore).toBe(kstDate(-3));
  });

  it("행이 없는 날(주말 등)은 빈 페이지 + 커서 전진 — 클라이언트가 계속 넘길 수 있다", async () => {
    store.clear();
    const page = await buildFeedArchiveResponse(kstDate(-10));
    expect(page.items).toEqual([]);
    expect(page.nextBefore).toBe(kstDate(-13));
  });

  it("최대 조회 기간(30일)을 넘으면 nextBefore=null 로 끝을 알린다", async () => {
    store.clear();
    const page = await buildFeedArchiveResponse(kstDate(-29));
    expect(page.nextBefore).toBeNull();
  });

  it("이번 주 회고는 오늘 피드 소관이라 아카이브에서 제외한다(중복 금지)", async () => {
    store.clear();
    const today = kstDate();
    const iso = (d: string) => {
      const dt = new Date(`${d}T00:00:00Z`);
      const day = dt.getUTCDay() || 7;
      dt.setUTCDate(dt.getUTCDate() + 4 - day);
      const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
      return `${dt.getUTCFullYear()}-W${String(Math.ceil(((dt.getTime() - ys.getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
    };
    store.set(`recap:${iso(today)}`, briefingRow(`content:recap:${iso(today)}`, "이번 주 회고"));
    const page = await buildFeedArchiveResponse(today);
    expect(page.items.map((i) => (i as { content: { id: string } }).content.id)).not.toContain(`content:recap:${iso(today)}`);
  });
});

import { describe, expect, it } from "vitest";
import { FEED_ITEM_TYPES, interleaveFeedItems, type FeedHubItem } from "../../lib/feed-hub";

/**
 * 타입 레지스트리 회귀 방지 (WO 피드 통합 §4) —
 * "새 포맷 추가 = 기존 제거"가 피드 다양성 붕괴의 원인이었다.
 * 타입 제거는 명시 지시 없이 금지. 이 테스트가 그 원칙을 지킨다.
 */
describe("feed-hub 타입 레지스트리", () => {
  it("등록된 타입은 절대 줄지 않는다 (제거는 명시 지시 필요)", () => {
    const REQUIRED_TYPES = [
      "briefing",
      "buzz",
      "recap",
      "narrative",
      "sector",
      "index",
      "macro",
      "whale",
      "stock-issue",
      "macro-issue",
    ];
    for (const type of REQUIRED_TYPES) {
      expect(FEED_ITEM_TYPES, `타입 "${type}" 이 레지스트리에서 사라졌다 — 명시 지시 없는 타입 제거는 금지`).toContain(type);
    }
    expect(FEED_ITEM_TYPES.length).toBeGreaterThanOrEqual(REQUIRED_TYPES.length);
  });
});

function contentItem(type: "index" | "macro" | "whale", id: string): FeedHubItem {
  return {
    type,
    scope: "KR",
    content: { kind: "content", id, contentType: type, scope: "domestic", headline: "h", facts: [{ label: "l", value: "+1%" }], source: "s", asOf: "2026-07-04" },
  };
}

describe("interleaveFeedItems", () => {
  it("같은 타입 연속 3개 금지", () => {
    const items: FeedHubItem[] = [
      contentItem("index", "a"),
      contentItem("index", "b"),
      contentItem("index", "c"),
      contentItem("macro", "d"),
      contentItem("whale", "e"),
    ];
    const ordered = interleaveFeedItems(items);
    for (let i = 2; i < ordered.length; i += 1) {
      const same = ordered[i]!.type === ordered[i - 1]!.type && ordered[i]!.type === ordered[i - 2]!.type;
      expect(same, `${i}번째에서 같은 타입 3연속`).toBe(false);
    }
    expect(ordered).toHaveLength(items.length); // 억지 삭제 금지 — 재배열만
  });

  it("전부 같은 타입이면 그대로 유지(삭제 금지)", () => {
    const items: FeedHubItem[] = [contentItem("index", "a"), contentItem("index", "b"), contentItem("index", "c")];
    expect(interleaveFeedItems(items)).toHaveLength(3);
  });
});

// 신선도 로테이션(WO 미장·코인 확충) — 어제와 같은 문구는 이틀 연속 금지.
import { selectDaily30Candidates } from "../../lib/daily-30";

describe("daily-30 freshness (모듈 로드 검증)", () => {
  it("selectDaily30Candidates 는 빈 후보에서 빈 덱(회귀 안전판)", () => {
    expect(selectDaily30Candidates([])).toEqual([]);
  });
});

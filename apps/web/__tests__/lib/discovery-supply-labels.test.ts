import { describe, expect, it } from "vitest";
import type { DiscoveryEvent } from "@fomo/core";
import { inferDiscoverySectorLabel } from "../../lib/discovery-supply";

const asOf = "2026-06-26";

function event(label: string): DiscoveryEvent {
  return {
    kind: "news_mention",
    firstSeen: true,
    strength: 0.8,
    source: "뉴스",
    asOf,
    confidence: "H",
    label,
    direction: "up",
  };
}

describe("discovery sector labels", () => {
  it("uses curated sectors for known stocks instead of market names", () => {
    expect(inferDiscoverySectorLabel("NAVER", [event("네이버클라우드, 정부 GPU 사업 사용권 확보")])).toBe("AI");
    expect(inferDiscoverySectorLabel("로킷헬스케어", [event("하반기 모멘텀에 주목")])).toBe("바이오");
  });

  it("infers an industry label for long-tail stocks from material text", () => {
    expect(inferDiscoverySectorLabel("테스트종목", [event("AI 서버용 MLCC 이형필름 개발")])).toBe("반도체");
    expect(inferDiscoverySectorLabel("대명에너지", [event("태양광·풍력+ESS 풀세트 기업")])).toBe("에너지");
    expect(inferDiscoverySectorLabel("제닉", [event("오늘 가격이 +10.87% 움직였어요.")])).toBe("화장품");
    expect(inferDiscoverySectorLabel("한국콜마", [event("오늘 가격이 +5.08% 움직였어요.")])).toBe("화장품");
    expect(inferDiscoverySectorLabel("롯데손해보험", [event("오늘 가격이 +5.68% 움직였어요.")])).toBe("금융");
    expect(inferDiscoverySectorLabel("금호타이어", [event("오늘 가격이 +5.92% 움직였어요.")])).toBe("자동차");
    expect(inferDiscoverySectorLabel("테스", [event("오늘 가격이 +5.96% 움직였어요.")])).toBe("반도체");
    expect(inferDiscoverySectorLabel("올릭스", [event("오늘 가격이 +5.47% 움직였어요.")])).toBe("바이오");
    expect(inferDiscoverySectorLabel("마키나락스", [event("오늘 가격이 +6.82% 움직였어요.")])).toBe("AI");
    expect(inferDiscoverySectorLabel("엠로", [event("오늘 가격이 +5.46% 움직였어요.")])).toBe("AI");
  });

  it("does not infer the chip from provider/source metadata", () => {
    const noisySourceEvent: DiscoveryEvent = {
      ...event("오늘 가격이 +10.87% 움직였어요."),
      source: "네이버 시세·종목뉴스·리서치·DART 공시·수급 캐시",
    };

    expect(inferDiscoverySectorLabel("알수없는종목", [noisySourceEvent])).toBe("기타 업종");
  });

  it("does not infer AI from market names inside generated event labels", () => {
    expect(inferDiscoverySectorLabel("알수없는종목", [event("KOSDAQ 시총 413위권에서 오늘 +10.87% 움직였어요.")])).toBe(
      "기타 업종"
    );
  });

  it("never falls back to KOSPI or KOSDAQ as a card chip", () => {
    expect(inferDiscoverySectorLabel("알수없는종목", [])).toBe("기타 업종");
    expect(inferDiscoverySectorLabel("알수없는종목", [])).not.toMatch(/KOSPI|KOSDAQ/);
  });
});

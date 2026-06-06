/**
 * TickerLogo 핵심 로직 단위 테스트.
 * UI 렌더링(Image onError/onLoad)은 React Native 환경 없이 테스트 불가 — 대신
 * 로고 URL 결정 로직·폴백 색상·도메인 추론 함수를 검증한다.
 */
import { describe, it, expect, beforeEach } from "vitest";

// tickerLogo.ts는 tarot-mobile 앱 내부에 있으나, 순수 JS 함수이므로
// 직접 경로로 import해 vitest로 검증 가능하다.
import {
  getTickerLogoUrls,
  getTickerColor,
  getTickerLogoUrl,
  setTickerLogoOverrides,
  cacheTickerName,
  TICKER_DOMAIN_MAP,
} from "../../../apps/tarot-mobile/lib/tickerLogo";

beforeEach(() => {
  // 각 테스트 전 오버라이드·이름 캐시 초기화
  setTickerLogoOverrides({});
});

describe("getTickerLogoUrls — 정상 URL 반환", () => {
  it("도메인 맵에 있는 티커는 Clearbit + Google favicon 순으로 반환", () => {
    const urls = getTickerLogoUrls("AAPL");
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("clearbit.com");
    expect(urls[1]).toContain("google.com");
  });

  it("도메인 맵에 없는 티커는 빈 배열 반환 (로고 없음 → Fallback 컴포넌트)", () => {
    const urls = getTickerLogoUrls("UNKNOWN_TICKER_XYZ");
    expect(urls).toHaveLength(0);
  });

  it("커스텀 오버라이드가 있으면 단일 URL만 반환", () => {
    setTickerLogoOverrides({ AAPL: "https://cdn.example.com/aapl.png" });
    const urls = getTickerLogoUrls("AAPL");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://cdn.example.com/aapl.png");
  });

  it("회사명 캐시가 있으면 도메인을 추론해 URL 생성", () => {
    cacheTickerName("MYCO", "MyCompany Inc.");
    const urls = getTickerLogoUrls("MYCO");
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain("mycompany.com");
  });
});

describe("getTickerLogoUrl — 레거시 단일 URL 헬퍼", () => {
  it("첫 번째 URL 또는 null 반환", () => {
    expect(getTickerLogoUrl("TSLA")).toContain("clearbit.com");
    expect(getTickerLogoUrl("UNKNOWN_TICKER_XYZ")).toBeNull();
  });
});

describe("getTickerColor — 결정론적 색상", () => {
  it("같은 티커는 항상 같은 색을 반환", () => {
    expect(getTickerColor("AAPL")).toBe(getTickerColor("AAPL"));
    expect(getTickerColor("TSLA")).toBe(getTickerColor("TSLA"));
  });

  it("다른 티커는 (대부분) 다른 색을 반환", () => {
    // 해시 충돌이 있을 수 있으므로 100% 다름을 강제하지 않고 여러 케이스로 확인
    const colors = new Set(["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL"].map(getTickerColor));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("반환값은 hex 색상 문자열", () => {
    const color = getTickerColor("AAPL");
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("TICKER_DOMAIN_MAP — 핵심 티커 포함 여부", () => {
  const mustHave = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "005930.KS"];
  it.each(mustHave)("티커 %s는 도메인 맵에 포함", (ticker) => {
    expect(TICKER_DOMAIN_MAP[ticker]).toBeTruthy();
  });
});

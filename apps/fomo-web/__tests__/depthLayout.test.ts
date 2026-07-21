import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("../components/KeywordDepthPage.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../components/DepthSection.tsx", import.meta.url), "utf8");
const sparkline = readFileSync(new URL("../components/Sparkline.tsx", import.meta.url), "utf8");
const chartCard = readFileSync(new URL("../components/cards/ChartCardBody.tsx", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../lib/chartTokens.ts", import.meta.url), "utf8");

describe("종목 뎁스 정보 구조", () => {
  it("판단을 기본으로 열고 네 개의 sticky 탭을 고정한다", () => {
    expect(component).toContain('useState<DepthTab>("judgment")');
    expect(component).toContain("sticky top-0 z-30");
    for (const label of ["판단", "차트·구간", "기업·재무", "신호 이력"]) {
      expect(component).toContain(`label: "${label}"`);
    }
    expect(component).not.toContain('useState<"why" | "ta">');
  });

  it("탭별 콘텐츠를 독립 패널로만 렌더한다", () => {
    for (const tab of ["judgment", "chart", "company", "history"]) {
      expect(component).toContain(`depthTab === "${tab}"`);
    }
    expect(component).toContain('role="tabpanel"');
    expect(component).toContain('<DepthFold title="재료·가격 반응"');
    expect(component).toContain('<DepthFold title="추가 근거·원문"');
  });

  it("요약은 카드형, 목록은 라인형 공용 컴포넌트를 제공한다", () => {
    expect(section).toContain('variant === "card"');
    expect(section).toContain('variant === "list"');
    expect(section).toContain("export function DepthLine");
    expect(component).toContain('variant="list" title="재무 한눈에"');
  });
});

describe("차트 색 토큰", () => {
  it("상승·하락·MA·무효선·구간·거래량을 한 소스에 둔다", () => {
    for (const key of ["up", "down", "ma20", "ma60", "ma120", "invalidation", "volumeUp", "volumeDown", "zone", "marker"]) {
      expect(tokens).toMatch(new RegExp(`\\b${key}:`));
    }
  });

  it("미니 차트와 카드 차트가 같은 토큰을 쓴다", () => {
    expect(sparkline).toContain('from "@/lib/chartTokens"');
    expect(chartCard).toContain('from "@/lib/chartTokens"');
    expect(sparkline).toContain("chartTokens.up");
    expect(sparkline).toContain("chartTokens.down");
    expect(chartCard).toContain("chartTokens.up");
    expect(chartCard).toContain("chartTokens.down");
  });

  it("상세 차트에 과거 로컬 색 상수가 남지 않는다", () => {
    expect(component).not.toContain("CHART_COLOR");
    expect(component).not.toContain('bg-[#050706]');
  });
});

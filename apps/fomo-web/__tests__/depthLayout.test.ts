import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("../components/KeywordDepthPage.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../components/DepthSection.tsx", import.meta.url), "utf8");
const sparkline = readFileSync(new URL("../components/Sparkline.tsx", import.meta.url), "utf8");
const chartCard = readFileSync(new URL("../components/cards/ChartCardBody.tsx", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../lib/chartTokens.ts", import.meta.url), "utf8");

describe("종목 뎁스 정보 구조", () => {
  it("WO-G1B: 탭 없는 단일 스크롤 「납득 문서」 — 질문 순서 5블록", () => {
    // 탭 구조 소멸(사용처 제거).
    expect(component).not.toContain("<DepthTabBar tab={depthTab}");
    expect(component).not.toContain('role="tabpanel"');
    expect(component).not.toContain('depthTab === "judgment"');
    // 단일 스크롤 본문.
    expect(component).toContain('className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-6"');
    // 질문형 5블록 헤딩(위→아래).
    for (const q of ["왜 이 회사인가", "왜 지금인가", "언제 틀리는가", "이 종목 판단 기록"]) {
      expect(component).toContain(`<DepthDocHeading label="${q}" />`);
    }
    // 블록 순서: 전문가 소견 → 왜 이 회사 → 왜 지금 → 언제 틀리나 → 판단 기록.
    const order = [
      "<ExpertOpinionBlock",
      '<DepthDocHeading label="왜 이 회사인가"',
      '<DepthDocHeading label="왜 지금인가"',
      '<DepthDocHeading label="언제 틀리는가"',
      '<DepthDocHeading label="이 종목 판단 기록"',
    ].map((s) => component.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeGreaterThan(order[i - 1]!);
  });

  it("점수·육각형은 유저 화면에서 내린다(내부 선별용으로만 — 코드 보존)", () => {
    // 유저 노출 렌더에서 육각형 제거.
    expect(component).not.toContain("<CompanyScoreRadar");
    // 납득 문서의 실제 블록 컴포넌트는 유지(이식·재배치).
    for (const block of ["<ExpertOpinionBlock", "<CompanyProfileBlock", "<FinanceGlanceBlock", "<ChartAnalysisTab", "<JudgmentDecision", "<JudgmentTimeline"]) {
      expect(component).toContain(block);
    }
    expect(component).toContain('<DepthFold title="재료·가격 반응"');
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

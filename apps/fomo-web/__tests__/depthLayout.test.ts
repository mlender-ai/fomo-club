import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("../components/KeywordDepthPage.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../components/DepthSection.tsx", import.meta.url), "utf8");
const sparkline = readFileSync(new URL("../components/Sparkline.tsx", import.meta.url), "utf8");
const chartCard = readFileSync(new URL("../components/cards/ChartCardBody.tsx", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../components/JudgmentTimeline.tsx", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../lib/chartTokens.ts", import.meta.url), "utf8");

describe("종목 뎁스 정보 구조", () => {
  it("WO-P7: 질문 3단계 — 한 화면에 전부 쌓지 않는다", () => {
    // 단계 정의(이 회사 / 왜 지금 / 기록)와 탭 UI.
    for (const label of ["이 회사", "왜 지금", "기록"]) {
      expect(component).toContain(`label: "${label}"`);
    }
    expect(component).toContain("<DepthStepTabs step={step} onStep={setStep} />");
    expect(component).toContain('role="tabpanel"');

    // 단계별로 본문이 갈린다 — 세 갈래가 모두 존재.
    for (const key of ["company", "now", "record"]) {
      expect(component).toContain(`step === "${key}"`);
    }

    // 순서: 이 회사 → 왜 지금 → 기록.
    const order = ['step === "company"', 'step === "now"', 'step === "record"'].map((s) => component.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeGreaterThan(order[i - 1]!);

    // 가격 헤더는 스크롤과 분리해 어느 단계에서도 고정(카드 연속성).
    expect(component).toMatch(/shrink-0 border-b border-hairline px-6 pb-3 pt-4[\s\S]{0,200}<StockPriceHeader/);

    // 본문 스크롤 컨테이너는 GNB·safe-area 만큼 하단을 비운다(마지막 블록 가림 금지).
    expect(component).toContain("pb-[calc(6rem+env(safe-area-inset-bottom))]");
  });

  it("같은 제목을 두 번 쓰지 않는다 — JudgmentTimeline 이 자체 제목을 갖는다", () => {
    expect(component).not.toContain('<DepthDocHeading label="이 종목 판단 기록"');
    expect(timeline).toContain('title="이 종목 판단 기록"');
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

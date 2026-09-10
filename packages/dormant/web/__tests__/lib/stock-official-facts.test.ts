import { describe, expect, it, vi } from "vitest";
import type { SourceDoc } from "@fomo/core";

// AI 미설정 경로로 고정 — officialFacts 필터만 검증한다(LLM 무관 결정론 경로).
vi.mock("@fomo/shared", () => ({
  callAI: vi.fn(),
  isAiConfigured: () => false,
}));

import { runUnderstanding } from "../../lib/theme-understanding";

const fredDoc: SourceDoc = {
  id: "S1",
  kind: "official",
  title: "나스닥 종합지수 25881.95",
  body: "2026-07-16 기준 (미 연준 공식 데이터 · FRED NASDAQCOM)",
  source: "FRED(미 연준)",
  url: "https://fred.stlouisfed.org/series/NASDAQCOM",
  tier: "official-high",
};

const dartDoc: SourceDoc = {
  id: "S2",
  kind: "official",
  title: "주요사항보고서(유상증자결정)",
  body: "2026-07-17 접수 공시",
  source: "DART 공시",
  tier: "official-high",
};

// 2026-07-17 User Zero: "신일제약에 (나스닥·미 국채) 공식 지표가 왜 붙어" — 종목 뎁스의
// "확인된 공식 지표"는 종목 직접 공시(DART·SEC)만. FRED 거시는 종목 무관 배경이라 제외.
describe("종목 officialFacts — FRED 거시 제외", () => {
  it("kind=stock 이면 FRED 거시 지표는 officialFacts 에서 빠지고 DART 공시만 남는다", async () => {
    const insight = await runUnderstanding("신일제약", [fredDoc, dartDoc], "stock");
    const labels = (insight.officialFacts ?? []).map((f) => f.label);
    expect(labels).toContain("주요사항보고서(유상증자결정)");
    expect(labels.join(" ")).not.toContain("나스닥");
  });

  it("kind=stock 에서 종목 직접 공시가 없으면 officialFacts 자체가 비어 섹션이 뜨지 않는다", async () => {
    const insight = await runUnderstanding("신일제약", [fredDoc], "stock");
    expect(insight.officialFacts ?? []).toHaveLength(0);
  });

  it("kind=theme(금리·거시 키워드)에서는 FRED 가 주제 지표라 유지된다", async () => {
    const insight = await runUnderstanding("금리", [fredDoc], "theme");
    expect((insight.officialFacts ?? []).map((f) => f.label)).toContain("나스닥 종합지수 25881.95");
  });
});

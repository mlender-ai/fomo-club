import { describe, expect, it } from "vitest";
import {
  ruleReprocessNewsHook,
  validateReprocessedNewsHook,
  type NewsHookInput,
} from "../../lib/news-reprocess";

const base: NewsHookInput = {
  stock: "사운드하운드AI",
  sector: "AI",
  title: "SoundHound AI, 제품·AI 인프라 소식이 나왔어요.",
  source: "Yahoo Finance",
  changePct: 11.2,
  asOf: "2026-06-28",
};

describe("news hook reprocessing", () => {
  it("reprocesses a US product/news title into a stock-perspective hook", () => {
    const hook = ruleReprocessNewsHook(base);

    expect(hook).toBe("음성 AI 신제품 소식에 반응");
    expect(hook).not.toContain("SoundHound");
    expect(hook).not.toContain("Yahoo Finance");
    expect(hook!.length).toBeLessThanOrEqual(36);
  });

  it("reprocesses a Kumho regional-investment headline without pasting the article title", () => {
    const title = "정부 대형투자 발표 예고에 금호타이어·파루 등 호남 관련주 급등";
    const hook = ruleReprocessNewsHook({
      ...base,
      stock: "금호타이어",
      sector: "자동차",
      title,
      source: "한경비즈니스",
    });

    expect(hook).toBe("정부 호남 투자 예고에 관련주로 묶임");
    expect(hook).not.toBe(title);
    expect(hook).not.toContain("한경비즈니스");
  });

  it("does not promote generic title shells", () => {
    expect(ruleReprocessNewsHook({ ...base, title: "제품·AI 인프라 소식이 나왔어요." })).toBeUndefined();
    expect(ruleReprocessNewsHook({ ...base, title: "소식이 나왔어요." })).toBeUndefined();
  });

  it("rejects source names, raw-title paste, forbidden advice, and added numbers", () => {
    expect(validateReprocessedNewsHook("Yahoo Finance 제품 소식", base)).toBeUndefined();
    expect(validateReprocessedNewsHook(base.title, base)).toBeUndefined();
    expect(validateReprocessedNewsHook("지금 매수 기회", base)).toBeUndefined();
    expect(validateReprocessedNewsHook("매출 99% 성장 확인", base)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { dedupeCardCopy } from "../lib/cardCopyDedupe";

describe("dedupeCardCopy", () => {
  it("lets the headline own a repeated supply reason", () => {
    const copy = dedupeCardCopy({
      headline: "기관이 4일째 사는 중이에요.",
      why: "가격은 빠졌지만 기관 수급이 이어져서 확인 대상으로 보여줘요.",
      feedBull: { text: "기관이 4일째 사는 중이에요.", source: "수급" },
      feedBear: { text: "오늘 가격은 6,800 (-10.66%) 하락으로 움직였어요.", source: "가격" },
    });

    expect(copy.why).toBeUndefined();
    expect(copy.feedBull).toBeUndefined();
    expect(copy.feedBear).toEqual({
      text: "오늘 가격은 6,800 (-10.66%) 하락으로 움직였어요.",
      source: "가격",
    });
  });

  it("keeps a grounded source reason even when the headline is also material", () => {
    const copy = dedupeCardCopy({
      headline: "가격은 빠졌는데, 뉴스·커뮤니티 언급은 늘었어요.",
      why: "‘바이오’ 흐름에서 같이 잡힌 원문 근거가 있어요: 신약개발 해법은 AI·오픈이노베이션",
      feedBull: { text: "오늘 이 종목을 직접 언급한 뉴스가 있어요.", source: "뉴스" },
      preserveGroundedReason: true,
    });

    expect(copy.why).toBe("‘바이오’ 흐름에서 같이 잡힌 원문 근거가 있어요: 신약개발 해법은 AI·오픈이노베이션");
    expect(copy.feedBull).toBeUndefined();
  });

  it("hides repeated price copy across headline, reason, and subline", () => {
    const copy = dedupeCardCopy({
      headline: "오늘 가격이 +18.9% 움직였어요.",
      why: "오늘 가격이 +18.86% 움직였어요.",
      subLine: "오늘 가격이 +18.86% 움직였어요.",
    });

    expect(copy.why).toBeUndefined();
    expect(copy.subLine).toBeUndefined();
  });

  it("keeps a non-overlapping reason while removing a repeated subline", () => {
    const copy = dedupeCardCopy({
      headline: "오늘 가격이 +29.9% 움직였어요.",
      why: "큰 가격 움직임은 보였지만, 연결된 공개 재료는 아직 확인되지 않았어요.",
      subLine: "오늘 가격이 +29.91% 움직였어요.",
    });

    expect(copy.why).toBe("큰 가격 움직임은 보였지만, 연결된 공개 재료는 아직 확인되지 않았어요.");
    expect(copy.subLine).toBeUndefined();
  });
});

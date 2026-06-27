import { describe, expect, it } from "vitest";
import { evaluateDiscoveryPayload, type DiscoveryGatePayload } from "../discovery-regression-gate";

describe("discovery regression gate", () => {
  it("passes a 50-card deck with sector labels and material hooks", () => {
    const payload = makePayload(
      Array.from({ length: 50 }, (_, index) => ({
        canonical: `발굴종목${index + 1}`,
        sector: index % 2 === 0 ? "반도체" : "바이오",
        reason: `오늘 ${index % 2 === 0 ? "반도체" : "바이오"} 흐름에서 확인할 원문 근거 ${index + 1}번이 있어요.`,
      })),
    );

    const result = evaluateDiscoveryPayload(payload);

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("rejects short decks", () => {
    const payload = makePayload(
      Array.from({ length: 18 }, (_, index) => ({
        canonical: `발굴종목${index + 1}`,
        sector: "반도체",
        reason: `공시 원문 근거 ${index + 1}번이 있어요.`,
      })),
    );

    const result = evaluateDiscoveryPayload(payload);

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("deck.too_short");
  });

  it("rejects price-only hooks in the front band", () => {
    const payload = makePayload([
      { canonical: "광주신세계", sector: "유통", reason: "오늘 가격이 +30.0% 움직였어요." },
      ...filler(49),
    ]);

    const result = evaluateDiscoveryPayload(payload);

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("hook.price_only");
  });

  it("rejects market labels used as chips", () => {
    const payload = makePayload([
      { canonical: "로킷헬스케어", sector: "KOSDAQ", reason: "오늘 이 종목을 직접 언급한 뉴스가 있어요." },
      ...filler(49),
    ]);

    const result = evaluateDiscoveryPayload(payload);

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("chip.market_label");
  });

  it("rejects famous stocks in the front band", () => {
    const payload = makePayload([
      { canonical: "삼성전자", sector: "반도체", reason: "오늘 이 종목을 직접 언급한 공시가 있어요." },
      ...filler(49),
    ]);

    const result = evaluateDiscoveryPayload(payload);

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("front.famous_stock");
  });
});

function makePayload(stocks: DiscoveryGatePayload["stocks"]): DiscoveryGatePayload {
  return { stocks };
}

function filler(count: number): NonNullable<DiscoveryGatePayload["stocks"]> {
  return Array.from({ length: count }, (_, index) => ({
    canonical: `필러종목${index + 1}`,
    sector: index % 2 === 0 ? "AI" : "방산",
    reason: `오늘 ${index % 2 === 0 ? "AI" : "방산"} 흐름에서 확인할 원문 근거 ${index + 1}번이 있어요.`,
  }));
}


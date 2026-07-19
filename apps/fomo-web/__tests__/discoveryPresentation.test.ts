import { describe, expect, it } from "vitest";
import { discoveryStatus, verdictBalance } from "../lib/discoveryPresentation";

describe("discovery presentation", () => {
  it("keeps attention state separate from bearish chart balance", () => {
    expect(discoveryStatus({ label: "warming", fomoScore: 31 })).toMatchObject({
      label: "거래·언급 느는 중",
      tone: "warming",
    });
    expect(verdictBalance({ stance: "avoid" })).toMatchObject({ label: "약세 신호 우세" });
  });

  it("shows quiet coins as quiet instead of a trading action", () => {
    expect(discoveryStatus({ label: "silent", fomoScore: 5 })).toMatchObject({
      label: "조용",
      tone: "quiet",
    });
    expect(verdictBalance({ stance: "watch" })).toMatchObject({ label: "신호 혼조" });
  });

  it("uses an honest loading state when fomo data is missing", () => {
    expect(discoveryStatus(undefined)).toMatchObject({ label: "신호 확인 중", tone: "quiet" });
    expect(verdictBalance(undefined)).toBeUndefined();
  });
});

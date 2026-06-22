/**
 * Heat 구조화 로거 테스트 (#415).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { logHeatError, logHeatWarning, drainLogBuffer, peekLogBuffer } from "../src/index-engine/logger";

beforeEach(() => {
  drainLogBuffer();
});

describe("logHeatError", () => {
  it("에러를 구조화해 버퍼에 적재", () => {
    logHeatError("marketHeat", "test error", new Error("boom"));
    const entries = peekLogBuffer();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.level).toBe("ERROR");
    expect(entries[0]!.heatKey).toBe("marketHeat");
    expect(entries[0]!.fallbackUsed).toBe(true);
    expect(entries[0]!.error).toBe("boom");
    expect(entries[0]!.timestamp).toBeTruthy();
  });

  it("Error 외 타입도 문자열로 저장", () => {
    logHeatError("whaleHeat", "non-error", 42);
    expect(peekLogBuffer()[0]!.error).toBe("42");
  });
});

describe("logHeatWarning", () => {
  it("WARNING 레벨로 적재, fallbackUsed=false", () => {
    logHeatWarning("communityHeat", "partial data");
    const entries = peekLogBuffer();
    expect(entries[0]!.level).toBe("WARNING");
    expect(entries[0]!.fallbackUsed).toBe(false);
  });
});

describe("drainLogBuffer", () => {
  it("버퍼를 비우고 반환", () => {
    logHeatError("a", "x", null);
    logHeatWarning("b", "y");
    const drained = drainLogBuffer();
    expect(drained).toHaveLength(2);
    expect(peekLogBuffer()).toHaveLength(0);
  });
});

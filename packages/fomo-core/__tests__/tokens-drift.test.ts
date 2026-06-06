import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { EMOTION_COLORS, EMOTION_TYPES } from "../src/types";

// design/tokens.json(DTCG, 디자인 단일 소스)의 감정색이 @fomo/core EMOTION_COLORS와
// 어긋나지 않도록 강제한다. Figma 왕복/디자인 변경 시 두 소스가 갈라지는 것을 차단.
const tokensPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../design/tokens.json");
const tokens = JSON.parse(readFileSync(tokensPath, "utf8")) as {
  color: { emotion: Record<string, { $value: string }> };
};

describe("design/tokens.json ↔ @fomo/core 드리프트 가드", () => {
  it("감정색 5종이 tokens.json과 EMOTION_COLORS에서 동일하다", () => {
    for (const e of EMOTION_TYPES) {
      expect(tokens.color.emotion[e]?.$value?.toUpperCase()).toBe(EMOTION_COLORS[e].toUpperCase());
    }
  });

  it("tokens.json 감정색은 EMOTION_TYPES와 정확히 같은 키를 가진다", () => {
    expect(Object.keys(tokens.color.emotion).sort()).toEqual([...EMOTION_TYPES].sort());
  });
});

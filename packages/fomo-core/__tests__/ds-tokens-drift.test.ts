import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// DS-00(v2) 기반 토큰의 단일성 가드. 정본은 docs/design/DS-00_TOKENS.md,
// 기계가독 소스는 design/tokens.json 의 `ds` 블록. 코드(Tailwind/fomoTheme)가
// 문서와 갈라지면 실패시킨다. (DS-00 §8 lint 게이트의 1단계)
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

type Ds = {
  color: Record<string, { $value: string }>;
  spacing: Record<string, { $value: string }>;
  radius: Record<string, { $value: string }>;
};
const ds = (JSON.parse(read("design/tokens.json")) as { ds: Ds }).ds;
const tailwind = read("apps/fomo-web/tailwind.config.ts");
const nativeTheme = read("apps/fomo-club/constants/fomoTheme.ts");

const hexes = (o: Record<string, { $value: string }>) =>
  Object.entries(o).filter(([k]) => !k.startsWith("$"));

describe("DS-00 토큰 ↔ 코드 드리프트 가드", () => {
  it("ds.color 10종이 tokens.json에 그대로 있다", () => {
    expect(hexes(ds.color).map(([k]) => k).sort()).toEqual(
      [
        "accent",
        "accent-ink",
        "bg",
        "border",
        "down",
        "surface-1",
        "surface-2",
        "text-1",
        "text-2",
        "text-3",
      ].sort(),
    );
  });

  for (const [name, { $value }] of hexes(ds.color)) {
    it(`ds.color.${name} = ${$value} 가 웹/네이티브 양쪽 토큰에 있다`, () => {
      expect(tailwind).toContain($value);
      expect(nativeTheme).toContain($value);
    });
  }

  it("간격은 4의 배수만이고 웹 Tailwind spacing에 s1~s6가 있다", () => {
    for (const [name, { $value }] of hexes(ds.spacing)) {
      const px = Number($value.replace("px", ""));
      expect(px % 4, `${name}=${$value}`).toBe(0);
    }
    for (const s of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      expect(tailwind).toMatch(new RegExp(`${s}:\\s*"`));
    }
  });

  it("카드 16 / 블록 10 / pill 999 radius가 양쪽에 있다", () => {
    expect(ds.radius.card.$value).toBe("16px");
    expect(ds.radius.block.$value).toBe("10px");
    expect(tailwind).toContain('block: "10px"');
    expect(nativeTheme).toContain("block: 10");
  });

  it("빨강/초록 등락색은 ds에 존재하지 않는다 (DS-00 §7)", () => {
    const banned = ["#FF4D4D", "#4D8DFF", "#3FB984"];
    const dsHexes = hexes(ds.color).map(([, v]) => v.$value.toUpperCase());
    for (const b of banned) expect(dsHexes).not.toContain(b);
  });
});

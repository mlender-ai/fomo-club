import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * LAUNCH-P1 §A — **공유 카드·검색 결과가 피봇 이전 제품을 말하지 않는다.**
 *
 * 2026-09-08 프로덕션 head 실측:
 *
 * ```
 * <title>FOMO Club</title>                                  ← 맞았다
 * og:title  FOMO Club — 주식시장의 틴더                       ← 틀렸다
 * description 종목을 스와이프하며 내 취향의 종목을 발견하고…    ← 틀렸다
 * og:image  (없음)                                           ← 링크 공유 시 그림이 안 뜬다
 * ```
 *
 * 본문 헤드는 이미 `오늘의 조용한 돈` 이었다. **화면과 메타가 다른 제품을 말하고 있었고**
 * 링크를 공유하면 첫인상이 메타로 결정된다 — 그래서 코드 모양으로 회귀를 막는다.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** 주석은 화면에 안 나간다 — 규칙을 적어둔 글이 위반으로 잡히면 안 된다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 피봇 이전 포지셔닝의 말. `스와이프` 는 동작 설명으로도 못 쓰게 한다 — 메타에는 동작을 안 적는다. */
const PRE_PIVOT = ["틴더", "취향", "스와이프", "발견"];

const SURFACES: ReadonlyArray<[string, string]> = [
  ["layout.tsx", "../app/layout.tsx"],
  ["manifest.ts", "../app/manifest.ts"],
  ["privacy/page.tsx", "../app/privacy/page.tsx"],
  ["terms/page.tsx", "../app/terms/page.tsx"],
];

describe("출시 메타데이터 (LAUNCH-P1 완료 확인 1·2·3)", () => {
  it("메타·매니페스트·법무 문서에 피봇 이전 문구가 없다", () => {
    const offenders: string[] = [];
    for (const [name, path] of SURFACES) {
      const src = stripComments(read(path));
      for (const word of PRE_PIVOT) if (src.includes(word)) offenders.push(`${name} → ${word}`);
    }
    expect(offenders, `피봇 이전 문구가 남아 있다:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("제목은 화면 본문과 같은 말을 한다 — 어느 쪽이 거짓이면 안 된다", () => {
    /** 금칙어 검사는 **주석을 지운 뒤** 한다 — 규칙을 설명하려고 금칙어를 인용한 주석이 있다. */
    const layout = stripComments(read("../app/layout.tsx"));
    expect(layout).toContain('default: "FOMO Club"');
    expect(layout).toContain("FOMO Club — 오늘의 조용한 돈");
    // 설명은 이미 일어난 사실만 말한다(§5.1 예측 금지선).
    expect(layout).toContain("뉴스가 나기 전에 돈이 먼저 들어간 종목을 찾아 보여드려요");
    for (const banned of ["곧 오른다", "급등", "임박", "수익 보장", "추천"]) {
      expect(layout, banned).not.toContain(banned);
    }
  });

  it("공유 카드에 그림이 붙어 있다 — 없으면 아이콘만 떠서 무슨 앱인지 안 보인다", () => {
    const layout = read("../app/layout.tsx");
    expect(layout).toContain('url: "/og.png", width: 1200, height: 630');
    expect(layout).toContain('card: "summary_large_image"');
    /**
     * 절대 주소로 나가야 한다 — `metadataBase` 가 없으면 배포마다 호스트가 바뀌고,
     * 공유 카드가 지난 배포의 그림을 가리킨다.
     */
    expect(layout).toContain("metadataBase: new URL(");
    expect(layout).toContain("fomo-web-mlender-ais-projects.vercel.app");
    // 그림 파일이 실제로 레포에 있어야 한다 — 선언만 하고 파일이 없으면 깨진 카드가 뜬다.
    const png = readFileSync(new URL("../public/og.png", import.meta.url));
    expect(png.length).toBeGreaterThan(1000);
    // PNG 시그니처 + IHDR 의 폭·높이(빅엔디안). 1200×630 이 아니면 플랫폼이 잘라 버린다.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("매니페스트와 메타가 같이 움직인다 — 한쪽만 고치면 앱 심사에서 불일치로 잡힌다", () => {
    const manifest = read("../app/manifest.ts");
    expect(manifest).toContain("FOMO Club — 오늘의 조용한 돈");
    expect(manifest).toContain("뉴스가 나기 전에 돈이 먼저 들어간 종목을 찾아 보여드려요");
  });
});

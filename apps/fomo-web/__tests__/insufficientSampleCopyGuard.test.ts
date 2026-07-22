import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function tsxFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("표본 부족 UI 문구 가드", () => {
  it("컴포넌트와 앱 화면에 내부 표본 표기나 축적 상태를 노출하지 않는다", () => {
    const roots = [
      fileURLToPath(new URL("../components", import.meta.url)),
      fileURLToPath(new URL("../app", import.meta.url)),
    ];
    for (const file of roots.flatMap(tsxFiles)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("축적 중");
      expect(source, file).not.toMatch(/(?:^|[\s·(])n=/m);
    }
  });
});

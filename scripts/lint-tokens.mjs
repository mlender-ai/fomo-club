/**
 * 하드코딩된 색을 잡는다 (UI-01 A-3 · 완료확인 2).
 *
 * > **하드코딩된 색이 하나라도 있으면 lint 실패.**
 *
 * 어두운 테마를 나중에 만들 수 있는 유일한 조건이 이것이다 — 색이 토큰 한 곳에만
 * 있어야 값만 바꿔서 뒤집을 수 있다. 화면 코드에 `#0052FF` 가 하나라도 박히면
 * 그 자리는 영원히 밝은 테마다.
 *
 * ## 무엇을 보나
 *
 *   apps/web/app/**.css        `:root` 블록만 예외
 *   apps/web/app/**.tsx
 *   apps/web/components/**.tsx
 *
 * `packages/dormant` 는 보지 않는다 — 폐기된 소비자 제품이다.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** `#abc` · `#aabbcc` · `rgb(...)` · `hsl(...)`. */
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;

/** 색이 아닌 `#` 쓰임새. 앵커·주석의 이슈 번호·SVG id 참조 등. */
function isColor(line, index) {
  const before = line.slice(Math.max(0, index - 12), index);
  if (/url\(#$/.test(before)) return false; // SVG 참조: url(#ui-area-fill)
  if (/href="#$/.test(before)) return false;
  return true;
}

function files() {
  const pats = [
    "apps/web/app/**/*.css",
    "apps/web/app/**/*.tsx",
    "apps/web/components/**/*.tsx",
  ];
  const out = new Set();
  for (const p of pats) {
    for (const f of globSync(p, { cwd: ROOT })) out.add(join(ROOT, f));
  }
  return [...out].sort();
}

const problems = [];

for (const file of files()) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  // `:root { ... }` 안은 토큰 정의 자리다. 거기서만 색이 허용된다.
  let inRoot = false;
  let depth = 0;

  lines.forEach((line, i) => {
    if (!inRoot && /^\s*:root\b[^{]*\{/.test(line)) {
      inRoot = true;
      depth = 1;
      return;
    }
    if (inRoot) {
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (depth <= 0) inRoot = false;
      return;
    }
    // 등폭 폰트 스택 같은 건 색이 아니다. 주석 줄도 넘어간다.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

    for (const m of line.matchAll(COLOR)) {
      if (!isColor(line, m.index ?? 0)) continue;
      problems.push({
        file: file.replace(`${ROOT}/`, ""),
        line: i + 1,
        text: line.trim().slice(0, 100),
      });
    }
  });
}

if (problems.length > 0) {
  console.error(`하드코딩된 색 ${problems.length}곳 — 토큰(:root)으로 옮긴다.\n`);
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.text}`);
  console.error("\n어두운 테마는 토큰 값만 바꿔서 만든다. 여기 박히면 그 자리는 영원히 밝다.");
  process.exit(1);
}

console.log("하드코딩된 색 없음.");

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * **조사를 고정으로 박지 않는다** — 이 레포에서 네 번 반복된 실수다.
 *
 * ```
 * 코스닥는 빠지는데            (2026-08-27)
 * 시장 대비이 사기 시작했어요   (2026-08-27)
 * 전자장비와기기으로 들어오고   (2026-08-29)
 * 국제 유가이 3일째 내리고      (2026-08-30)
 * ```
 *
 * 전부 **값을 문자열에 끼운 바로 뒤에 조사를 붙여** 생긴 일이다. 그 값이 무엇이 될지
 * 미리 알 수 없으므로(업종·지수·지표 이름) 고정 조사는 **반드시 어딘가에서 틀린다.**
 *
 * 그래서 코드 모양으로 막는다: `${...}` 바로 뒤에 조사가 오면 실패한다.
 * `josa(...)` 를 쓰라는 뜻이다.
 */

/** 보간 바로 뒤에 오면 안 되는 조사. 받침 유무로 갈리는 것만 — `의`·`도`는 안 갈린다. */
const STICKY = ["은", "는", "이", "가", "을", "를", "과", "와", "으로", "로", "이나", "나", "이라", "라"];

function tsFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : tsFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".d.ts") ? [path] : [];
  });
}

/** 주석은 화면에 안 나간다 — 규칙을 적어둔 글이 위반으로 잡히면 안 된다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("조사를 고정으로 박지 않는다 (네 번 반복된 실수)", () => {
  it("`${값}` 바로 뒤에 조사가 오는 곳이 없다 — `josa()` 를 써라", () => {
    const root = new URL("../src", import.meta.url).pathname;
    const offenders: string[] = [];

    for (const file of tsFiles(root)) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const [i, line] of src.split("\n").entries()) {
        /**
         * `new RegExp(...)` 안의 문자열은 **출력이 아니라 패턴**이다 — 원문에 있는 조사를
         * 그대로 적어야 매칭된다. 여기서 `josa()` 를 쓰면 오히려 안 잡힌다.
         */
        if (/new RegExp\(/.test(line)) continue;
        for (const p of STICKY) {
          // `}` 바로 뒤 조사 + 그 뒤가 공백·문장부호·따옴표·백틱이면 조사로 쓰인 것이다.
          const re = new RegExp(`\\}${p}(?=[\\s.,!?)\`"']|\\\\n)`);
          if (re.test(line)) {
            offenders.push(`${file.split("/").pop()}:${i + 1}  …}${p}  ${line.trim().slice(0, 70)}`);
            break;
          }
        }
      }
    }
    expect(offenders, `보간 뒤 고정 조사 — josa() 로 바꿔라:\n${offenders.join("\n")}`).toEqual([]);
  });
});

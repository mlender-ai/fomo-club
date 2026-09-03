import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * FIX-01 — **화면 문장 전체를 훑는 게이트.**
 *
 * 개별 컴포넌트 테스트는 자기가 아는 문장만 본다. 지시서가 잡은 문제(모순·중복·주어
 * 없음·영어)는 **어느 화면에서든 다시 생길 수 있는 종류**라, 소스 전체에서 스캔한다.
 *
 * 주석은 지우고 본다 — 이 저장소는 「종전에는 이랬다」를 주석으로 남기므로 옛 문구가
 * 글자로는 남아 있다. 세야 하는 것은 화면에 그려지는 문자열이다.
 */
const ROOTS = ["../components", "../lib", "../app"].map((r) => fileURLToPath(new URL(r, import.meta.url)));

function sources(): { file: string; code: string }[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p)) files.push(p);
    }
  };
  for (const root of ROOTS) walk(root);
  return files.map((file) => ({
    file,
    code: readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
  }));
}

/** 한글이 든 문자열 리터럴 — 화면에 나갈 후보다. */
function koreanLiterals(code: string): string[] {
  return [...code.matchAll(/[`"']([^`"'\n]*[가-힣][^`"'\n]*)[`"']/g)].map((m) => m[1]!);
}

describe("[FIX-01 F] 「닿는다」를 쓰지 않는다 — 무슨 뜻인지 전달되지 않았다", () => {
  it("거시 화면 문장에 `닿` 이 없다", () => {
    const offenders: string[] = [];
    for (const { file, code } of sources()) {
      for (const line of koreanLiterals(code)) {
        // `닿는 자리`(개발자용 비유)가 아니라 화면 문장만 본다: 종목·지표를 말하는 줄.
        if (/닿/.test(line) && /종목|지표|곳/.test(line)) offenders.push(`${file}: ${line}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("`영향받` 이 그 자리를 대신한다", () => {
    const macro = sources().find((s) => s.file.endsWith("MacroDepth.tsx"))!;
    expect(macro.code).toContain("에 영향받는 종목");
    expect(macro.code).toContain("우리가 최근 30일에 짚은");
  });
});

describe("[FIX-01 E] 영어를 화면에 그대로 두지 않는다", () => {
  /**
   * 업종명은 서버가 표시명으로 바꿔 보낸다(`industryDisplayLabel`). 화면이 원문을 다시
   * 꺼내 쓰면 그 일이 헛것이 되므로, 컴포넌트가 `classification.industry` 를 직접
   * 그리지 않는지 본다.
   */
  it("화면이 팩트시트 업종 원문을 직접 그리지 않는다", () => {
    const offenders: string[] = [];
    for (const { file, code } of sources()) {
      if (/classification\??\.industry/.test(code)) offenders.push(file);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("업종 표시명 표와 미분류 목록이 fomo-core 에 있다", async () => {
    const { industryDisplayLabel, untranslatedIndustryNames } = await import(
      "../../../packages/fomo-core/src/keyword-cards/sector-display"
    );
    expect(industryDisplayLabel("Major Banks")).toBe("은행");
    expect(industryDisplayLabel("Medical/Nursing Services")).toBe("의료서비스");
    // 표에 없으면 `null` — 영어를 내보내지도, 이름을 지어내지도 않는다.
    expect(industryDisplayLabel("Widget Polishing")).toBeNull();
    expect(untranslatedIndustryNames(["Widget Polishing", "Major Banks", "제약"])).toEqual(["Widget Polishing"]);
  });
});

describe("[FIX-01 A] 한 화면 줄에 정반대 말이 같이 있지 않다", () => {
  /** 어간까지 본다 — `/늘/` 만 쓰면 `오늘` 이 걸려 검사가 엉뚱한 곳에서 울린다. */
  const OPPOSITES: ReadonlyArray<readonly [RegExp, RegExp, string]> = [
    [/늘(어|었|고|린)/, /줄(어|었|고|인)/, "늘 ↔ 줄"],
    [/높(아|은|았)/, /낮(아|은|았)/, "높 ↔ 낮"],
    [/오르|올랐/, /내리|내렸/, "오르 ↔ 내리"],
  ];

  it("반대 말이 한 줄에 있으면 **주어가 둘**이다", () => {
    const offenders: string[] = [];
    for (const { file, code } of sources()) {
      for (const line of koreanLiterals(code)) {
        for (const [up, down, pair] of OPPOSITES) {
          if (!up.test(line) || !down.test(line)) continue;
          /**
           * 두 주어를 각각 붙인 문장(`매출은 늘었는데 영업이익은 줄었어요`)과
           * 「어느 쪽인지 모른다」를 밝히는 문장(`늘었는지 줄었는지는 …`)은 모순이 아니다.
           */
          const twoSubjects = /매출.*(영업)?이익|이익.*매출/.test(line);
          const admitsUnknown = /는지/.test(line);
          if (!twoSubjects && !admitsUnknown) offenders.push(`${file} [${pair}] ${line}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

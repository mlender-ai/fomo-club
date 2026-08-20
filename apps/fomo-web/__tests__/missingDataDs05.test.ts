import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isTrustedSector, trustedSector } from "../lib/sectorTrust";
import { normalizeCompanyName } from "@fomo/core";
import { subjectName } from "../lib/companyDisplay";

/**
 * DS-05 결손·빈 상태 — **이 제품은 결손이 정상 상태다.**
 *
 * 화면 파일 전체를 스캔한다. 한 화면만 고치고 다음 화면에서 같은 패턴이 다시 생기는 것이
 * 이 문서가 막으려는 것이다.
 */

function tsxFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** 픽 표면 = DS-01~04 가 정본인 화면들. 레거시(KeywordDepthPage 등)는 해당 DS 문서 도착 후. */
const DS_SCREENS = [
  "../components/QuietPickCard.tsx",
  "../components/QuietPickDeck.tsx",
  "../components/QuietPickDepth.tsx",
  "../components/MyRecordTab.tsx",
  "../app/track-record/page.tsx",
] as const;

const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (path: string) => code(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("완료 기준 3 — 신뢰 불가 섹터는 표시되지 않는다 (§4)", () => {
  it("테마·거시 라벨은 섹터가 아니다", () => {
    for (const label of ["코인", "코인 관련", "환율", "금리", "유가", "비트코인", "관세"]) {
      expect(isTrustedSector(label), label).toBe(false);
    }
  });

  it("정보 없는 폴백도 거른다", () => {
    for (const label of ["기타 업종", "기타", "미국주식", "미분류", "-"]) {
      expect(isTrustedSector(label), label).toBe(false);
    }
  });

  it("실제 섹터는 통과한다", () => {
    for (const label of ["방산", "2차전지", "반도체", "스포츠화", "미디어·레저", "은행"]) {
      expect(isTrustedSector(label), label).toBe(true);
    }
  });

  it("빈 값·과도하게 긴 문장은 섹터가 아니다", () => {
    expect(trustedSector(undefined)).toBeUndefined();
    expect(trustedSector("   ")).toBeUndefined();
    expect(trustedSector("전술통신장비와 시스템을 만들어 방위사업청에 납품하는 회사")).toBeUndefined();
  });

  it("카드·상세가 게이트를 통과한 값만 그린다", () => {
    for (const path of ["../components/QuietPickCard.tsx", "../components/QuietPickDepth.tsx"]) {
      const source = read(path);
      expect(source, path).toContain("trustedSector(pick.subject.identity)");
      // 원본 identity 를 직접 그리지 않는다.
      expect(source, path).not.toMatch(/\{pick\.subject\.identity\}/);
    }
  });
});

describe("§4-2 — 종목명 축약이 회사 인지를 방해하지 않는다", () => {
  it("`On Holding AG` 를 `On` 으로 줄이지 않는다", () => {
    expect(normalizeCompanyName("On Holding AG")).toBe("On Holding");
  });

  it("법인 접미는 그대로 지운다", () => {
    expect(normalizeCompanyName("Angel Studios, Inc.")).toBe("Angel Studios");
    expect(normalizeCompanyName("Columbia Financial, Inc./Md/")).toBe("Columbia Financial");
    expect(normalizeCompanyName("Gbank Financial Holdings Inc.")).toBe("Gbank Financial");
  });

  it("한글 사명은 손대지 않는다", () => {
    expect(normalizeCompanyName("빅텍")).toBe("빅텍");
    expect(normalizeCompanyName("한화투자증권")).toBe("한화투자증권");
  });
});

describe("완료 기준 1·2 — 빈 헤더·자기모순·값 없는 대시가 없다 (§3)", () => {
  it("모든 DS 화면 섹션이 조건부로 그려진다 (빈 헤더 금지)", () => {
    for (const path of DS_SCREENS) {
      const source = read(path);
      const sections = source.match(/<Section title=/g) ?? [];
      if (sections.length === 0) continue;
      // 각 Section 사용처는 조건부 렌더 안에 있다 — `{cond && (` 또는 `{cond ? (`.
      const guarded = source.match(/\{[^}]*&&\s*\(\s*<Section/g) ?? [];
      const always = sections.length - guarded.length;
      // 결론 섹션처럼 항상 있는 것은 없다(모든 섹션이 데이터 유무에 달렸다).
      expect(always, `${path}: 조건 없는 Section ${always}개`).toBeLessThanOrEqual(1);
    }
  });

  it("자기모순 문구가 없다 — 못 준다고 하고 보라고 하지 않는다", () => {
    for (const path of DS_SCREENS) {
      const source = read(path);
      expect(source, path).not.toContain("계산할 만큼의 이력이 확보되지");
      expect(source, path).not.toMatch(/밴드를.*보세요/);
    }
  });

  it("값 없는 대시·`아직` 반복이 없다", () => {
    for (const path of DS_SCREENS) {
      const source = read(path);
      expect(source, path).not.toMatch(/:\s*"—"/); // 폴백 대시
      expect(source, path).not.toContain('"아직"');
      expect(source, path).not.toContain("7일 아직");
    }
  });

  it("미확보를 0 으로 표시하지 않는다 — 리스크 0건 ≠ 리스크 없음", () => {
    const depth = read("../components/QuietPickDepth.tsx");
    expect(depth).toContain("unavailable_text");
    expect(depth).not.toMatch(/리스크 0건/);
  });
});

describe("완료 기준 6 — 오류 문구에 기술 용어가 없다 (§6)", () => {
  it("DS 화면은 `불러오지 못했어요` 대신 §6 문구를 쓴다", () => {
    for (const path of DS_SCREENS) {
      expect(read(path), path).not.toContain("불러오지 못했어요");
    }
  });

  const TECH = ["Error:", "error:", "exception", "stack", "status code", "500", "503", "undefined", "null 반환"];

  it("DS 화면의 사용자 문구에 기술 용어가 없다", () => {
    for (const path of DS_SCREENS) {
      const source = read(path);
      // 화면에 나가는 한국어 문장만 본다(따옴표 안의 한글 문자열).
      const strings = source.match(/"[^"]*[가-힣][^"]*"/g) ?? [];
      for (const text of strings) {
        for (const term of TECH) {
          expect(text.includes(term), `${path}: ${text}`).toBe(false);
        }
      }
    }
  });

  it("연결 실패와 서버 오류를 구분한다", () => {
    const deck = read("../components/QuietPickDeck.tsx");
    expect(deck).toContain("연결이 끊겼어요");
    expect(deck).toContain("잠시 후 다시 열어주세요");
    expect(deck).toContain("navigator.onLine === false");
    expect(deck).toContain("다시 시도");
  });
});

describe("완료 기준 5 — 스켈레톤이 있고 스피너가 없다 (§5)", () => {
  it("덱·상세·성적표에 스켈레톤이 있다", () => {
    expect(read("../components/QuietPickDeck.tsx")).toContain('data-testid="deck-skeleton"');
    expect(read("../components/QuietPickDepth.tsx")).toContain('data-testid="depth-skeleton"');
    expect(read("../app/track-record/page.tsx")).toContain('data-testid="scorecard-skeleton"');
  });

  it("최소 표시 시간 300ms — 깜빡임을 막는다", () => {
    expect(read("../components/QuietPickDeck.tsx")).toMatch(/300 - \(Date\.now\(\) - startedAt\)/);
  });

  it("DS 화면에 스피너가 없다", () => {
    for (const path of DS_SCREENS) {
      const source = read(path);
      for (const spinner of ["FlickerSpinner", "FullPageLoading", "animate-spin", "Spinner"]) {
        expect(source.includes(spinner), `${path}: ${spinner}`).toBe(false);
      }
    }
  });
});

describe("완료 기준 7 — `아직 못 찾았어요`(미확보)와 `없어요`(부재)를 구분한다", () => {
  it("종목 고유 리스크는 미확보로 말한다", () => {
    expect(read("../components/QuietPickDepth.tsx")).toContain("아직 못 찾았어요");
  });

  it("픽 0장은 부재로 말한다", () => {
    expect(read("../components/QuietPickDeck.tsx")).toContain("오늘은 기준을 넘은 곳이 없어요");
  });
});

describe("완료 기준 8 — 덱이 짧은 날 개수를 그대로 표시한다 (§7)", () => {
  it("개수를 숨기지 않고, 3장 미만이면 적었다고 말한다", () => {
    const deck = read("../components/QuietPickDeck.tsx");
    expect(deck).toContain("{count}곳");
    expect(deck).toContain("오늘은 조용한 곳이 적었어요");
    expect(deck).toContain("count < THIN_DECK");
  });
});

describe("§3 금지 문구 전수 스캔 (components/app 전체)", () => {
  /**
   * `불러오지 못했어요` 는 DS 화면에서만 막는다 — 레거시 피드(`FeedView`)는 아직 DS 정본이
   * 없다. DS-05 §6 문구(`연결이 끊겼어요` / `잠시 후 다시 열어주세요`)로 통일하는 것은
   * 그 화면의 DS 문서가 올 때다.
   */
  /**
   * 사용자에게 나가는 한국어 문구만 본다. `Error:` 같은 영문 토큰은 변수명(`lastError`)과
   * 구분이 안 돼 오탐이 난다 — 기술 용어는 §6 테스트가 문자열 리터럴 안에서만 검사한다.
   */
  const FORBIDDEN = ["아직 없어요", "준비 중이에요", "생성 중이에요", "축적 중", "정보가 없습니다"];

  it("어느 화면에도 금칙 상태 문구가 없다", () => {
    const roots = [
      fileURLToPath(new URL("../components", import.meta.url)),
      fileURLToPath(new URL("../app", import.meta.url)),
    ];
    for (const file of roots.flatMap(tsxFiles)) {
      const source = code(readFileSync(file, "utf8"));
      for (const phrase of FORBIDDEN) {
        expect(source.includes(phrase), `${file} 에 "${phrase}"`).toBe(false);
      }
    }
  });
});

describe("§4-2 — 구워진 과잉 축약 이름을 읽는 쪽에서 되살린다", () => {
  it("payload 가 `On` 을 줘도 화면은 `On Holding` 을 쓴다", () => {
    const subject = { canonical: "On Holding AG", displayName: "On", symbol: "ONON", country: "US" as const, market: "NYSE" };
    expect(subjectName(subject as never)).toBe("On Holding");
  });

  it("구운 값이 이미 온전하면 그대로 쓴다 — 전 화면 동일 값 보장", () => {
    const subject = { canonical: "Angel Studios, Inc.", displayName: "Angel Studios", symbol: "ANGX", country: "US" as const, market: "NASDAQ" };
    expect(subjectName(subject as never)).toBe("Angel Studios");
  });

  it("접두가 다른 값은 건드리지 않는다 — 데이터 계층 결정을 뒤집지 않는다", () => {
    const subject = { canonical: "Hanwha Investment & Securities", displayName: "한화투자증권", country: "KR" as const, market: "KOSPI", naverCode: "003530" };
    expect(subjectName(subject as never)).toBe("한화투자증권");
  });
});

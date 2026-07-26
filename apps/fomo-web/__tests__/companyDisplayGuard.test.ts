import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalName, subjectName, subjectTicker } from "../lib/companyDisplay";

/**
 * WO-P6 ③ 가드 — 회사명은 화면마다 달라지면 안 된다.
 * canonical 은 원장 조인 키(원문 보존)이고, 사람이 읽는 자리에는 정규화된 이름만 나간다.
 * 사람 눈에 닿는 canonical 렌더를 소스에서 스캔해 새 유출을 막는다.
 */

const COMPONENTS = join(__dirname, "..", "components");

/** JSX 텍스트 자리에 canonical 을 그대로 찍는 패턴({row.canonical}, <b>{x.canonical}</b> 등). */
const RAW_RENDER = />\s*\{[\w.?\[\]]*\bcanonical\b[\w.?\[\]]*\}/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}

describe("정규화 규칙 — 단일 창구", () => {
  it("미국 법인 접미사·주(州) 꼬리를 뗀다", () => {
    expect(canonicalName("Columbia Financial, Inc./Md/")).toBe("Columbia Financial");
    expect(canonicalName("Apple Inc.")).toBe("Apple");
  });

  it("한글 사명은 건드리지 않는다", () => {
    expect(canonicalName("삼성전자")).toBe("삼성전자");
    expect(canonicalName("한미반도체")).toBe("한미반도체");
  });

  it("데이터 계층이 정규화한 displayName 이 있으면 그 값을 그대로 쓴다(화면 간 동일 값)", () => {
    const subject = {
      canonical: "Columbia Financial, Inc./Md/",
      displayName: "Columbia Financial",
      ticker: "CLBK",
      symbol: "CLBK",
      market: "NASDAQ",
      country: "US" as const,
    };
    expect(subjectName(subject)).toBe("Columbia Financial");
    expect(subjectTicker(subject)).toBe("CLBK");
  });

  it("displayName 이 없어도 같은 결과로 떨어진다(구버전 응답 호환)", () => {
    const subject = {
      canonical: "Columbia Financial, Inc./Md/",
      symbol: "CLBK",
      market: "NASDAQ",
      country: "US" as const,
    };
    expect(subjectName(subject)).toBe("Columbia Financial");
    expect(subjectTicker(subject)).toBe("CLBK");
  });

  it("KR 은 6자리 종목코드를 티커로 병기한다", () => {
    const subject = { canonical: "한미반도체", naverCode: "042700", market: "KOSPI", country: "KR" as const };
    expect(subjectName(subject)).toBe("한미반도체");
    expect(subjectTicker(subject)).toBe("042700");
  });
});

describe("화면 스캔 — 원문 canonical 이 텍스트로 새지 않는다", () => {
  it("컴포넌트 어디에서도 canonical 을 그대로 렌더하지 않는다", () => {
    const leaks = tsxFiles(COMPONENTS).filter((file) => RAW_RENDER.test(readFileSync(file, "utf8")));
    expect(leaks.map((f) => f.split("/").pop())).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { INVESTORS } from "../../lib/investor-collect";

/**
 * **누가 샀는지 틀리면 이 기능 전체가 무의미하다.**
 *
 * 처음에 적은 코투 CIK 는 ADAGE CAPITAL 이었다(2026-08-27 실측 — 638종목 중 322종목이
 * 티커 미해석이라 이상해서 SEC 등록명을 확인하고 잡았다). CIK 는 손으로 적는 값이라
 * 같은 실수가 또 난다 — 확인한 등록명을 코드 옆에 남겨 다음 사람이 대조할 수 있게 한다.
 */
const src = readFileSync(new URL("../../lib/investor-collect.ts", import.meta.url), "utf8");

/** SEC 등록명 실측 (2026-08-27, `data.sec.gov/submissions/CIK*.json` 의 `name`). */
const VERIFIED: Record<string, string> = {
  "0001067983": "BERKSHIRE HATHAWAY INC",
  "0001336528": "Pershing Square Capital Management, L.P.",
  "0001649339": "Scion Asset Management, LLC",
  "0001656456": "Appaloosa LP",
  "0001167483": "TIGER GLOBAL MANAGEMENT LLC",
  "0001135730": "COATUE MANAGEMENT LLC",
  "0001040273": "Third Point LLC",
  "0001061768": "BAUPOST GROUP LLC/MA",
  "0001079114": "GREENLIGHT CAPITAL INC",
  "0000921669": "ICAHN CARL C",
  "0001536411": "Duquesne Family Office LLC",
};

describe("인물 CIK — 확인한 것만 쓴다", () => {
  it("모든 13F 인물의 CIK 가 실측 목록에 있다", () => {
    for (const investor of INVESTORS) {
      if (investor.source !== "13f") continue;
      expect(investor.cik, investor.id).toBeTruthy();
      expect(VERIFIED[investor.cik!], `${investor.id} (${investor.cik}) — SEC 등록명을 확인하고 목록에 넣어라`).toBeTruthy();
    }
  });

  it("코투는 ADAGE 가 아니다 — 한 번 틀렸던 자리다", () => {
    const coatue = INVESTORS.find((i) => i.id === "philippe-laffont");
    expect(coatue?.cik).toBe("0001135730");
    expect(coatue?.cik).not.toBe("0001165408");
  });

  it("CIK 가 겹치지 않는다 — 두 사람이 같은 제출자를 가리키면 하나는 틀린 것이다", () => {
    const ciks = INVESTORS.filter((i) => i.cik).map((i) => i.cik!);
    expect(new Set(ciks).size).toBe(ciks.length);
  });

  it("WO §A-1 이 요구한 10명 이상이다 (완료 확인 1)", () => {
    expect(INVESTORS.length).toBeGreaterThanOrEqual(10);
  });

  it("ARK 는 매일 나오는 소스로 잡혀 있다 (완료 확인 2)", () => {
    const wood = INVESTORS.find((i) => i.id === "cathie-wood");
    expect(wood?.source).toBe("ark");
    expect(wood?.arkFunds?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("SEC 요청 간격 — 없으면 뒤쪽 인물이 통째로 실패한다", () => {
  it("제출목록·디렉터리·보유표 조회 앞에 간격을 둔다", () => {
    expect(src).toContain("const SEC_GAP_MS = 150;");
    expect((src.match(/await sleep\(SEC_GAP_MS\);/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

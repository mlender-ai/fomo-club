import { describe, expect, it } from "vitest";

/**
 * 지주회사 프로브 판정 로직 (02R B1).
 *
 * 실측에서 첫 판정이 `path2_ok` 로 나왔는데 **그렇게 읽을 수 없는 결과였다.**
 * POSCO홀딩스 `2411`(제철)·두산 `26221`(전자부품)이 지주군 단독으로 나왔지만,
 * 시장에는 철강 54종목·전자장비 97종목이 있어 그 코드를 플래그로 쓰면 제조사를 대량 오탐한다.
 * "비지주 표본과 겹치지 않았다"는 것은 표본 16개가 그 업종을 안 담았다는 뜻일 뿐이다.
 *
 * 그래서 **2회 이상 재현된 코드만** 플래그로 인정한다. 이 테스트가 그 규칙을 고정한다.
 */

type Expected = "지주" | "비지주";
interface Row {
  expected: Expected;
  induty_code: string | null;
}

/** `holding-probe.ts` 의 판정 규칙을 그대로 옮긴 순수 함수 — 규칙을 테스트로 고정하기 위함이다. */
function judge(rows: readonly Row[]): { verdict: string; flagCodes: string[]; inconclusive: string[] } {
  const nonHolding = new Set(
    rows.filter((r) => r.expected === "비지주" && r.induty_code !== null).map((r) => r.induty_code!)
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.expected !== "지주" || row.induty_code === null) continue;
    counts.set(row.induty_code, (counts.get(row.induty_code) ?? 0) + 1);
  }
  const flagCodes = [...counts.entries()].filter(([c, n]) => n >= 2 && !nonHolding.has(c)).map(([c]) => c).sort();
  const inconclusive = [...counts.entries()].filter(([, n]) => n < 2).map(([c]) => c).sort();
  const samples = rows.filter((r) => r.expected === "지주").length;
  const covered = rows.filter(
    (r) => r.expected === "지주" && r.induty_code !== null && flagCodes.includes(r.induty_code)
  ).length;
  const verdict =
    flagCodes.length === 0 ? "path2_unavailable" : covered === samples ? "path2_ok" : "path2_partial";
  return { verdict, flagCodes, inconclusive };
}

describe("지주회사 식별 축 판정", () => {
  it("실측 재현 — 64992 는 플래그, 2411·26221 은 판단 불가", () => {
    const result = judge([
      { expected: "지주", induty_code: "64992" },
      { expected: "지주", induty_code: "64992" },
      { expected: "지주", induty_code: "64992" },
      { expected: "지주", induty_code: "64992" },
      { expected: "지주", induty_code: "64992" },
      { expected: "지주", induty_code: "64992" },
      { expected: "지주", induty_code: "26221" }, // 두산 — 사업지주
      { expected: "지주", induty_code: "2411" }, // POSCO홀딩스 — 제철
      { expected: "비지주", induty_code: "264" },
      { expected: "비지주", induty_code: "2612" },
    ]);
    expect(result.flagCodes).toEqual(["64992"]);
    expect(result.inconclusive).toEqual(["2411", "26221"]);
    // 8개 지주 중 6개만 덮으므로 완전 성립이 아니다.
    expect(result.verdict).toBe("path2_partial");
  });

  it("1회만 나온 코드는 겹치지 않아도 플래그가 아니다 — 업종 코드와 구분되지 않는다", () => {
    const result = judge([
      { expected: "지주", induty_code: "2411" },
      { expected: "비지주", induty_code: "264" },
    ]);
    expect(result.flagCodes).toEqual([]);
    expect(result.verdict).toBe("path2_unavailable");
  });

  it("재현된 코드가 지주 표본 전부를 덮으면 단독 플래그로 인정한다", () => {
    const result = judge([
      { expected: "지주", induty_code: "64992" },
      { expected: "지주", induty_code: "64992" },
      { expected: "비지주", induty_code: "264" },
    ]);
    expect(result.verdict).toBe("path2_ok");
  });

  it("지주군 코드가 비지주군에도 있으면 플래그에서 제외한다", () => {
    const result = judge([
      { expected: "지주", induty_code: "9999" },
      { expected: "지주", induty_code: "9999" },
      { expected: "비지주", induty_code: "9999" },
    ]);
    expect(result.flagCodes).toEqual([]);
  });
});

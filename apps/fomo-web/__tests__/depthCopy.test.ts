import { describe, expect, it } from "vitest";
import { describe52wGap, describeRsi } from "../lib/depthCopy";

// WO-22: "RSI 39" 숫자 단독 나열 금지 — 항상 의미 병기, 판단·매매 지시 금칙어 없음.
describe("depthCopy 서술화", () => {
  it("RSI 밴드별 의미가 붙는다", () => {
    expect(describeRsi(75)).toContain("과열");
    expect(describeRsi(62)).toContain("탄력");
    expect(describeRsi(50)).toContain("중립");
    expect(describeRsi(39)).toContain("눌린");
    expect(describeRsi(22)).toContain("과매도");
  });

  it("실수치가 보존된다(가짜 숫자 금지)", () => {
    expect(describeRsi(39)).toContain("RSI 39");
    expect(describe52wGap(26.1)).toContain("-26.1%");
  });

  it("52주 갭 밴드별 의미", () => {
    expect(describe52wGap(0.3)).toContain("고점권");
    expect(describe52wGap(7)).toContain("쉬는 자리");
    expect(describe52wGap(26.1)).toContain("조정");
    expect(describe52wGap(45)).toContain("깊게");
  });

  it("판단·매매 지시 금칙어 없음", () => {
    const all = [describeRsi(75), describeRsi(39), describe52wGap(26.1), describe52wGap(0.3)].join(" ");
    // "과매도"(지표 용어)는 허용 — 매매 지시형 표현만 금지.
    expect(all).not.toMatch(/사세요|파세요|매수하|매도하|담아|목표가|반등|급등 예상|기회/);
  });
});

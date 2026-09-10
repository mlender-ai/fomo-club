import { describe, it, expect } from "vitest";
import { rollup, renderProgressReport } from "../project-progress";
import { buildProgressLedger } from "../build-progress-ledger";

const issues = [
  { number: 10, title: "포모 홈 와이어", axis: "PL", state: "CLOSED" },
  { number: 11, title: "전환 love mark", axis: "UX", state: "OPEN" },
  { number: 12, title: "감정 집계 API", axis: "BA", state: "OPEN" },
  { number: 13, title: "폴백 회귀 테스트", axis: "TD", state: "OPEN" },
];
const merged = [{ number: 50, title: "[Auto] 와이어", body: "resolves #10", merged: true }];
const open = [{ number: 51, title: "[Auto] 전환", body: "관련 #11", merged: false }];

const entries = buildProgressLedger({
  adopted: issues.map((i) => ({ number: i.number, title: i.title, agent: i.axis, state: i.state })),
  mergedPRs: merged,
  openPRs: open,
});

describe("rollup", () => {
  it("머지/PR중/미착수 카운트 + 완료율", () => {
    const r = rollup(entries);
    expect(r.total).toBe(4);
    expect(r.merged).toBe(1); // #10
    expect(r.openPr).toBe(1); // #11
    expect(r.pending).toBe(2); // #12, #13
    expect(r.donePct).toBe(25);
  });
  it("빈 배열은 0%", () => {
    expect(rollup([]).donePct).toBe(0);
  });
});

describe("renderProgressReport", () => {
  it("진척 헤드라인 + 다음 할 일 노출", () => {
    const txt = renderProgressReport("P1", "단 하나의 순간", entries);
    expect(txt).toContain("1/4 완료 (25%)");
    expect(txt).toContain("다음 할 일");
    expect(txt).toContain("#12 감정 집계 API");
    expect(txt).toContain("#11 전환 love mark");
  });
  it("task 없으면 분해 안내", () => {
    expect(renderProgressReport("P2", "습관", [])).toContain("분해된 task 이슈가 없");
  });
  it("전부 머지면 완료 축하 + 다음 프로젝트 안내", () => {
    const allDone = buildProgressLedger({
      adopted: [{ number: 1, title: "a", agent: "PL", state: "CLOSED" }],
      mergedPRs: [{ number: 9, title: "m", body: "#1", merged: true }],
      openPRs: [],
    });
    const txt = renderProgressReport("P1", "x", allDone);
    expect(txt).toContain("100%");
    expect(txt).toContain("모든 task 머지 완료");
  });
});

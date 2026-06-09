import { describe, it, expect } from "vitest";
import {
  buildProgressLedger,
  renderProgressTable,
  renderShippedLine,
  allowedNumbers,
  type BuildInput,
} from "../build-progress-ledger";

const base: BuildInput = {
  adopted: [
    { number: 417, title: "FOMO 멘트 품질 개선", agent: "prompt", state: "CLOSED" },
    { number: 410, title: "성능 안정성 개선", agent: "frontend", state: "OPEN" },
    { number: 409, title: "감정 투표 UX", agent: "pm", state: "OPEN" },
    { number: 350, title: "보안 점검", agent: "security", state: "CLOSED" },
  ],
  mergedPRs: [
    { number: 419, title: "[Auto] FOMO 멘트 품질", body: "resolves #417", merged: true },
  ],
  openPRs: [
    { number: 420, title: "[Auto] 성능 개선", body: "관련 #410", merged: false },
  ],
};

describe("buildProgressLedger", () => {
  it("머지 PR 참조 이슈는 MERGED + PR 번호", () => {
    const e = buildProgressLedger(base).find((x) => x.issue === 417)!;
    expect(e.status).toBe("MERGED");
    expect(e.pr).toBe(419);
  });
  it("오픈 PR 참조 이슈는 OPEN_PR", () => {
    const e = buildProgressLedger(base).find((x) => x.issue === 410)!;
    expect(e.status).toBe("OPEN_PR");
    expect(e.pr).toBe(420);
  });
  it("PR 없고 open 이슈는 PENDING", () => {
    const e = buildProgressLedger(base).find((x) => x.issue === 409)!;
    expect(e.status).toBe("PENDING");
    expect(e.pr).toBeNull();
  });
  it("PR 없고 closed 이슈는 CLOSED_NO_PR (채택됐는데 미구현 종료)", () => {
    const e = buildProgressLedger(base).find((x) => x.issue === 350)!;
    expect(e.status).toBe("CLOSED_NO_PR");
    expect(e.pr).toBeNull();
  });
  it("머지 PR 이 오픈 PR 보다 우선 (둘 다 참조해도 MERGED)", () => {
    const input: BuildInput = {
      adopted: [{ number: 5, title: "x", agent: "pm", state: "CLOSED" }],
      mergedPRs: [{ number: 99, title: "m", body: "#5", merged: true }],
      openPRs: [{ number: 100, title: "o", body: "#5", merged: false }],
    };
    expect(buildProgressLedger(input)[0]!.status).toBe("MERGED");
    expect(buildProgressLedger(input)[0]!.pr).toBe(99);
  });
});

describe("renderProgressTable", () => {
  it("어제 채택 없으면 안내 행", () => {
    expect(renderProgressTable([])).toContain("어제 채택 항목 없음");
  });
  it("각 항목을 상태 라벨과 함께 행으로 렌더", () => {
    const md = renderProgressTable(buildProgressLedger(base));
    expect(md).toContain("#417");
    expect(md).toContain("✅ 머지됨");
    expect(md).toContain("PR #419");
    expect(md).toContain("⏳ 미착수");
    expect(md).toContain("⚠️ 종료(미구현)");
  });
});

describe("renderShippedLine", () => {
  it("머지된 항목만 실적으로 집계", () => {
    const line = renderShippedLine(buildProgressLedger(base));
    expect(line).toContain("1건");
    expect(line).toContain("PR #419");
  });
  it("머지 없으면 '없음'", () => {
    expect(renderShippedLine([])).toContain("없음");
  });
});

describe("allowedNumbers", () => {
  it("오늘 번호 + 어제 이슈/PR 번호를 화이트리스트로 합친다", () => {
    const set = allowedNumbers(buildProgressLedger(base), [409, 410, 412]);
    expect(set.has(412)).toBe(true); // today
    expect(set.has(417)).toBe(true); // adopted issue
    expect(set.has(419)).toBe(true); // merged PR
    expect(set.has(420)).toBe(true); // open PR
    expect(set.has(99999)).toBe(false);
  });
});

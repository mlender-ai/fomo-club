import { describe, it, expect } from "vitest";
import { parseSeq, parseDeps, unmetPrereqs, gate } from "../task-deps";

describe("parseSeq", () => {
  it("제목에서 seq 추출", () => {
    expect(parseSeq("[P2 3/6 · 백엔드] 포인트 API")).toBe(3);
    expect(parseSeq("[P10 12/20 · 품질] x")).toBe(12);
    expect(parseSeq("관련 없는 제목")).toBeNull();
  });
});

describe("parseDeps", () => {
  it("선행 단계 줄에서 seq 들 추출", () => {
    expect(parseDeps("## 진행\n- **선행 단계**: 1단계, 2단계\n끝")).toEqual([1, 2]);
    expect(parseDeps("- **선행 단계**: 없음 (먼저 시작 가능)")).toEqual([]);
    expect(parseDeps("선행 정보 없음")).toEqual([]);
  });
});

describe("unmetPrereqs / gate", () => {
  const siblings = [
    { number: 101, title: "[P2 1/4 · 백엔드] 스키마", state: "CLOSED" },
    { number: 102, title: "[P2 2/4 · 백엔드] API", state: "OPEN" },
    { number: 103, title: "[P2 3/4 · 프론트·UX] 화면", state: "OPEN" },
  ];
  it("선행이 OPEN 이면 미충족으로 잡는다", () => {
    const u = unmetPrereqs(103, [1, 2], siblings);
    expect(u.map((x) => x.number)).toEqual([102]); // 1단계(#101)는 CLOSED라 충족, 2단계(#102)는 OPEN
  });
  it("선행 전부 CLOSED 면 통과", () => {
    const sib = [{ number: 101, title: "[P2 1/4 · 백엔드] 스키마", state: "CLOSED" }];
    expect(gate(102, "[P2 2/4 · 백엔드] API", "- **선행 단계**: 1단계", sib).ok).toBe(true);
  });
  it("선행 OPEN 이면 게이트 차단 + 사유", () => {
    const g = gate(103, "[P2 3/4 · 프론트·UX] 화면", "- **선행 단계**: 1단계, 2단계", siblings);
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("#102");
    expect(g.reason).toContain("순차");
  });
  it("선행 없음이면 항상 통과", () => {
    expect(gate(101, "[P2 1/4 · 백엔드] 스키마", "- **선행 단계**: 없음", siblings).ok).toBe(true);
  });
  it("자기 자신은 선행에서 제외", () => {
    expect(unmetPrereqs(102, [2], siblings)).toEqual([]);
  });
});

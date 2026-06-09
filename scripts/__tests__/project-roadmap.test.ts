import { describe, it, expect } from "vitest";
import {
  parseRoadmap,
  getActiveProject,
  findProject,
  selectProject,
  renderSummary,
} from "../project-roadmap";

const MD = `# 로드맵

## P1 · 단 하나의 사랑스러운 순간
- **status**: active
- **milestone**: M1
- **okr**: O1, O3
- **why**: 단 하나의 순간.
- **scope**: 포모 마스코트

## P2 · 매일 돌아올 이유
- **status**: backlog
- **milestone**: M2
- **why**: 습관.

## P3 · 혼자가 아님
- **status**: done
- **milestone**: M3

---

## 진행 원칙
- 활성은 동시 1개.
`;

describe("parseRoadmap", () => {
  it("헤딩+필드를 프로젝트로 파싱 (진행 원칙 섹션은 제외)", () => {
    const ps = parseRoadmap(MD);
    expect(ps.map((p) => p.id)).toEqual(["P1", "P2", "P3"]);
    expect(ps[0]!.title).toBe("단 하나의 사랑스러운 순간");
    expect(ps[0]!.status).toBe("active");
    expect(ps[0]!.milestone).toBe("M1");
    expect(ps[0]!.okr).toBe("O1, O3");
    expect(ps[2]!.status).toBe("done");
  });
});

describe("getActiveProject / findProject", () => {
  it("활성 프로젝트 1개 반환", () => {
    expect(getActiveProject(parseRoadmap(MD))!.id).toBe("P1");
  });
  it("id 대소문자 무관 조회", () => {
    expect(findProject(parseRoadmap(MD), "p2")!.title).toBe("매일 돌아올 이유");
    expect(findProject(parseRoadmap(MD), "P9")).toBeNull();
  });
});

describe("selectProject", () => {
  it("선택 시 대상=active, 이전 active=backlog 강등 (status 라인만 변경)", () => {
    const res = selectProject(MD, "P2");
    expect(res.ok).toBe(true);
    const ps = parseRoadmap(res.md);
    expect(findProject(ps, "P2")!.status).toBe("active");
    expect(findProject(ps, "P1")!.status).toBe("backlog");
    expect(res.previousActive).toBe("P1");
    // 무손실: 다른 텍스트 유지
    expect(res.md).toContain("- **scope**: 포모 마스코트");
    expect(res.md).toContain("## 진행 원칙");
  });
  it("없는 id 는 실패 + 메시지", () => {
    const res = selectProject(MD, "P9");
    expect(res.ok).toBe(false);
    expect(res.md).toBe(MD);
    expect(res.message).toContain("찾을 수 없");
  });
  it("done 프로젝트는 선택 거부", () => {
    const res = selectProject(MD, "P3");
    expect(res.ok).toBe(false);
    expect(res.message).toContain("done");
  });
  it("이미 active 인 걸 다시 선택해도 안전(멱등)", () => {
    const res = selectProject(MD, "P1");
    expect(res.ok).toBe(true);
    expect(getActiveProject(parseRoadmap(res.md))!.id).toBe("P1");
  });
});

describe("renderSummary", () => {
  it("상태 아이콘과 함께 목록 렌더", () => {
    const s = renderSummary(parseRoadmap(MD));
    expect(s).toContain("🟢 P1");
    expect(s).toContain("⚪ P2");
    expect(s).toContain("✅ P3");
  });
});

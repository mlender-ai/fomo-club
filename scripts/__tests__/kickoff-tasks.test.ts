import { describe, it, expect } from "vitest";
import {
  parseKickoffTasks,
  renderIssueBody,
  renderIssueTitle,
  renderPlan,
  AXES,
} from "../kickoff-tasks";

describe("parseKickoffTasks", () => {
  const good = JSON.stringify([
    { seq: 1, axis: "기획", title: "포모 홈 와이어 정의", rationale: "심장", dependsOn: [], acceptance: "와이어 확정" },
    { seq: 2, axis: "프론트·UX", title: "감정 선택→반응 전환", rationale: "love mark", dependsOn: [1], acceptance: "전환 동작" },
    { seq: 3, axis: "백엔드", title: "감정 집계 API", rationale: "데이터", dependsOn: [1], acceptance: "API 200" },
  ]);

  it("정상 JSON 을 seq 순 정렬 파싱", () => {
    const t = parseKickoffTasks(good);
    expect(t.map((x) => x.seq)).toEqual([1, 2, 3]);
    expect(t[1]!.axis).toBe("프론트·UX");
    expect(t[1]!.dependsOn).toEqual([1]);
  });
  it("코드펜스/잡텍스트로 둘러싸여도 배열 추출", () => {
    expect(parseKickoffTasks("```json\n" + good + "\n``` 끝!")).toHaveLength(3);
  });
  it("구 약어(PL/TD/BA/UX)도 한글 직군으로 흡수", () => {
    const raw = JSON.stringify([
      { seq: 1, axis: "PL", title: "a" },
      { seq: 2, axis: "UX", title: "b" },
      { seq: 3, axis: "BA", title: "c" },
      { seq: 4, axis: "TD", title: "d" },
    ]);
    expect(parseKickoffTasks(raw).map((x) => x.axis)).toEqual(["기획", "프론트·UX", "백엔드", "품질"]);
  });
  it("부분 표현(프론트엔드/서버/테스트)도 직군 매핑", () => {
    const raw = JSON.stringify([
      { seq: 1, axis: "프론트엔드", title: "a" },
      { seq: 2, axis: "서버", title: "b" },
      { seq: 3, axis: "QA 테스트", title: "c" },
    ]);
    expect(parseKickoffTasks(raw).map((x) => x.axis)).toEqual(["프론트·UX", "백엔드", "품질"]);
  });
  it("직군 불명/제목 없음은 제외", () => {
    const raw = JSON.stringify([
      { seq: 1, axis: "기획", title: "ok" },
      { seq: 2, axis: "외계어zzz", title: "직군밖" },
      { seq: 3, axis: "기획", title: "" },
    ]);
    const t = parseKickoffTasks(raw);
    expect(t).toHaveLength(1);
    expect(t[0]!.title).toBe("ok");
  });
  it("미존재/자기참조 의존성 제거", () => {
    const raw = JSON.stringify([
      { seq: 1, axis: "기획", title: "a", dependsOn: [1, 99] },
      { seq: 2, axis: "품질", title: "b", dependsOn: [1] },
    ]);
    const t = parseKickoffTasks(raw);
    expect(t[0]!.dependsOn).toEqual([]);
    expect(t[1]!.dependsOn).toEqual([1]);
  });
  it("빈/불량 입력은 빈 배열", () => {
    expect(parseKickoffTasks("")).toEqual([]);
    expect(parseKickoffTasks("not json")).toEqual([]);
    expect(parseKickoffTasks("{}")).toEqual([]);
  });
  it("AXES 는 한글 4직군", () => {
    expect([...AXES]).toEqual(["기획", "백엔드", "프론트·UX", "품질"]);
  });
});

describe("render", () => {
  const task = { seq: 2, axis: "프론트·UX" as const, title: "전환", rationale: "love mark", dependsOn: [1], acceptance: "동작" };
  it("이슈 제목 = [P1 2/5 · 프론트·UX] 전환", () => {
    expect(renderIssueTitle(task, "P1", 5)).toBe("[P1 2/5 · 프론트·UX] 전환");
  });
  it("본문에 상위 프로젝트·단계·선행·완료판정 포함", () => {
    const b = renderIssueBody(task, "P1", "단 하나의 순간", 5);
    expect(b).toContain("상위 프로젝트: P1 · 단 하나의 순간");
    expect(b).toContain("진행 단계: 2 / 5");
    expect(b).toContain("담당 직군");
    expect(b).toContain("프론트·UX");
    expect(b).toContain("선행 단계");
    expect(b).toContain("1단계");
    expect(b).toContain("동작");
  });
  it("renderPlan 순서 요약", () => {
    const plan = renderPlan(parseKickoffTasks(JSON.stringify([
      { seq: 1, axis: "기획", title: "a" },
      { seq: 2, axis: "백엔드", title: "b", dependsOn: [1] },
    ])), "P1");
    expect(plan).toContain("1/2 [기획] a");
    expect(plan).toContain("2/2 [백엔드] b ← 1단계 후");
  });
});

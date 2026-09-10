import { describe, it, expect } from "vitest";
import { tokenize, expand, retrieve, renderInjection } from "../knowledge-retrieve";
import type { Lesson } from "../knowledge-base";

const lessons: Lesson[] = [
  { date: "2026-06-10", kind: "shipped", text: "챌린지 상태 DB ChallengeState + 적립", ref: "PR#457" },
  { date: "2026-06-09", kind: "shipped", text: "감정 캘린더 EmotionCalendar 구현", ref: "PR#300" },
  { date: "2026-06-08", kind: "shipped", text: "네이버 종목토론실 커뮤니티 소스 연동", ref: "PR#408" },
  { date: "2026-06-07", kind: "decision", text: "포인트 유료화 보류 — 적립만", ref: "issue#450" },
];

describe("tokenize", () => {
  it("한글/영문 2자+ 토큰, 스톱워드 제외", () => {
    const t = tokenize("감정 캘린더 EmotionCalendar 구현 및 추가");
    expect(t).toContain("감정");
    expect(t).toContain("캘린더");
    expect(t).toContain("emotioncalendar");
    expect(t).not.toContain("구현"); // 스톱워드
    expect(t).not.toContain("및");
  });
});

describe("expand (동의어 확장)", () => {
  it("동의어 그룹으로 토큰 확장", () => {
    const e = expand(["알림"]);
    expect(e.has("푸시")).toBe(true);
    expect(e.has("notification")).toBe(true);
  });
});

describe("retrieve", () => {
  it("쿼리와 겹치는 교훈을 점수순 반환", () => {
    const r = retrieve("감정 캘린더 스트릭 기능 추가", lessons);
    expect(r[0]!.lesson.ref).toBe("PR#300"); // 감정+캘린더 겹침 최다
  });
  it("동의어로 recall — '푸시 notification' 쿼리가 '알림' 교훈 회수", () => {
    const ls = [{ date: "2026-06-10", kind: "shipped" as const, text: "감정 변화 알림 발송", ref: "PR#999" }];
    const r = retrieve("푸시 notification 시스템", ls);
    expect(r.length).toBe(1);
    expect(r[0]!.lesson.ref).toBe("PR#999");
  });
  it("동점이면 최신 교훈 우선(최신성 가중)", () => {
    const ls = [
      { date: "2026-05-01", kind: "shipped" as const, text: "감정 캘린더", ref: "PR#1" },
      { date: "2026-06-10", kind: "shipped" as const, text: "감정 캘린더", ref: "PR#2" },
    ];
    expect(retrieve("감정 캘린더", ls, 6, "2026-06-11")[0]!.lesson.ref).toBe("PR#2");
  });
  it("관련 없으면 빈 배열", () => {
    expect(retrieve("로그인 OAuth 토큰 갱신", lessons)).toEqual([]);
  });
  it("빈 쿼리는 빈 배열", () => {
    expect(retrieve("", lessons)).toEqual([]);
  });
  it("topN 제한", () => {
    expect(retrieve("챌린지 감정 포인트 커뮤니티", lessons, 2).length).toBeLessThanOrEqual(2);
  });
});

describe("renderInjection", () => {
  it("관련 지식 + 출처 렌더", () => {
    const block = renderInjection(retrieve("감정 캘린더", lessons));
    expect(block).toContain("관련 과거 지식");
    expect(block).toContain("감정 캘린더 EmotionCalendar");
    expect(block).toContain("[출처: PR#300]");
    expect(block).toContain("재제안·중복 설계 금지");
  });
  it("관련 없으면 신규 영역 안내", () => {
    expect(renderInjection([])).toContain("신규 영역");
  });
});

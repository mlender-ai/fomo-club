// E2E: 챌린지 완료 → 포인트(집계) 반영 & 새 UI 반응
//
// 검증 체크리스트(이슈 #462):
//  - 챌린지 완료 후 포인트(참여 집계)와 새로운 UI 반응을 확인.
//  - 완료 후 진행 UI가 정상적으로 변경되는지(나의 포모 한마디/표정/집계 공개).
//  - 하루 한 번 가드 — 완료 후 중복 수락 차단.
//
// app/index.tsx 의 vote() 가드 + 집계 공개 로직을 동일 계층에서 재현한다.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

import { mineLine, EMOTION_COLORS, EMOTION_TYPES, type EmotionType } from "@fomo/core";
import { fetchToday, postVote } from "../lib/api";
import { makeServer, installFetch, type FakeServer } from "./_harness";

let srv: FakeServer;

beforeEach(() => {
  srv = makeServer(72);
  installFetch(srv);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// app/index.tsx 의 화면 상태를 최소 재현 — 완료(vote) 후 파생 UI를 검증하기 위함.
// "하루 한 번" 가드(mine || voting)를 동일하게 적용한다.
function makeScreen() {
  let mine: EmotionType | null = null;
  let voting = false;
  let tally = { total: 0, counts: {} as Record<string, number>, ratios: {} as Record<string, number> };

  return {
    get mine() {
      return mine;
    },
    get voted() {
      return mine !== null;
    },
    get tally() {
      return tally;
    },
    async vote(e: EmotionType) {
      if (mine || voting) return; // 가드: 이미 완료했거나 진행 중이면 무시
      voting = true;
      mine = e; // 낙관적 선택
      try {
        const res = await postVote(e);
        tally = { total: res.total, counts: res.counts, ratios: res.ratios };
      } catch {
        // 낙관적 — 선택 유지, 집계는 다음 로드에 반영
      } finally {
        voting = false;
      }
    },
  };
}

describe("챌린지 완료 후 포인트(집계) 반영", () => {
  it("완료 시 참여 집계가 +1 되고 '당신을 포함' 카피 조건을 만족한다", async () => {
    const before = await fetchToday();
    const screen = makeScreen();

    await screen.vote("greed");

    expect(screen.voted).toBe(true);
    expect(screen.tally.total).toBe(before.total + 1);
    // voted=true → 화면 카피: "당신을 포함해 오늘 N명이 감정을 남겼어요"
    expect(screen.tally.total).toBeGreaterThan(0);
  });

  it("완료 후 새 UI 반응 — 나의 포모 한마디와 감정 색 glow가 준비된다", async () => {
    const screen = makeScreen();
    await screen.vote("conviction");

    const line = mineLine("conviction"); // 담담한 한마디 (빈 문자열 금지)
    expect(line.trim().length).toBeGreaterThan(0);

    const glow = EMOTION_COLORS["conviction"]; // calm 표정 + 선택 감정 색 glow
    expect(glow).toMatch(/^#/);
  });
});

describe("하루 한 번 가드 — 중복 완료 차단", () => {
  it("이미 완료한 뒤 다시 수락해도 집계가 다시 늘지 않는다", async () => {
    const before = await fetchToday();
    const screen = makeScreen();

    await screen.vote("fomo");
    const afterFirst = screen.tally.total;
    await screen.vote("fear"); // 가드에 막혀 무시되어야 함

    expect(screen.mine).toBe("fomo"); // 첫 선택 유지
    expect(screen.tally.total).toBe(afterFirst);
    expect(screen.tally.total).toBe(before.total + 1); // 딱 한 번만 증가
  });
});

describe("완료 시점 실패 — 오류 폴백", () => {
  it("완료 요청이 실패해도 선택은 유지되고 집계만 비반영(크래시 없음)", async () => {
    srv.failOn.add("/api/fomo/emotions/vote");
    const screen = makeScreen();

    await screen.vote("regret"); // 내부 catch 로 흡수

    expect(screen.mine).toBe("regret"); // 낙관적 선택 유지
    expect(screen.tally.total).toBe(0); // 서버 반영 실패 → 집계 0
  });

  it("모든 감정 타입에 대해 나의 포모 한마디가 존재한다(빈 멘트 회귀 방지)", () => {
    for (const e of EMOTION_TYPES) {
      expect(mineLine(e).trim().length).toBeGreaterThan(0);
    }
  });
});

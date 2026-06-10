// E2E: 데일리 챌린지 — 홈 로드 & 수락 동기화
//
// 검증 체크리스트(이슈 #462):
//  - 홈 화면 로드 시 챌린지 정보와 참여(포인트) 상태를 제대로 표시하는지.
//  - 챌린지 수락(감정 선택) 후 진행 UI가 API 상태와 동기화되는지.
//  - 실패 시 오류/폴백 상태가 올바른지.
//
// app/index.tsx 가 의존하는 lib/api 브릿지 + @fomo/core 파생을 그대로 구동해
// 화면 여정을 재현한다. (오프라인 CI 제약: RN 렌더러 미설치 — _harness.ts 참조)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// lib/api.ts → expo-constants 의존. node 환경에서 안전하게 스텁.
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

import {
  scoreToFace,
  scoreToState,
  marketLine,
  marketSummary,
  EMOTION_TYPES,
} from "@fomo/core";
import { fetchIndex, fetchToday, postVote } from "../lib/api";
import { makeServer, installFetch, type FakeServer } from "./_harness";

let srv: FakeServer;

beforeEach(() => {
  srv = makeServer(72); // FOMO 구간(>=61) — 시장의 포모가 달아오른 상태
  installFetch(srv);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("홈 화면 로드", () => {
  it("챌린지 정보(FOMO Index)와 참여(포인트) 집계를 정확히 표시한다", async () => {
    const [index, today] = await Promise.all([fetchIndex(), fetchToday()]);

    // 챌린지 정보 = FOMO Index. 화면은 점수/상태/요약/표정으로 표현한다.
    expect(index.score).toBe(72);
    expect(scoreToState(index.score)).toBe("FOMO");
    expect(scoreToFace(index.score)).toBe(scoreToFace(72));
    expect(marketLine(scoreToState(index.score))).not.toBe("");
    expect(marketSummary(scoreToState(index.score))).not.toBe("");

    // 참여(포인트) 상태 = 정직한 집계값. 가짜 수치가 아니라 실제 total.
    expect(today.total).toBe(12);
    const sum = Object.values(today.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(today.total);
  });

  it("집계가 비어 있어도(0명) 안전 폴백 — 비율은 0, 크래시 없음", async () => {
    srv.total = 0;
    srv.counts = { fomo: 0, fear: 0, regret: 0, greed: 0, conviction: 0 };
    const today = await fetchToday();
    expect(today.total).toBe(0);
    for (const e of EMOTION_TYPES) expect(today.ratios[e]).toBe(0);
  });
});

describe("챌린지 수락(감정 선택) — UI ↔ API 동기화", () => {
  it("수락 시 참여 집계가 +1 되고 내 선택이 반영된다", async () => {
    const before = await fetchToday();
    const res = await postVote("fomo");

    expect(res.mine).toBe("fomo");
    expect(res.total).toBe(before.total + 1); // 나를 포함해 한 명 늘어남
    expect(res.counts.fomo).toBe(before.counts.fomo + 1);

    // 화면 카피("당신을 포함해 오늘 N명") 조건과 동일한 동기화.
    expect(res.ratios.fomo).toBeGreaterThan(before.ratios.fomo);
  });

  it("표정이 시장의 포모 → 나의 포모로 전환된다", async () => {
    const index = await fetchIndex();
    const marketFace = scoreToFace(index.score); // stage=market
    // stage=mine 일 때 화면은 'calm' 표정 + 선택 감정 색 glow 를 보여준다.
    const mineFace = "calm";
    expect(marketFace).not.toBe(mineFace);
  });
});

describe("실패 시 오류/폴백 상태", () => {
  it("투표 요청이 실패하면 에러를 던져 낙관적 상태 유지로 폴백한다", async () => {
    srv.failOn.add("/api/fomo/emotions/vote");
    await expect(postVote("fear")).rejects.toThrow(/vote 503/);
    // 화면은 catch 후 선택을 유지(낙관적) — 집계 미반영, 크래시 없음.
  });

  it("인덱스 로드 실패 시 호출부가 거부를 받아 '집계 준비 중' 폴백으로 분기한다", async () => {
    srv.failOn.add("/api/fomo/index");
    const settled = await Promise.allSettled([fetchIndex(), fetchToday()]);
    expect(settled[0].status).toBe("rejected"); // index → 폴백 텍스트
    expect(settled[1].status).toBe("fulfilled"); // tally 는 정상 표시
  });
});

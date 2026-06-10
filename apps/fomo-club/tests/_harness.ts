// E2E 하네스 — fomo-club 데일리 챌린지 플로우 검증용 공용 유틸.
//
// 배경(정직하게): 이 앱은 오프라인 CI에서 RN 렌더러(jest-expo/RTL)를 설치할 수 없다.
// 대신 화면(app/index.tsx)이 의존하는 두 계층 — ①API 브릿지(lib/api.ts) ②@fomo/core
// 상태 파생(scoreToFace/scoreToState/marketLine/mineLine) — 을 그대로 구동하여
// "홈 로드 → 챌린지 수락(감정 선택) → 완료(집계 공개)" 여정을 end-to-end로 재현한다.
//
// 데일리 챌린지 MVP = "하루 한 번 감정 남기기". 진행/포인트 신호 = 정직한 참여 집계(N명)
// + 2단계 표정 전환(시장의 포모 → 나의 포모). 별도 포인트 스토어는 아직 없으므로
// 가짜 수치를 만들지 않고 실제 집계값만 검증한다(정직한 숫자 원칙).

import { vi } from "vitest";
import type { TallyResponse, FomoIndexResponse } from "../lib/api";

export interface FakeServer {
  index: FomoIndexResponse;
  total: number;
  counts: Record<string, number>;
  // 다음 요청에서 강제로 실패시킬 경로(오류 시나리오용).
  failOn: Set<string>;
}

export function makeServer(score = 72): FakeServer {
  return {
    index: {
      date: "2026-06-10",
      score,
      state: "FOMO",
      components: { market: 70, community: 60, emotion: 80, whale: 75 },
      aiSummary: "달아오르는 분위기",
      prevDayDelta: 3,
      avg30Delta: 5,
      live: true,
    },
    total: 12,
    counts: { fomo: 5, fear: 2, regret: 2, greed: 2, conviction: 1 },
    failOn: new Set(),
  };
}

function ratios(counts: Record<string, number>, total: number): Record<string, number> {
  const r: Record<string, number> = {};
  for (const k of Object.keys(counts)) r[k] = total > 0 ? counts[k] / total : 0;
  return r;
}

// global.fetch 를 가짜 서버로 교체한다. lib/api.ts 가 호출하는 3개 엔드포인트를 처리.
export function installFetch(srv: FakeServer): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, "");

      if (srv.failOn.has(path)) {
        return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
      }

      if (path === "/api/fomo/index") {
        return jsonOk(srv.index);
      }
      if (path === "/api/fomo/emotions/today") {
        return jsonOk(tally(srv));
      }
      if (path === "/api/fomo/emotions/vote") {
        const body = JSON.parse((init?.body as string) ?? "{}");
        const emotion = body.emotion as string;
        srv.total += 1;
        srv.counts[emotion] = (srv.counts[emotion] ?? 0) + 1;
        return jsonOk({ ...tally(srv), mine: emotion });
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

export function tally(srv: FakeServer): TallyResponse {
  return {
    date: srv.index.date,
    total: srv.total,
    counts: { ...srv.counts },
    ratios: ratios(srv.counts, srv.total),
  };
}

function jsonOk<T>(data: T): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response;
}

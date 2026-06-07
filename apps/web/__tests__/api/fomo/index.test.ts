import { describe, it, expect, vi, beforeEach } from "vitest";

// prisma 모킹
vi.mock("../../../lib/prisma", () => ({
  prisma: {
    fomoIndexSnapshot: { findUnique: vi.fn() },
    emotionVote: { groupBy: vi.fn() },
  },
}));
vi.mock("../../../lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  }),
}));

import { GET } from "@/app/api/fomo/index/route";
import { prisma } from "../../../lib/prisma";

const mockSnapshot = vi.mocked(prisma.fomoIndexSnapshot.findUnique);
const mockGroupBy  = vi.mocked(prisma.emotionVote.groupBy);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. 스냅샷 존재 ────────────────────────────────────────────────────────────
describe("스냅샷 존재 시", () => {
  it("저장된 score·state·components를 그대로 반환", async () => {
    mockSnapshot.mockResolvedValueOnce({
      id: "snap1", date: "2026-06-07",
      score: 72, state: "FOMO",
      marketHeat: 25, communityHeat: 22, emotionHeat: 20, whaleHeat: 5,
      aiSummary: "test", insights: [], prevDayDelta: 3, avg30Delta: 1,
      createdAt: new Date(),
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.score).toBe(72);
    expect(body.state).toBe("FOMO");
    expect(body.live).toBe(false);
    expect(body.components.market).toBe(25);
    expect(body.components.whale).toBe(5);
  });

  it("zoneColor·zoneDescription 필드 포함", async () => {
    mockSnapshot.mockResolvedValueOnce({
      id: "snap2", date: "2026-06-07",
      score: 72, state: "FOMO",
      marketHeat: 25, communityHeat: 22, emotionHeat: 20, whaleHeat: 5,
      aiSummary: "", insights: [], prevDayDelta: 0, avg30Delta: 0,
      createdAt: new Date(),
    } as never);

    const res = await GET();
    const body = await res.json();
    expect(typeof body.zoneColor).toBe("string");
    expect(body.zoneColor).toMatch(/^#/);
    expect(typeof body.zoneDescription).toBe("string");
    expect(body.zoneDescription.length).toBeGreaterThan(0);
  });
});

// ─── 2. 스냅샷 없음 — 라이브 계산 ────────────────────────────────────────────
describe("스냅샷 없음 (라이브 계산)", () => {
  it("감정 투표 데이터 있을 때 score가 중립이 아닌 값", async () => {
    mockSnapshot.mockResolvedValueOnce(null);
    mockGroupBy.mockResolvedValueOnce([
      { emotion: "fomo",  _count: { _all: 8 } },
      { emotion: "greed", _count: { _all: 2 } },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.live).toBe(true);
    // fomo+greed 우세 → emotion heat > 15 (중립) → score > 45
    expect(body.score).toBeGreaterThan(45);
  });

  it("감정 투표 없을 때 중립 스냅샷 반환 (score=45, state=관심)", async () => {
    mockSnapshot.mockResolvedValueOnce(null);
    mockGroupBy.mockResolvedValueOnce([] as never);

    const res = await GET();
    const body = await res.json();
    expect(body.live).toBe(true);
    expect(body.score).toBe(45);
    expect(body.state).toBe("관심");
  });

  it("공포 투표 우세 → score < 45", async () => {
    mockSnapshot.mockResolvedValueOnce(null);
    mockGroupBy.mockResolvedValueOnce([
      { emotion: "fear",   _count: { _all: 7 } },
      { emotion: "regret", _count: { _all: 3 } },
    ] as never);

    const res = await GET();
    const body = await res.json();
    expect(body.score).toBeLessThan(45);
  });
});

// ─── 3. 폴백 — DB 전체 장애 ────────────────────────────────────────────────────
describe("DB 전체 장애", () => {
  it("snapshot 조회 실패 → 500 + INDEX_ERROR", async () => {
    mockSnapshot.mockRejectedValueOnce(new Error("DB connection refused"));

    const res = await GET();
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.code).toBe("INDEX_ERROR");
  });
});

// ─── 4. CORS 헤더 ──────────────────────────────────────────────────────────────
describe("CORS", () => {
  it("Access-Control-Allow-Origin: * 포함", async () => {
    mockSnapshot.mockResolvedValueOnce(null);
    mockGroupBy.mockResolvedValueOnce([] as never);

    const res = await GET();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

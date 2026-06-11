import { describe, it, expect } from "vitest";
import { insightStats, mirrorLines, MIRROR_MIN_DAYS, HOT_MARKET_SCORE } from "../src/insights";
import type { EmotionType } from "../src/types";

// 5월 꼬리(이전 달)는 월 집계엔 제외, 연속 기록엔 포함되는 픽스처
const days: Record<string, EmotionType> = {
  "2026-05-31": "conviction",
  "2026-06-01": "fomo",
  "2026-06-02": "fomo",
  "2026-06-03": "fear",
  "2026-06-05": "greed",
  "2026-06-06": "fomo",
};
const market: Record<string, number> = {
  "2026-06-01": 75, // hot + 나도 fomo → 동조
  "2026-06-02": 40, // not hot
  "2026-06-03": 80, // hot + fear → 동조 아님
  "2026-06-05": HOT_MARKET_SCORE, // hot 경계값 + greed → 동조
  "2026-06-06": 55, // not hot
};

describe("insightStats", () => {
  const s = insightStats(days, market, "2026-06");

  it("이번 달 기록 일수·감정별 분포 (이전 달 제외)", () => {
    expect(s.daysLogged).toBe(5);
    expect(s.emotionCounts.fomo).toBe(3);
    expect(s.emotionCounts.fear).toBe(1);
    expect(s.emotionCounts.greed).toBe(1);
    expect(s.emotionCounts.conviction).toBe(0); // 5/31은 월 밖
  });

  it("시장 핫일(61+) 중 기록일·동조일 — 분모는 기록 남긴 날만", () => {
    expect(s.hotMarketLogged).toBe(3); // 6/1, 6/3, 6/5
    expect(s.hotBoth).toBe(2); // 6/1(fomo), 6/5(greed)
  });

  it("최장 연속 기록은 월 경계를 넘어 잇는다", () => {
    // 5/31~6/3 = 4일 연속, 6/5~6/6 = 2일
    expect(s.longestStreak).toBe(4);
  });

  it("빈 입력은 전부 0", () => {
    const z = insightStats({}, {}, "2026-06");
    expect(z.daysLogged).toBe(0);
    expect(z.longestStreak).toBe(0);
  });
});

describe("mirrorLines", () => {
  it(`기록 ${MIRROR_MIN_DAYS}일 미만이면 빈 배열 (정직한 숫자 — 비추지 않음)`, () => {
    const s = insightStats({ "2026-06-01": "fomo", "2026-06-02": "fear" }, {}, "2026-06");
    expect(mirrorLines(s)).toEqual([]);
  });

  it("거울 문장 — 수치가 실측과 일치", () => {
    const lines = mirrorLines(insightStats(days, market, "2026-06"));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("이번 달 너는 FOMO 3일 · 공포 1일이었어.");
    expect(lines[1]).toBe("시장이 달아올랐던 3일 중 2일, 너도 같이 뜨거웠어.");
    expect(lines[2]).toBe("가장 길게 이어진 기록, 4일이야.");
  });

  it("동조 0회도 사실 그대로 비춘다", () => {
    const d: Record<string, EmotionType> = {
      "2026-06-01": "fear",
      "2026-06-02": "fear",
      "2026-06-03": "conviction",
    };
    const m = { "2026-06-01": 70, "2026-06-02": 90 };
    const lines = mirrorLines(insightStats(d, m, "2026-06"));
    expect(lines.some((l) => l.includes("한 번도 같이 달아오르지 않았어"))).toBe(true);
  });

  it("조언·예측 어휘 금지 (c-emotion-viz)", () => {
    const lines = mirrorLines(insightStats(days, market, "2026-06"));
    for (const l of lines) {
      expect(l).not.toMatch(/하세요|해야|추천|매수|매도|오를|내릴|참아|멈춰/);
    }
  });

  it("감정이 1종뿐이면 단일 문장", () => {
    const d: Record<string, EmotionType> = {
      "2026-06-01": "fomo",
      "2026-06-03": "fomo",
      "2026-06-05": "fomo",
    };
    const lines = mirrorLines(insightStats(d, {}, "2026-06"));
    expect(lines[0]).toBe("이번 달 너는 FOMO 3일이었어.");
  });
});

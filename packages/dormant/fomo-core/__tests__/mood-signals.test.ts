import { describe, expect, it } from "vitest";
import {
  MOOD_FALLBACK_SIGNALS,
  moodifyBanner,
  moodifyBannerItem,
  type BannerItem,
} from "../src";

const macroUp: BannerItem = {
  id: "macro-sox",
  kind: "macro",
  emoji: "🔩",
  text: "필라델피아 반도체 +2.1%",
  detail: {
    title: "필라델피아 반도체",
    body: "",
    metric: { label: "전일 종가 대비", value: "+2.1%", change: 2.1 },
  },
};

const macroDown: BannerItem = {
  ...macroUp,
  id: "macro-kospi",
  detail: {
    title: "코스피",
    body: "",
    metric: { label: "전일 종가 대비", value: "-1.4%", change: -1.4 },
  },
};

describe("moodifyBannerItem", () => {
  it("macro 상승 → 분위기 문장(수치 나열 없음)", () => {
    const m = moodifyBannerItem(macroUp);
    expect(m?.text).toContain("다들 신났어");
    expect(m?.text).not.toMatch(/[+-]\d/); // 수치는 주인공이 아니다
  });

  it("macro 하락 → 같이 버티는 결", () => {
    const m = moodifyBannerItem(macroDown);
    expect(m?.text).toContain("다들 같은 화면");
  });

  it("pulse(지수/참여/액션 요구)는 제외", () => {
    const pulse: BannerItem = {
      id: "pulse-empty",
      kind: "pulse",
      emoji: "👥",
      text: "오늘의 첫 감정을 남겨보세요",
    };
    expect(moodifyBannerItem(pulse)).toBeNull();
  });

  it("정보 나열형(whale-worst)은 보수적으로 제외", () => {
    const worst: BannerItem = {
      id: "whale-worst",
      kind: "whale",
      emoji: "🐋",
      text: "도지코인 24시간 -8.2%",
    };
    expect(moodifyBannerItem(worst)).toBeNull();
  });

  it("이미 분위기 결인 ath 신호는 그대로 통과", () => {
    const ath: BannerItem = {
      id: "whale-btc-ath",
      kind: "whale",
      emoji: "🐋",
      text: "비트코인, 전고점 대비 -22% — 고점에 물린 건 너만이 아니야",
    };
    expect(moodifyBannerItem(ath)?.text).toContain("너만이 아니야");
  });
});

describe("moodifyBanner", () => {
  it("치환 결과가 부족하면 폴백으로 채워 빈 화면을 막는다", () => {
    const out = moodifyBanner([]);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0]!.id).toBe(MOOD_FALLBACK_SIGNALS[0]!.id);
  });

  it("금칙어(매수/매도/단정) 없음", () => {
    const all = [...moodifyBanner([macroUp, macroDown]), ...MOOD_FALLBACK_SIGNALS];
    for (const s of all) {
      expect(s.text).not.toMatch(/매수|매도|사세요|파세요|오른다|내린다|급등 예상/);
    }
  });
});

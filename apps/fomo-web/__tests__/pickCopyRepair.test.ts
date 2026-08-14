import { describe, expect, it } from "vitest";
import { findBannedTerms } from "@fomo/core";
import { isLegacyHook, pickHook, repairPickCopy } from "../lib/pickCopyRepair";
import type { QuietPick } from "../lib/fomoApi";

/**
 * WO-SUB-HOOK — 배치 시차 대응.
 *
 * 픽 payload 는 하루 한 번 크론이 구워 저장한다. 배포 직후 실측(2026-08-14 01:02 UTC)에서
 * `GET /api/fomo/quiet-picks` 는 여전히 옛 문장을 주고 있었다. 아래 픽스처는 **그 응답에서
 * 그대로 가져온 것**이다. 읽는 쪽이 고치지 못하면 화면은 다음 배치까지 옛말을 보여준다.
 */

const 빅텍 = {
  hook: "기관이 25일 연속 — 최근 40거래일 중 가장 길어요 — 거래가 평소의 25%로 말라 있던 자리예요",
  signal: { kind: "institution_streak", code: "institution_streak", actors: "기관", scale: "74주", days: 25, priceAtSignal: 3005, startedAt: "2026-07-09", strength: 350 },
  invalidation: { level: 2500, text: "52주 저점 2,500원 이탈 여부가 다음 판단 기준이에요." },
} as unknown as QuietPick;

const amrize = {
  hook: "내부자 7명이 함께 샀어요 — 52주 저점에서 1% 위 자리예요",
  signal: { kind: "insider_cluster", code: "insider_cluster", actors: "내부자 7명", scale: "$3.6M", days: 3, insiderCount: 7, priceAtSignal: 48.88, startedAt: "2026-08-11", strength: 302 },
  invalidation: { level: 49.39, text: "20일선 $49.39 위 마감 시 약세 관점은 무효예요." },
} as unknown as QuietPick;

const 한미반도체 = {
  hook: "거래량도 안 늘었어요",
  signal: { kind: "multi_cluster", code: "cluster_multi", actors: "외국인·기관", scale: "47만주 매집", days: 4, priceAtSignal: 205500, startedAt: "2026-08-10", strength: 320 },
  invalidation: { level: 206125, text: "20일선 206,125원 아래 마감 시 이 관점은 무효예요." },
} as unknown as QuietPick;

describe("repairPickCopy — 옛 payload 문자열을 화면 카피로", () => {
  it("금지어를 남기지 않는다", () => {
    const texts = [
      "내부자 7명이 함께 샀어요",
      "거래가 평소의 25%로 말라 있던 자리예요",
      "20일선 $49.39 위 마감 시 약세 관점은 무효예요.",
      "이례적으로 몰린 매수라 수급이 먼저 말하는 자리예요 거래도 말라 있었고요 — 자리는 지켜봐야 해요",
      "47만주 매집",
      "매수 규모가 작지 않은 매집이에요",
    ];
    for (const text of texts) {
      const repaired = repairPickCopy(text);
      expect(findBannedTerms(repaired), `${text} → ${repaired}`).toEqual([]);
    }
  });

  it("치환이 문장을 망가뜨리지 않는다", () => {
    expect(repairPickCopy("47만주 매집")).toBe("47만주");
    expect(repairPickCopy("내부자 7명이 함께 샀어요")).toBe("임원 7명이 함께 샀어요");
    expect(repairPickCopy("52주 저점에서 1% 위 자리예요")).toBe("52주 저점에서 1% 위예요");
    expect(repairPickCopy("20일선 206,125원 아래 마감 시 이 관점은 무효예요.")).toBe(
      "20일선 206,125원 아래 마감 시 이 판단은 다시 봐야 해요."
    );
  });

  it("새 카피는 그대로 통과한다 — 다음 배치가 돌면 이 shim 은 아무 일도 하지 않는다", () => {
    for (const text of [
      "기관이 25일째 조용히 사고 있어요",
      "임원 7명이 사흘 새 같이 샀어요",
      "52주 저점에서 1% 위예요",
      "되돌아보는 선 · 52주 저점 2,500원 이탈 여부가 다음 판단 기준이에요.",
    ]) {
      expect(repairPickCopy(text)).toBe(text);
    }
  });
});

describe("pickHook — 옛 훅은 신호로 다시 만든다", () => {
  it("옛 형식을 알아본다", () => {
    expect(isLegacyHook(빅텍.hook)).toBe(true);
    expect(isLegacyHook(amrize.hook)).toBe(true);
    expect(isLegacyHook("기관이 25일째 조용히 사고 있어요")).toBe(false);
    // 부정문 훅(D3)도 옛 것이다 — 새 훅은 반드시 주체로 시작한다.
    expect(isLegacyHook("거래량도 안 늘었어요")).toBe(true);
  });

  it("실측 payload 3건이 골든 케이스 문장으로 복구된다", () => {
    expect(pickHook(빅텍)).toBe("기관이 25일째 조용히 사고 있어요");
    expect(pickHook(amrize)).toBe("임원 7명이 사흘 새 같이 샀어요");
    // 부정문 훅도 신호로 다시 만든다 — D3 이 화면에서 사라진다.
    expect(pickHook(한미반도체)).toBe("외국인과 기관이 4일째 같이 사고 있어요");
  });

  it("복구된 훅에 금지어·em-dash 가 없다", () => {
    for (const pick of [빅텍, amrize, 한미반도체]) {
      const hook = pickHook(pick);
      expect(hook).not.toContain("—");
      expect(findBannedTerms(hook)).toEqual([]);
    }
  });

  it("훅이 비어 있으면 문장을 지어내지 않는다", () => {
    expect(pickHook({ ...빅텍, hook: "" } as QuietPick)).toBe("");
  });
});

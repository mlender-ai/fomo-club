import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { computeCompanyScore } from "@fomo/core";
import {
  applyAnalystFactGate,
  committeeSummary,
  completeEditorSelectedIds,
  enforceEditorAssetFloors,
  mergeCommitteeCompanyScore,
  parseEditorOutput,
  runExpertReviewCommittee,
  runExpertReviewCommitteeStage,
  validateAgentNumbers,
  type CommitteeAgentCaller,
  type CommitteeCandidateInput,
} from "../../lib/expert-review-committee";
import type { Daily30Response } from "../../lib/daily-30";
import type { CommitteeRunReport } from "../../lib/expert-review-store";

const input: CommitteeCandidateInput = {
  candidateId: "stock:KR:000000:테스트",
  assetClass: "kr-stock",
  stock: { canonical: "테스트", naverCode: "000000", country: "KR", market: "KOSPI", sector: "테스트" },
  material: { headline: "공시 확인", sourceLabel: "DART" },
  selection: { signalScore: 82, hypePenalty: 7, quietScore: 75 },
  trading: {
    signals: { changePct: 1.5, volumeRatio: 2.1 },
    verdict: {
      stance: "watch",
      stanceText: "82,000원 무효선을 확인하는 구간입니다.",
      evidence: ["거래량 2.1배"],
      invalidation: "82,000원 이탈 시 무효",
      invalidationLevel: 82000,
      confidence: "medium",
    },
    candleSummary: {
      sourceLength: 260,
      historyLabel: "52주",
      return20dPct: 1.5,
      averageVolume20d: 120000,
      rangeLow: 78000,
      rangeHigh: 91000,
      maLatest: { ma20: 83500, ma60: 81000, ma120: 79000 },
    },
  },
  financial: { metrics: [], scoreAxes: [] },
};

describe("expert committee fact gate", () => {
  it("입력 JSON에 있는 숫자와 반올림 표기는 허용한다", () => {
    expect(validateAgentNumbers("거래량 2.1배, 등락률 +1.5%, 무효선 82,000원", input)).toEqual([]);
  });

  it("입력에 없는 숫자는 문단을 결정론 폴백으로 교체한다", () => {
    const checked = applyAnalystFactGate("trading", {
      candidateId: input.candidateId,
      approved: true,
      grade: "A",
      paragraph: "목표가 999,000원까지 열려 있습니다.",
      concerns: [],
    }, input);
    expect(checked.factFallback).toBe(true);
    expect(checked.invalidNumbers).toContain("999000");
    expect(checked.paragraph).toBe(input.trading.verdict?.stanceText);
    expect(checked.paragraph).not.toContain("999");
  });

  it("공개 daily-30 라우트에는 후보 생성기나 LLM 실행기를 import하지 않는다", () => {
    const route = readFileSync(new URL("../../app/api/fomo/daily-30/route.ts", import.meta.url), "utf8");
    expect(route).not.toContain("buildDaily30Response");
    expect(route).not.toContain("expert-review-committee");
    expect(route).toContain("getCachedDaily30Response");
  });
});

function fakePool(count = 40): Daily30Response {
  const cards = Array.from({ length: count }, (_, index) => ({
    kind: "stock" as const,
    canonical: `테스트코인${index}`,
    symbol: `KRW-C${String(index).padStart(2, "0")}`,
    market: "COIN" as const,
    country: "KR" as const,
    marquee: false,
    sector: "코인",
    headline: "검증 가능한 신호",
  }));
  return {
    asOf: "2026-07-19T00:00:00.000Z",
    country: "all",
    stocks: cards.map(({ kind: _kind, ...stock }) => stock),
    cards,
    fronts: Object.fromEntries(cards.map((card, index) => [card.canonical, {
      signals: { changePct: index / 10, asOf: "2026-07-19" },
      fomo: {} as never,
      sparkline: [100, 101],
      priceText: "101원",
      changeText: "+1%",
    }])),
    confidence: "H",
    source: "test",
    meta: {
      targetCount: count,
      cards: cards.map((card, index) => ({
        id: `stock:KR:${card.symbol}:${card.canonical}`,
        assetClass: "coin" as const,
        quietScore: 80 - index / 10,
        signalScore: 90 - index / 10,
        hypePenalty: 10,
      })),
      assetCounts: { "kr-stock": 0, "us-stock": 0, coin: count, macro: 0 },
    },
  };
}

describe("expert committee orchestration", () => {
  it("후보 풀의 실측 밸류축을 위원회 라이트 재계산이 지우지 않는다", () => {
    const source = computeCompanyScore({
      financials: {
        currentPsr: 2.5,
        psrHistory: [1.9, 2.2, 2.8, 3.1],
        valuationHistoryLabel: "최근 1년",
      },
    });
    const recalculated = computeCompanyScore({
      signals: { changePct: 2.1, volumeRatio: 1.4 },
    });

    const merged = mergeCommitteeCompanyScore(
      source,
      recalculated,
      { quietScore: 72, signalScore: 80, hypePenalty: 8 },
      "2026-07-22"
    );

    expect(merged.axes.find((axis) => axis.key === "valuation")).toMatchObject({
      evidence: [expect.stringContaining("PSR 2.50배")],
    });
    expect(merged.axes.some((axis) => axis.key === "quiet")).toBe(true);
  });

  it("편집장 핵심 선정 ID가 있으면 누락된 부가 필드를 결정론 기본값으로 보완한다", () => {
    expect(parseEditorOutput(JSON.stringify({ selected_ids: ["a", "b"] }))).toEqual({
      selectedIds: ["a", "b"],
      rejected: [],
      compositionSummary: "자산군·등급·조용함을 함께 보고 중복을 줄인 구성입니다.",
    });
  });

  it("편집장이 20개 이상 고른 경우에만 결정론 순위로 30개를 완성한다", () => {
    const ranked = Array.from({ length: 35 }, (_, index) => `candidate-${index}`);
    expect(completeEditorSelectedIds(ranked.slice(0, 28), ranked)).toEqual(ranked.slice(0, 30));
    expect(completeEditorSelectedIds(ranked.slice(0, 19), ranked)).toHaveLength(19);
    expect(completeEditorSelectedIds([ranked[0]!, ranked[0]!, "unknown", ...ranked.slice(1, 20)], ranked)).toHaveLength(30);
  });

  it("위원회 최종 30장에 가용한 미장 8장·코인 3장 바닥을 복원한다", () => {
    const kr = Array.from({ length: 25 }, (_, index) => `kr-${index}`);
    const us = Array.from({ length: 10 }, (_, index) => `us-${index}`);
    const coin = Array.from({ length: 5 }, (_, index) => `coin-${index}`);
    const ranked = [...kr, ...us, ...coin];
    const assets = Object.fromEntries([
      ...kr.map((id) => [id, "kr-stock"]),
      ...us.map((id) => [id, "us-stock"]),
      ...coin.map((id) => [id, "coin"]),
    ]);

    const selected = enforceEditorAssetFloors([...kr, ...us.slice(0, 5)], ranked, assets);

    expect(selected).toHaveLength(30);
    expect(selected.filter((id) => assets[id] === "us-stock")).toHaveLength(8);
    expect(selected.filter((id) => assets[id] === "coin")).toHaveLength(3);
  });

  it("후보 35장이면 반려 여유 5장을 두고 승인 30장을 발행한다", async () => {
    let editorInput: unknown;
    const caller: CommitteeAgentCaller = async ({ role, input }) => {
      if (role === "editor") {
        editorInput = input;
        const candidates = (input as { candidates: Array<{ candidateId: string }> }).candidates;
        return {
          ok: true,
          model: "test-model",
          content: JSON.stringify({
            selectedIds: candidates.slice(0, 30).map((candidate) => candidate.candidateId),
            rejected: candidates.slice(30).map((candidate) => ({ candidateId: candidate.candidateId, reasons: ["구성 중복"] })),
            compositionSummary: "등급과 조용함을 함께 검수한 구성입니다.",
          }),
        };
      }
      const candidates = input as CommitteeCandidateInput[];
      return {
        ok: true,
        model: "test-model",
        content: JSON.stringify({
          reviews: candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            approved: true,
            grade: "B",
            paragraph: role === "trading"
              ? `${candidate.stock.symbol}의 구간·거래량·무효화 근거를 서로 대조해 타이밍을 검수했습니다.`
              : `${candidate.stock.symbol}의 공개 재무와 카드 재료를 대조해 기업 체력과 자료 한계를 함께 검수했습니다.`,
            concerns: [],
          })),
        }),
      };
    };
    const publish = vi.fn(async () => {});
    const result = await runExpertReviewCommittee({
      caller,
      buildPool: async () => fakePool(35),
      readPrevious: async () => null,
      publish,
      writeFailure: async () => {},
      writePicks: async () => {},
      minCallIntervalMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.report.candidateCount).toBe(35);
    expect(result.report.selectedCount).toBe(30);
    expect(result.report.callCount).toBe(11);
    expect(JSON.stringify(editorInput).length).toBeLessThan(8_000);
    const compactCandidates = (editorInput as { candidates: Array<Record<string, unknown>> }).candidates;
    expect(compactCandidates[0]).toMatchObject({ candidateId: "c01", asset: "coin" });
    expect(compactCandidates[0]).not.toHaveProperty("headline");
    expect(compactCandidates[0]).not.toHaveProperty("analystConcerns");
    expect(result.response?.stocks).toHaveLength(30);
    expect(result.response?.fronts["테스트코인0"]?.committeeReview?.factChecked).toBe(true);
    expect(publish).toHaveBeenCalledOnce();
  });

  it("에이전트 실패 시 새 활성본을 발행하지 않고 직전 승인본을 유지한다", async () => {
    const publish = vi.fn(async () => {});
    const writeFailure = vi.fn(async () => {});
    const result = await runExpertReviewCommittee({
      caller: async () => ({ ok: false, content: "", model: "test-model" }),
      buildPool: async () => fakePool(),
      readPrevious: async () => ({ runId: "previous", version: "committee-v1", reviewedAt: "2026-07-18", response: fakePool(30), report: {} as never }),
      publish,
      writeFailure,
      writePicks: async () => {},
      minCallIntervalMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.previousRunRetained).toBe(true);
    expect(publish).not.toHaveBeenCalled();
    expect(writeFailure).toHaveBeenCalledOnce();
  });

  it("분석가가 배치 후보를 누락하면 해당 후보만 C등급 반려하고 단계를 유지한다", async () => {
    let stored: unknown = null;
    const result = await runExpertReviewCommitteeStage("trading", {
      caller: async ({ input }) => {
        const candidates = input as Array<{ candidateId: string; stock: { symbol?: string } }>;
        const reviews = candidates.slice(0, -1).map((candidate) => ({
          candidateId: candidate.candidateId,
          approved: true,
          grade: "B",
          paragraph: `${candidate.stock.symbol}의 구간과 거래량 근거를 대조해 현재 타이밍을 검수했습니다.`,
          concerns: [],
        }));
        const middle = Math.ceil(reviews.length / 2);
        return {
          ok: true,
          model: "test-model",
          content: `${JSON.stringify({ reviews: reviews.slice(0, middle) })}${JSON.stringify({ reviews: reviews.slice(middle) })}`,
        };
      },
      buildPool: async () => fakePool(),
      readPrevious: async () => null,
      writeFailure: async () => {},
      writePicks: async () => {},
      minCallIntervalMs: 0,
      stageStorage: {
        read: async () => stored,
        write: async (_date, value) => { stored = value; },
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    const trading = (stored as { trading: Array<[string, { approved: boolean; grade: string; concerns: string[] }]> }).trading;
    expect(trading).toHaveLength(40);
    expect(trading.filter(([, review]) => !review.approved)).toHaveLength(5);
    expect(trading.filter(([, review]) => review.grade === "C")).toHaveLength(5);
  });

  it("분석가가 candidateId를 생략해도 배치 순서로 정상 응답을 복원한다", async () => {
    let stored: unknown = null;
    const result = await runExpertReviewCommitteeStage("trading", {
      caller: async ({ input }) => {
        const candidates = input as Array<{ candidateId: string; stock: { symbol?: string } }>;
        return {
          ok: true,
          model: "test-model",
          content: JSON.stringify({
            reviews: candidates.map((candidate) => ({
              approved: true,
              grade: "B",
              paragraph: `${candidate.stock.symbol}의 구간과 거래량 근거를 대조해 현재 타이밍을 검수했습니다.`,
              concerns: [],
            })),
          }),
        };
      },
      buildPool: async () => fakePool(),
      readPrevious: async () => null,
      writeFailure: async () => {},
      writePicks: async () => {},
      minCallIntervalMs: 0,
      stageStorage: {
        read: async () => stored,
        write: async (_date, value) => { stored = value; },
      },
    });

    expect(result).toMatchObject({ ok: true, candidateCount: 40 });
    const trading = (stored as { trading: Array<[string, { responseMissing?: boolean }]> }).trading;
    expect(trading).toHaveLength(40);
    expect(trading.every(([, review]) => review.responseMissing === false)).toBe(true);
  });

  it("3단 크론은 동일 후보를 이어받아 editor 성공 때만 활성본을 발행한다", async () => {
    const caller: CommitteeAgentCaller = async ({ role, input }) => {
      if (role === "editor") {
        const candidates = (input as { candidates: Array<{ candidateId: string }> }).candidates;
        return {
          ok: true,
          model: "test-model",
          content: JSON.stringify({
            selectedIds: candidates.slice(0, 30).map((candidate) => candidate.candidateId),
            rejected: candidates.slice(30).map((candidate) => ({ candidateId: candidate.candidateId, reasons: ["구성 중복"] })),
            compositionSummary: "등급과 조용함을 함께 검수한 구성입니다.",
          }),
        };
      }
      const candidates = input as Array<{ candidateId: string; stock: { symbol?: string } }>;
      return {
        ok: true,
        model: "test-model",
        content: JSON.stringify({
          reviews: candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            approved: true,
            grade: "B",
            paragraph: role === "trading"
              ? `${candidate.stock.symbol}의 구간·거래량·무효화 근거를 서로 대조해 타이밍을 검수했습니다.`
              : `${candidate.stock.symbol}의 공개 재무와 카드 재료를 대조해 기업 체력과 자료 한계를 함께 검수했습니다.`,
            concerns: [],
          })),
        }),
      };
    };
    let stored: unknown = null;
    const stageStorage = {
      read: async () => stored,
      write: async (_date: string, value: unknown) => { stored = value; },
    };
    const publish = vi.fn(async () => {});
    const common = {
      caller,
      buildPool: async () => fakePool(),
      readPrevious: async () => null,
      publish,
      writeFailure: async () => {},
      writePicks: async () => {},
      minCallIntervalMs: 0,
      stageStorage,
    };

    const trading = await runExpertReviewCommitteeStage("trading", common);
    expect(trading).toMatchObject({ ok: true, stage: "trading", candidateCount: 40, callCount: 5 });
    expect(publish).not.toHaveBeenCalled();

    const financial = await runExpertReviewCommitteeStage("financial", common);
    expect(financial).toMatchObject({ ok: true, stage: "financial", callCount: 10 });
    expect(publish).not.toHaveBeenCalled();

    const editor = await runExpertReviewCommitteeStage("editor", common);
    expect(editor).toMatchObject({ ok: true, stage: "editor", selectedCount: 30, callCount: 11 });
    expect(publish).toHaveBeenCalledOnce();
  });

  it("단계 실패 리포트에 실제 후보 수와 실패 지점을 남긴다", async () => {
    let stored: unknown = null;
    const reports: CommitteeRunReport[] = [];
    const result = await runExpertReviewCommitteeStage("trading", {
      caller: async () => ({ ok: false, content: "", model: "test-model", status: 429, retryAfterMs: 61_000 }),
      buildPool: async () => fakePool(),
      readPrevious: async () => null,
      writeFailure: async (report) => { reports.push(report); },
      writePicks: async () => {},
      minCallIntervalMs: 0,
      stageStorage: {
        read: async () => stored,
        write: async (_date, value) => { stored = value; },
      },
    });

    expect(result).toMatchObject({ ok: false, stage: "trading", candidateCount: 40, callCount: 1 });
    expect(reports[0]).toMatchObject({
      status: "failed",
      stage: "trading",
      failureStep: "trading-agent",
      candidateCount: 40,
      callCount: 1,
    });
  });

  it("분석가가 같은 문장을 반복해도 승인 후보를 전부 잃지 않고 엔진 문장으로 보강한다", async () => {
    let stored: unknown = null;
    const caller: CommitteeAgentCaller = async ({ role, input }) => {
      if (role === "editor") {
        const candidates = (input as { candidates: Array<{ candidateId: string }> }).candidates;
        return {
          ok: true,
          model: "test-model",
          content: JSON.stringify({
            selectedIds: candidates.slice(0, 30).map((candidate) => candidate.candidateId),
            rejected: [],
            compositionSummary: "중복을 줄이고 자산군을 나눠 구성했습니다.",
          }),
        };
      }
      const candidates = input as Array<{ candidateId: string }>;
      return {
        ok: true,
        model: "test-model",
        content: JSON.stringify({
          reviews: candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            approved: true,
            grade: "B",
            paragraph: "모든 후보에 동일한 분석 문장을 반복해 반환합니다.",
            concerns: [],
          })),
        }),
      };
    };
    const stageStorage = {
      read: async () => stored,
      write: async (_date: string, value: unknown) => { stored = value; },
    };
    const common = {
      caller,
      buildPool: async () => fakePool(),
      readPrevious: async () => null,
      publish: async () => {},
      writeFailure: async () => {},
      writePicks: async () => {},
      minCallIntervalMs: 0,
      stageStorage,
    };

    await runExpertReviewCommitteeStage("trading", common);
    await runExpertReviewCommitteeStage("financial", common);
    const editor = await runExpertReviewCommitteeStage("editor", common);

    expect(editor).toMatchObject({ ok: true, selectedCount: 30 });
    const rows = stored as {
      trading: Array<[string, { approved: boolean; factFallback: boolean }]>,
      financial: Array<[string, { approved: boolean; factFallback: boolean }]>,
    };
    expect(rows.trading.every(([, review]) => review.approved && review.factFallback)).toBe(true);
    expect(rows.financial.every(([, review]) => review.approved && review.factFallback)).toBe(true);
  });

  it("분석가의 반려 의견이 있어도 정상 응답이면 편집장이 최종 선별한다", async () => {
    let stored: unknown = null;
    const caller: CommitteeAgentCaller = async ({ role, input }) => {
      if (role === "editor") {
        const candidates = (input as { candidates: Array<{ candidateId: string }> }).candidates;
        return {
          ok: true,
          model: "test-model",
          content: JSON.stringify({
            selectedIds: candidates.slice(0, 30).map((candidate) => candidate.candidateId),
            rejected: [],
            compositionSummary: "분석가 의견과 조용함·다양성을 함께 반영했습니다.",
          }),
        };
      }
      const candidates = input as Array<{ candidateId: string; stock: { symbol?: string } }>;
      return {
        ok: true,
        model: "test-model",
        content: JSON.stringify({
          reviews: candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            approved: false,
            grade: "C",
            paragraph: `${candidate.stock.symbol}의 검수 근거와 자료 한계를 확인해 편집장 판단 대상으로 남깁니다.`,
            concerns: ["분석가 관찰 의견"],
          })),
        }),
      };
    };
    const stageStorage = {
      read: async () => stored,
      write: async (_date: string, value: unknown) => { stored = value; },
    };
    const common = {
      caller,
      buildPool: async () => fakePool(),
      readPrevious: async () => null,
      publish: async () => {},
      writeFailure: async () => {},
      writePicks: async () => {},
      minCallIntervalMs: 0,
      stageStorage,
    };

    await runExpertReviewCommitteeStage("trading", common);
    await runExpertReviewCommitteeStage("financial", common);
    const editor = await runExpertReviewCommitteeStage("editor", common);

    expect(editor).toMatchObject({ ok: true, selectedCount: 30 });
  });

  // WO-3 — 편집장 한 줄 총평: 등급 조합으로 달라지고, 수치가 없어 사실 게이트를 자동 통과한다.
  it("committeeSummary는 등급 조합별로 달라지고 수치를 담지 않는다", () => {
    const grades = ["A", "B", "C"] as const;
    const all = grades.flatMap((t) => grades.map((v) => committeeSummary(t, v)));
    expect(new Set(all).size).toBeGreaterThanOrEqual(6); // 조합별 상이
    for (const line of all) {
      expect(line, `총평에 수치 누수: "${line}"`).not.toMatch(/\d/u);
      expect(line).not.toMatch(/격차|비대칭|점으로 뚜렷/u);
    }
    // WO 예시 구조: 타이밍 B + 재무 A → "차트는 아직 애매한데 재무가 탄탄해서, 자리만 잡히면 볼 만한 종목이에요."
    expect(committeeSummary("B", "A")).toContain("자리만 잡히면");
    expect(committeeSummary("A", "A")).toContain("두루 맞는");
  });
});

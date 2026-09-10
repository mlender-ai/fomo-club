import { describe, expect, it } from "vitest";
import type { LedgerSelectionView } from "../../lib/judgment-ledger";
import { buildJudgmentReview, REVIEW_MATRIX_KEYS, type ReviewUserAction } from "../../lib/judgment-review";
import type { OutcomePayload } from "../../lib/ledger-track-record";

function selection(index: number, stance: "enter" | "watch" | "avoid" = "enter"): LedgerSelectionView {
  const canonical = `STOCK-${index}`;
  return {
    id: `selection-${index}`,
    date: "2026-06-01",
    ts: new Date(`2026-06-01T00:${String(index).padStart(2, "0")}:00.000Z`),
    subject: { asset: "us-stock", canonical, symbol: `S${index}` },
    priceAt: 100,
    actor: "committee",
    payload: {
      signalTypes: ["material_contract"],
      front: {
        verdict: { stance, stanceText: "테스트 판단", evidence: [], confidence: "medium" },
      } as never,
    },
  };
}

function action(index: number, value: "star" | "pass" | "seen"): ReviewUserAction {
  return {
    id: `action-${index}`,
    actor: "user:session:test",
    canonical: `STOCK-${index}`,
    ts: new Date(`2026-06-01T01:${String(index).padStart(2, "0")}:00.000Z`),
    action: value,
  };
}

function outcome(index: number, returnPct: number): OutcomePayload {
  return {
    selectionId: `selection-${index}`,
    selectionDate: "2026-06-01",
    windowDays: 30,
    evaluationDate: "2026-07-01",
    selectedPrice: 100,
    returnPct,
    asset: "us-stock",
    signalTypes: ["material_contract"],
  };
}

describe("judgment review ledger projection", () => {
  it("카드 선택 × 사용자 선택 × 결과를 고정 8칸으로 정직하게 분류한다", () => {
    const selections = [
      selection(0, "enter"), selection(1, "enter"), selection(2, "enter"), selection(3, "enter"),
      selection(4, "avoid"), selection(5, "watch"), selection(6, "avoid"), selection(7, "watch"),
    ];
    const actions = [
      action(0, "star"), action(1, "star"), action(2, "pass"), action(3, "seen"),
      action(4, "star"), action(5, "star"), action(6, "pass"), action(7, "seen"),
    ];
    const outcomes = [outcome(0, 5), outcome(1, -5), outcome(2, 5), outcome(3, -5), outcome(4, 5), outcome(5, -5), outcome(6, 5), outcome(7, -5)];
    const review = buildJudgmentReview(selections, actions, outcomes, new Date("2026-07-02T00:00:00.000Z"));

    expect(review.matrix.map((cell) => cell.key)).toEqual(REVIEW_MATRIX_KEYS);
    expect(review.matrix.map((cell) => cell.count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(review.userRate).toEqual({ n: 6, winRate: 33.3 });
    expect(review.cardRate).toEqual({ n: 6, winRate: 33.3 });
    expect(review.weekly?.count).toBe(8);
  });

  it("30일 outcome이 없는 판단은 성적에서 제외하고 대기 건수로만 남긴다", () => {
    const review = buildJudgmentReview([selection(0)], [action(0, "star")], []);
    expect(review.rows).toEqual([]);
    expect(review.pendingCount).toBe(1);
    expect(review.userRate).toEqual({ n: 0, winRate: null });
    expect(review.cardRate).toEqual({ n: 0, winRate: null });
  });

  it("강한 신호는 명시적 판단 표본 10개부터만 노출한다", () => {
    const selections = Array.from({ length: 10 }, (_, index) => selection(index, "enter"));
    const actions = Array.from({ length: 10 }, (_, index) => action(index, "star"));
    const outcomes = Array.from({ length: 10 }, (_, index) => outcome(index, index < 8 ? 4 : -2));
    const review = buildJudgmentReview(selections, actions, outcomes);
    expect(review.strongSignals).toEqual([{
      code: "material_contract",
      label: "계약·수주 재료",
      n: 10,
      winRate: 80,
    }]);
    expect(buildJudgmentReview(selections.slice(0, 9), actions.slice(0, 9), outcomes.slice(0, 9)).strongSignals).toEqual([]);
  });

  it("seen과 watch는 매트릭스에는 남기되 개인·카드 승률 계산에서 제외한다", () => {
    const review = buildJudgmentReview([selection(0, "watch")], [action(0, "seen")], [outcome(0, 8)]);
    expect(review.matrix.find((cell) => cell.key === "neither-up")?.count).toBe(1);
    expect(review.userRate.n).toBe(0);
    expect(review.cardRate.n).toBe(0);
  });
});

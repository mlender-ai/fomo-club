/**
 * 발행 가드 — 2026-08-23 빈 덱 사고(`docs/STATUS.md` §12)의 회귀 테스트.
 *
 * 사고 당시 커넥션 풀이 마르자 KR 수급 이력이 조용히 `{}` 가 되고, `krWithSignal: 0` →
 * `published: 0` 인 페이로드가 **정규 도메인에 먼저 쓰이고** 그 다음에 워크플로가 실패를
 * 알렸다. 여기서 고정하는 것은 두 가지다:
 *
 *   1. 필수 입력이 예외로 실패하면 `qualification.inputFailures` 에 이름이 남는다
 *      (조용한 날과 장애가 숫자로 구별된다).
 *   2. 그 상태·0장·직전 대비 반토막은 **쓰기 전에** 차단된다.
 */
import { describe, expect, it, vi } from "vitest";
import type { StockDef } from "@fomo/core";
import {
  buildQuietPickResponse,
  quietPickPublishBlockReason,
  QUIET_PICK_COLLAPSE_MIN_PRIOR,
  QUIET_PICK_REQUIRED_INPUTS,
  type QuietPickQualification,
  type QuietPickResponse,
} from "../../lib/quiet-pick";

function qualification(overrides: Partial<QuietPickQualification> = {}): QuietPickQualification {
  return {
    krUniverse: 300,
    krWithSignal: 19,
    usInsiderRaw: 40,
    usWithSignal: 6,
    afterQuiet: 14,
    afterQuality: 11,
    published: 10,
    watching: 8,
    drops: {},
    inputFailures: [],
    ...overrides,
  };
}

/** 장수만 의미가 있는 가짜 페이로드 — 가드는 `picks.length` 와 `qualification` 만 본다. */
function payload(count: number, qual: QuietPickQualification = qualification()) {
  return {
    picks: Array.from({ length: count }, (_, i) => ({ id: i })),
    qualification: qual,
  } as unknown as Pick<QuietPickResponse, "picks" | "qualification">;
}

describe("quietPickPublishBlockReason", () => {
  it("정상 재생성은 통과한다", () => {
    expect(quietPickPublishBlockReason(payload(10), payload(10))).toBeNull();
  });

  it("직전 페이로드가 없는 첫 발행도 통과한다", () => {
    expect(quietPickPublishBlockReason(payload(3), null)).toBeNull();
  });

  it("0장은 차단한다 — 직전이 없어도", () => {
    expect(quietPickPublishBlockReason(payload(0), null)).toMatch(/0장/);
  });

  it("사고 재현: 필수 입력 실패는 0장이 아니어도 차단한다", () => {
    const reason = quietPickPublishBlockReason(
      payload(8, qualification({ inputFailures: [...QUIET_PICK_REQUIRED_INPUTS] })),
      payload(10)
    );
    expect(reason).toMatch(/필수 입력 실패/);
    expect(reason).toContain(QUIET_PICK_REQUIRED_INPUTS[0]!);
  });

  it("보강 입력 실패만이면 통과한다 — 소스 하나 죽었다고 덱을 막지 않는다", () => {
    expect(
      quietPickPublishBlockReason(payload(9, qualification({ inputFailures: ["fetchMarketCapRankMap"] })), payload(10))
    ).toBeNull();
  });

  it("직전 대비 반토막은 차단한다", () => {
    expect(quietPickPublishBlockReason(payload(4), payload(10))).toMatch(/붕괴/);
  });

  it("정확히 절반은 통과한다 — 경계는 '절반 미만'이다", () => {
    expect(quietPickPublishBlockReason(payload(5), payload(10))).toBeNull();
  });

  it("직전 장수가 작으면 비율을 적용하지 않는다 — 평상 회전을 사고로 오판하지 않는다", () => {
    const smallPrior = QUIET_PICK_COLLAPSE_MIN_PRIOR - 1;
    expect(quietPickPublishBlockReason(payload(1), payload(smallPrior))).toBeNull();
    // 하한에 닿으면 비율이 살아난다.
    expect(quietPickPublishBlockReason(payload(1), payload(QUIET_PICK_COLLAPSE_MIN_PRIOR))).toMatch(/붕괴/);
  });

  it("구 페이로드(inputFailures 없음)를 읽어도 터지지 않는다", () => {
    const legacy = qualification();
    delete (legacy as Partial<QuietPickQualification>).inputFailures;
    expect(quietPickPublishBlockReason(payload(10, legacy), payload(10))).toBeNull();
  });
});

describe("buildQuietPickResponse — 입력 실패는 이름을 남긴다", () => {
  const VOCAB: StockDef[] = [
    { canonical: "조용외인", aliases: [], market: "KOSDAQ", country: "KR", naverCode: "111111" },
  ];

  /** 신호가 하나도 안 나오는 최소 시나리오 — 여기서 보는 것은 `inputFailures` 뿐이다. */
  const minimalDeps = () => ({
    vocab: VOCAB,
    computeStockAttentionSignals: async () => ({}),
    fetchKrMarketRows: async () => [],
    fetchInsiderClusterCandidates: async () => [],
    fetchInsiderHistory: async () => ({ priorBuys12mo: 0, rows: [] }),
    fetchCachedUsMarketRows: async () => [],
    fetchMarketCapRankMap: async () => ({}) as never,
    writeUsCandleCache: async () => 0,
    fetchDartInsiderPurchasesByStock: async () => ({}) as never,
  });

  it("정상 경로에서는 inputFailures 가 비어 있다 — 신호 0장도 '조용한 날'로 읽힌다", async () => {
    const res = await buildQuietPickResponse({
      date: "2026-08-23",
      deps: { ...minimalDeps(), readSupplyDemandHistoryByTickers: async () => ({}) },
    });
    expect(res.qualification.inputFailures).toEqual([]);
    expect(res.picks).toHaveLength(0);
    // 이 조합(0장 + 실패 없음)은 가드가 "0장" 사유로만 막는다.
    expect(quietPickPublishBlockReason(res, null)).toMatch(/0장/);
  });

  it("사고 재현: 수급 이력이 EMAXCONNSESSION 으로 죽으면 이름이 남는다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await buildQuietPickResponse({
        date: "2026-08-23",
        deps: {
          ...minimalDeps(),
          readSupplyDemandHistoryByTickers: async () => {
            throw new Error(
              "Error querying the database: FATAL: (EMAXCONNSESSION) max clients reached in session mode"
            );
          },
        },
      });
      expect(res.qualification.inputFailures).toContain("readSupplyDemandHistoryByTickers");
      expect(QUIET_PICK_REQUIRED_INPUTS).toContain("readSupplyDemandHistoryByTickers");
      // 장애와 조용한 날이 여기서 갈린다 — 사고 당시에는 둘이 같은 페이로드였다.
      expect(quietPickPublishBlockReason(res, payload(10))).toMatch(/필수 입력 실패/);
    } finally {
      error.mockRestore();
    }
  });
});

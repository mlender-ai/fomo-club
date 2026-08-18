import { describe, expect, it } from "vitest";
import {
  activeInvariants,
  invariantSchemaGaps,
  INVARIANT_REGISTRY,
  // INV-C8 · C15
  scanForWyckoffTerms,
  scanForRequestPathImports,
  // INV-C12
  checkCardFrontBudget,
  budgetChars,
  // INV-08 · C11 · C12 공통
  projectForRender,
  bannedWordHits,
  type FactSheet,
} from "@fomo/core";
// 배치 전용 패키지는 workspace 별칭이 없으므로 상대 경로로 들어간다(형제 테스트와 같은 방식).
// 이 파일이 `scripts/__tests__` 에 있는 이유도 그것이다 — 하네스는 여러 패키지를 가로지른다.
import { findCopyViolations } from "../../packages/background/src/copy-guard";
import { computeStreak } from "../../packages/flow/src/compute/streak";
import { buildFlowSnapshot } from "../../packages/flow/src/compute/aggregate";
import { MIN_SAMPLE, summarize, assertSameProvenance, type SampleStat } from "../../packages/lab/src/stats";

/**
 * CTX-07 §3 — 역검증 하네스.
 *
 * ## 이 파일이 존재하는 이유
 *
 * > **테스트가 통과하는데 실제로는 아무것도 검사하지 않는 경우가 있다.**
 *
 * 실측된 사례가 둘 있다. 가격 무효선이 발행 시점 값끼리 비교하면서 타입·테스트를 전부
 * 통과했고, 소급 스캔은 위반을 찾고도 `exit 0` 이었다. 통과 케이스만 쌓으면 규칙을 지워도
 * 초록이 유지된다 — 그래서 **모든 활성 불변식에 의도적 위반을 주입해 실패하는지 확인한다.**
 *
 * ## 케이스 하나에 둘이 필요하다
 *
 * `violating` 만 있으면 **항상 실패하는 검사기**도 이 하네스를 통과한다. 그건 게이트가 아니라
 * 고장이다. 그래서 각 케이스는 `clean`(위반 없는 입력 — 반드시 통과) 과
 * `violating`(의도적 위반 — 반드시 적발) 을 **짝으로** 갖는다.
 *
 * 두 함수의 반환값 의미: `true` = 검사 통과(위반 없음).
 */

interface FalsificationCase {
  /** 위반을 주입하지 않은 정상 입력. `true` 를 돌려줘야 한다. */
  clean: () => boolean;
  /** 의도적 위반. `false` 를 돌려줘야 한다(= 검사기가 잡았다). */
  violating: () => boolean;
}

/** 최소 팩트시트 — 투영 규칙만 시험한다. */
function sheet(overrides: Partial<FactSheet> = {}): FactSheet {
  return { ...({} as FactSheet), missing_fields: [], field_sources: {}, ...overrides };
}

const CASES: Record<string, FalsificationCase> = {
  // ── 기존 불변식(WO-SUB-09) — 하네스로 편입 ──
  "INV-08": {
    clean: () =>
      projectForRender(
        sheet({
          valuation: { per_ttm: 12.4 } as FactSheet["valuation"],
          field_sources: { "valuation.per_ttm": { source: "naver_integration", as_of: "2026-03-31" } },
        }),
        ["valuation.per_ttm"]
      ).values.length === 1,
    violating: () =>
      // 출처·시각을 떼고 같은 수치를 투영한다.
      projectForRender(sheet({ valuation: { per_ttm: 12.4 } as FactSheet["valuation"] }), ["valuation.per_ttm"])
        .values.length === 1,
  },
  "INV-09": {
    clean: () => bannedWordHits("지점망 기반 예수금과 대출이 주된 사업입니다").length === 0,
    violating: () => bannedWordHits("지금이 매수 시점입니다").length === 0,
  },
  "INV-12": {
    clean: () =>
      projectForRender(
        sheet({
          fiscal: { ttm: { eps_diluted: 4200 } } as FactSheet["fiscal"],
          field_sources: { "fiscal.ttm.eps_diluted": { source: "dart", as_of: "2026-03-31" } },
        }),
        ["fiscal.ttm.eps_diluted"]
      ).values.length === 1,
    violating: () =>
      // 결측으로 등재됐는데 값이 남아 있는 상태 — 이전 기간 값으로 메운 모양이다.
      projectForRender(
        sheet({
          missing_fields: ["fiscal.ttm.eps_diluted"],
          fiscal: { ttm: { eps_diluted: 4200 } } as FactSheet["fiscal"],
          field_sources: { "fiscal.ttm.eps_diluted": { source: "dart", as_of: "2026-03-31" } },
        }),
        ["fiscal.ttm.eps_diluted"]
      ).values.length === 1,
  },
  "INV-14": {
    clean: () => scanForRequestPathImports(`import { readFeedContent } from "./feed-content-store";`).length === 0,
    violating: () => scanForRequestPathImports(`import { computeStreak } from "@fomo/flow";`).length === 0,
  },

  // ── CTX-07 신규 ──
  "INV-C1": {
    // 장소의 `에서` 는 허용 문안이다 — 이것까지 막으면 카탈로그가 통째로 걸린다.
    clean: () => findCopyViolations("많이 떨어진 자리에서 사고 있어요").length === 0,
    violating: () => findCopyViolations("실적이 좋아져서 기관이 사고 있어요").length === 0,
  },
  "INV-C5": {
    clean: () =>
      // 3거래일 연속 순매수, 결손 없음.
      computeStreak(
        [
          { date: "2026-08-19", net_value: 100, net_shares: 10 },
          { date: "2026-08-18", net_value: 100, net_shares: 10 },
          { date: "2026-08-17", net_value: 100, net_shares: 10 },
        ] as never,
        ["2026-08-17", "2026-08-18", "2026-08-19"]
      ).streak_days === 3,
    violating: () => {
      // 거래일 캘린더에는 있는데 08-18 행이 없다. 건너뛰고 이어붙이면 3일이 된다.
      const r = computeStreak(
        [
          { date: "2026-08-19", net_value: 100, net_shares: 10 },
          { date: "2026-08-17", net_value: 100, net_shares: 10 },
        ] as never,
        ["2026-08-17", "2026-08-18", "2026-08-19"]
      );
      // 위반이면 3일 + 사유 없음. 지켜지면 1일 + missing_data.
      return r.streak_days === 3 || r.streak_broken_by !== "missing_data";
    },
  },
  "INV-C6": {
    clean: () => {
      const snap = buildFlowSnapshot({
        symbol: "065450",
        market: "KR",
        as_of: "2026-08-19",
        participants: [
          flow("institution", 100),
          // 0 은 **관측**이다(거래 없음). 확보로 세야 한다 — 이것까지 미확보로 밀면 과탐지다.
          flow("retail", 0),
          flow("foreign", -50),
        ],
      });
      return snap.coverage === "full" && snap.net_sellers.includes("foreign") && !snap.net_buyers.includes("retail");
    },
    violating: () => {
      // 어댑터 조회 실패를 모사 — 행은 있는데 값이 없다. 확보로 세면 coverage 가 거짓이 된다.
      const snap = buildFlowSnapshot({
        symbol: "065450",
        market: "KR",
        as_of: "2026-08-19",
        participants: [flow("institution", 100), flow("retail", null), flow("foreign", -50)],
      });
      return snap.coverage === "full" || !snap.missing_participants.includes("retail");
    },
  },
  "INV-C8": {
    clean: () =>
      scanForWyckoffTerms(
        [
          `import type { WyckoffAnalysis } from "@fomo/core";`,
          `const isUp = verdict?.phase === "markup";`,
          `return <p>기관이 5일째 조용히 사고 있어요</p>;`,
        ].join("\n")
      ).length === 0,
    violating: () => scanForWyckoffTerms(`return <p>{"현재 매집 국면입니다"}</p>;`).length === 0,
  },
  "INV-C11": {
    // 밴드가 없으면 투영에서 값 자체가 나오지 않는다 → 캡션의 원료가 없다.
    clean: () => projectForRender(sheet(), ["valuation.per_band.percentile"]).values.length === 0,
    violating: () =>
      // 밴드 값을 출처 없이 밀어 넣는다 — 캡션이 붙을 원료가 생기면 위반이다.
      projectForRender(
        sheet({ valuation: { per_band: { percentile: 42 } } as unknown as FactSheet["valuation"] }),
        ["valuation.per_band.percentile"]
      ).values.length === 1,
  },
  "INV-C12": {
    clean: () =>
      // 발행 덱 실측 최대치(2026-08-19): 훅 21자 · 칩 34자 · 되돌아보는 선 37자.
      checkCardFrontBudget({
        subject: "Angel Studios",
        hook: "임원 3명이 최근 5일 새 같이 샀어요",
        chips: ["하루 거래량의 51%", "1년 매수 2건", "거래량은 그대로"],
        invalidation: "되돌아보는 선 · 최근 11개월 저점 $2.05",
      }).length === 0,
    violating: () =>
      checkCardFrontBudget({
        subject: "예산 초과",
        hook: "가".repeat(budgetChars("hook") + 1),
        chips: [],
        invalidation: "",
      }).length === 0,
  },
  "INV-C13": {
    // 30건이면 비율(positiveRate)이 나온다.
    clean: () => summarize(returns(MIN_SAMPLE), "ledger").sufficient === true,
    // 29건에서 비율이 나오면 위반이다.
    violating: () => summarize(returns(MIN_SAMPLE - 1), "ledger").sufficient === true,
  },
  "INV-C14": {
    clean: () => {
      assertSameProvenance([summarize(returns(MIN_SAMPLE), "ledger"), summarize(returns(MIN_SAMPLE), "ledger")]);
      return true;
    },
    violating: () => {
      try {
        assertSameProvenance([summarize(returns(MIN_SAMPLE), "ledger"), summarize(returns(MIN_SAMPLE), "backtest")]);
        return true; // throw 하지 않았다 = 합산이 통과했다 = 위반
      } catch {
        return false;
      }
    },
  },
  "INV-C15": {
    clean: () => scanForRequestPathImports(`import { readFeedContent } from "../lib/feed-content-store";`).length === 0,
    violating: () =>
      scanForRequestPathImports(`import { buildFlowSnapshot } from "../../../packages/flow/src/compute/aggregate";`)
        .length === 0,
  },
};

/** 주체 한 줄. `null` = 미관측, `0` = 거래 없음(관측). 이 구분이 INV-C6 의 전부다. */
function flow(participant: "retail" | "institution" | "foreign", netValue: number | null) {
  return {
    participant,
    net_shares: netValue,
    net_value: netValue,
    streak_days: null,
    streak_start: null,
    cumulative_shares_streak: null,
    cumulative_value_streak: netValue,
    pct_of_volume: null,
    streak_broken_by: null,
    source: "test",
    as_of: "2026-08-19",
  } as const;
}

/** 검증실 표본 — 수익률 배열. 값 자체는 판정에 영향이 없고 개수가 규칙의 대상이다. */
function returns(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 3 : -2));
}

/** 타입만 참조해 unused 경고를 피한다(하네스가 SampleStat 계약에 묶여 있음을 명시). */
export type _HarnessUsesSampleStat = SampleStat;

describe("CTX-07 레지스트리 스키마 — 역검증 없는 활성화를 막는다", () => {
  it("활성 불변식은 misbelief 와 falsification 을 갖는다", () => {
    expect(invariantSchemaGaps()).toEqual([]);
  });

  it("레지스트리 버전이 올라갔다 — 불변식이 늘면 버전이 바뀐다", () => {
    expect(INVARIANT_REGISTRY.registry_version).toBe("inv-v2.0.0");
  });

  it("모든 불변식에 어기면 무엇을 잘못 믿는지가 적혀 있다", () => {
    for (const entry of INVARIANT_REGISTRY.invariants) {
      expect(entry.misbelief?.length ?? 0, `${entry.id} misbelief 없음`).toBeGreaterThan(20);
    }
  });
});

describe("CTX-07 §3 역검증 — 활성 불변식 전종", () => {
  const active = activeInvariants();

  it("활성 불변식이 하나도 빠지지 않고 하네스에 있다", () => {
    const missing = active.filter((entry) => !CASES[entry.id]).map((entry) => entry.id);
    expect(missing, "하네스에 케이스가 없는 활성 불변식").toEqual([]);
  });

  it("하네스에 유예 불변식 케이스가 섞여 있지 않다 — 유예를 검사하면 유예의 의미가 사라진다", () => {
    const activeIds = new Set(active.map((entry) => entry.id));
    expect(Object.keys(CASES).filter((id) => !activeIds.has(id))).toEqual([]);
  });

  for (const entry of active) {
    describe(`${entry.id} — ${entry.title}`, () => {
      const testCase = CASES[entry.id];

      it("대조군: 위반 없는 입력은 통과한다 (항상 실패하는 검사기를 걸러낸다)", () => {
        expect(testCase, `${entry.id} 케이스 없음`).toBeTruthy();
        expect(testCase!.clean(), `${entry.id} 대조군이 실패했다 — 검사기가 고장났거나 케이스가 틀렸다`).toBe(true);
      });

      it("의도적 위반: 주입하면 적발된다", () => {
        expect(testCase!.violating(), `${entry.id} 위반이 통과했다 — 게이트가 아무것도 지키지 않는다`).toBe(false);
      });
    });
  }
});

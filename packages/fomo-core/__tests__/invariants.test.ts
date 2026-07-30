import { describe, expect, it } from "vitest";
import {
  activeInvariants,
  bannedWordHits,
  deferredInvariants,
  invariant,
  INVARIANT_REGISTRY,
  passesBannedWords,
  projectForRender,
  DOCTRINE,
  type FactSheet,
} from "@fomo/core";
import { renderInvariants, OUT_PATH } from "../../../scripts/invariants-render";
import { readFileSync } from "node:fs";

/**
 * WO-SUB-03.5 PART A — 불변식 활성화.
 *
 * A-3 완료 조건: 각 불변식에 **의도적 위반 케이스**가 있고 그 케이스에서 실패한다.
 * 통과 케이스만 있는 테스트는 게이트가 아니다 — 규칙을 지우면 그대로 초록이 된다.
 */

describe("레지스트리 (정본 하나)", () => {
  it("문서가 정본의 생성물과 일치한다 — 갈라지면 게이트가 있다는 착각이 남는다", () => {
    expect(readFileSync(OUT_PATH, "utf8")).toBe(renderInvariants());
  });

  it("유예에는 사유가 반드시 있다 — 사유 없는 유예는 방치와 구분되지 않는다", () => {
    for (const entry of deferredInvariants()) {
      expect(entry.defer_reason, `${entry.id} 유예 사유 없음`).toBeTruthy();
    }
  });

  it("이번에 활성화한 4종이 활성이고, 02R 대기 2종이 유예다", () => {
    expect(activeInvariants().map((entry) => entry.id).sort()).toEqual(["INV-08", "INV-09", "INV-12", "INV-14"]);
    expect(deferredInvariants().map((entry) => entry.id).sort()).toEqual(["INV-06", "INV-11"]);
  });

  it("없는 id 는 조용히 undefined 가 아니라 실패다", () => {
    expect(() => invariant("INV-99")).toThrow();
    expect(INVARIANT_REGISTRY.registry_version).toMatch(/^inv-v/);
  });
});

describe("INV-09 금지어 사전", () => {
  it("통과 — 상태 서술은 걸리지 않는다", () => {
    for (const text of [
      "지점망 기반 예수금과 대출이 주된 사업입니다",
      "국제유가(WTI)는 2026-07-25 기준 배럴당 68.20달러입니다",
      "영업이익률이 최근 8분기 중 가장 낮은 구간입니다",
    ]) {
      expect(passesBannedWords(text), text).toBe(true);
    }
  });

  it("의도적 위반 — 투자자문", () => {
    for (const text of ["지금이 매수 시점입니다", "목표가를 상향합니다", "손절 라인을 지키세요"]) {
      expect(bannedWordHits(text).some((hit) => hit.rule === "advice"), text).toBe(true);
    }
  });

  it("의도적 위반 — 값 판정(저평가·싸다)", () => {
    for (const text of ["현재 주가는 저평가 상태입니다", "PER 이 낮아 싸다고 볼 수 있습니다", "고평가 구간입니다"]) {
      expect(bannedWordHits(text).some((hit) => hit.rule === "valuation_judgment"), text).toBe(true);
    }
  });

  it("의도적 위반 — 평가 형용사·예측·인과", () => {
    expect(bannedWordHits("유망한 파이프라인").some((hit) => hit.rule === "evaluative")).toBe(true);
    expect(bannedWordHits("환율 상승의 수혜가 기대된다").some((hit) => hit.rule === "prediction")).toBe(true);
    expect(bannedWordHits("금리 인하 때문에 실적이 좋아졌다").some((hit) => hit.rule === "causal")).toBe(true);
    expect(bannedWordHits("조달비용 상승으로 순이자마진이 하락").some((hit) => hit.rule === "causal")).toBe(true);
  });

  it("독트린 경고문 전종이 사전을 통과한다 — 사전에 예외를 뚫지 않고 문장을 고친 결과", () => {
    const offenders: string[] = [];
    for (const frame of DOCTRINE.archetypes) {
      for (const text of [frame.warning_short, frame.warning_full]) {
        for (const hit of bannedWordHits(text)) offenders.push(`${frame.code}/${hit.rule}: "${hit.matched}" — ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** 최소 팩트시트 — 투영 규칙만 시험한다. */
function sheet(overrides: Partial<FactSheet> = {}): FactSheet {
  return {
    ...({} as FactSheet),
    missing_fields: [],
    field_sources: {},
    ...overrides,
  };
}

describe("INV-08 · INV-12 렌더 투영", () => {
  it("출처·시각이 있고 결측이 아니면 통과한다", () => {
    const result = projectForRender(
      sheet({
        valuation: { per_ttm: 12.4 } as FactSheet["valuation"],
        field_sources: { "valuation.per_ttm": { source: "naver_integration", as_of: "2026-03-31" } },
      }),
      ["valuation.per_ttm"]
    );
    expect(result.values).toEqual([
      { path: "valuation.per_ttm", value: 12.4, source: "naver_integration", as_of: "2026-03-31" },
    ]);
    expect(result.excluded).toEqual([]);
  });

  it("의도적 위반(INV-08) — 출처 없는 수치는 투영되지 않는다", () => {
    const result = projectForRender(
      sheet({ valuation: { per_ttm: 12.4 } as FactSheet["valuation"] }),
      ["valuation.per_ttm"]
    );
    expect(result.values).toEqual([]);
    expect(result.excluded).toEqual([{ path: "valuation.per_ttm", reason: "no_source" }]);
  });

  it("의도적 위반(INV-12) — missing_fields 에 있으면 값이 남아 있어도 투영되지 않는다", () => {
    // DART 전체 재무제표가 013 으로 비면 EPS 가 결측이 된다. 값이 우연히 남아 있어도 렌더 금지.
    const result = projectForRender(
      sheet({
        missing_fields: ["fiscal.ttm.eps_diluted"],
        fiscal: { ttm: { eps_diluted: 4200 } } as FactSheet["fiscal"],
        field_sources: { "fiscal.ttm.eps_diluted": { source: "dart", as_of: "2026-03-31" } },
      }),
      ["fiscal.ttm.eps_diluted"]
    );
    expect(result.values).toEqual([]);
    expect(result.excluded).toEqual([{ path: "fiscal.ttm.eps_diluted", reason: "missing_field" }]);
  });

  it("제외를 조용히 삼키지 않는다 — 사유를 돌려준다", () => {
    const result = projectForRender(sheet(), ["valuation.per_ttm", "margin.operating_ttm"]);
    expect(result.excluded.map((row) => row.reason)).toEqual(["null_value", "null_value"]);
  });
});

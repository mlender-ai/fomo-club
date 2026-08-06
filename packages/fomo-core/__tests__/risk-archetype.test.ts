import { describe, expect, it } from "vitest";
import { DOCTRINE } from "../src/archetype/classify";
import { ARCHETYPE_RISK_DISCLAIMER, ARCHETYPE_RISK_MAX, type ArchetypeRiskItem } from "../src/archetype/types";
import { archetypeRiskBlock, riskCategoryCounts } from "../src/risk/archetype-risk";
import { bannedWordHits } from "../src/invariants/banned-words";

/**
 * WO-SUB-06 커밋 1 — 유형 리스크 로더 + 문안 규칙.
 *
 * 문안은 독트린(정본)에 있고 여기서 규칙을 강제한다. 새 유형이 추가되면 문안이 없는 채로
 * 통과하지 못하게 하는 것이 이 파일의 주 목적이다.
 */

const ALL_RISKS: ArchetypeRiskItem[] = DOCTRINE.archetypes.flatMap((frame) => frame.risks);
const CATEGORIES = new Set(["supply", "demand", "financial", "regulatory", "concentration"]);

/**
 * §4 규칙 5 "공포 조장 금지". INV-09 는 투자자문·평가·인과·예측을 막지만 공포 어휘는
 * 그 사전에 없다 — 리스크 서술 전용 규칙이라 여기 둔다.
 */
const FEAR_PATTERN = /폭락|붕괴|위험천만|치명적|공포|망한다|끝장/;

describe("유형 리스크 문안 (독트린 정본)", () => {
  it("모든 항목이 id·label·text·category 를 갖는다", () => {
    expect(ALL_RISKS.length).toBeGreaterThan(0);
    for (const risk of ALL_RISKS) {
      expect(risk.id, `id 누락: ${JSON.stringify(risk)}`).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(risk.label.trim().length, `label 누락: ${risk.id}`).toBeGreaterThan(0);
      expect(risk.text.trim().length, `text 누락: ${risk.id}`).toBeGreaterThan(0);
      expect(CATEGORIES.has(risk.category), `분류 오류: ${risk.id}=${risk.category}`).toBe(true);
    }
  });

  it("id 가 전 유형에서 유일하다 (WO-SUB-07 추적 키)", () => {
    const ids = ALL_RISKS.map((risk) => risk.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("문안이 INV-09 금지어 사전을 통과한다", () => {
    const violations = ALL_RISKS.flatMap((risk) =>
      bannedWordHits(risk.text).map((hit) => `${risk.id}: ${hit.rule}="${hit.matched}"`)
    );
    expect(violations).toEqual([]);
  });

  it("문안에 공포 조장 표현이 없다 (§4 규칙 5)", () => {
    const violations = ALL_RISKS.filter((risk) => FEAR_PATTERN.test(risk.text)).map((risk) => risk.id);
    expect(violations).toEqual([]);
  });

  it("문안이 조건형 1문장이다 — 인과 단정 금지(§4 규칙 3)", () => {
    for (const risk of ALL_RISKS) {
      // 마침표로 끊긴 두 문장을 넣으면 카드/디테일 예산이 깨진다.
      expect(risk.text.split(/[.。]/).filter((part) => part.trim().length > 0).length, risk.id).toBe(1);
      // 조건절이 있어야 "이 사실이 나타나면" 이라는 형태가 유지된다.
      expect(risk.text, `${risk.id} — 조건절 없음`).toMatch(/(면|으면|경우|국면)/);
    }
  });

  it("유형당 상한을 넘지 않는다", () => {
    for (const frame of DOCTRINE.archetypes) {
      expect(frame.risks.length, frame.code).toBeLessThanOrEqual(ARCHETYPE_RISK_MAX);
    }
  });
});

describe("archetypeRiskBlock", () => {
  it("항목이 있는 유형은 고지를 함께 돌려준다 (완료 조건 1)", () => {
    const block = archetypeRiskBlock("CYCLICAL_COMMODITY");
    expect(block.items.length).toBeGreaterThan(0);
    expect(block.disclaimer).toBe(ARCHETYPE_RISK_DISCLAIMER);
    expect(block.truncated).toBe(0);
  });

  it("항목이 없는 유형도 고지를 비우지 않는다 — 빈 블록과 미확보는 다른 말이다", () => {
    const block = archetypeRiskBlock("UNCLASSIFIED");
    expect(block.items).toEqual([]);
    expect(block.disclaimer).toBe(ARCHETYPE_RISK_DISCLAIMER);
  });

  it("독트린에 없는 코드는 조용히 빈 블록이 되지 않는다", () => {
    expect(() => archetypeRiskBlock("NOT_AN_ARCHETYPE" as never)).toThrow();
  });

  it("전 유형이 로더를 통과한다", () => {
    for (const frame of DOCTRINE.archetypes) {
      const block = archetypeRiskBlock(frame.code);
      expect(block.archetype).toBe(frame.code);
      expect(block.items.length + block.truncated).toBe(frame.risks.length);
    }
  });
});

describe("riskCategoryCounts", () => {
  it("범주 합이 항목 수와 같다", () => {
    for (const frame of DOCTRINE.archetypes) {
      const counts = riskCategoryCounts(frame.risks);
      const sum = Object.values(counts).reduce((acc, value) => acc + value, 0);
      expect(sum, frame.code).toBe(frame.risks.length);
    }
  });
});

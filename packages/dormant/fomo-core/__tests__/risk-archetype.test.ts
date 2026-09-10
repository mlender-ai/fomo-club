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

  /**
   * 말투 통일 (사람 결정 A). 카드가 해요체인데 리스크만 합니다체면 같은 화면에서 톤이 갈려
   * 리스크 섹션만 다른 앱에서 붙여온 것처럼 읽힌다. 새 문안이 합니다체로 들어오는 것을 막는다.
   */
  it("문안이 해요체다", () => {
    const violations = ALL_RISKS.filter((risk) => /(습니다|합니다|입니다|됩니다)/.test(risk.text)).map((risk) => risk.id);
    expect(violations).toEqual([]);
  });

  it("문안 길이가 60자를 넘지 않는다 — §6 UI 한 줄 예산", () => {
    const over = ALL_RISKS.filter((risk) => risk.text.length > 60).map((risk) => `${risk.id}(${risk.text.length})`);
    expect(over).toEqual([]);
  });

  /**
   * 왕초보 어휘 — 제품이 "처음 보는 회사"를 보여주는데 설명이 더 어려우면 안 된다.
   * 사용자가 지목한 트레이더 어휘를 사전으로 고정한다(§10 "보일러플레이트를 그대로 노출" 과 같은 계열의 실패).
   */
  const TRADER_TERMS = [
    "익스포저",
    "런웨이",
    "잉여현금흐름",
    "파이프라인",
    "재조달",
    "희석",
    "자본 배치",
    "순이자마진",
    "밸류에이션",
    "복제약",
  ];

  it("문안에 트레이더 어휘가 없다", () => {
    const violations = ALL_RISKS.flatMap((risk) =>
      TRADER_TERMS.filter((term) => risk.text.includes(term)).map((term) => `${risk.id}: ${term}`)
    );
    expect(violations).toEqual([]);
  });

  it("고지 문구도 해요체다 — 블록 안에서 톤이 갈리지 않는다", () => {
    expect(ARCHETYPE_RISK_DISCLAIMER).not.toMatch(/(습니다|합니다|입니다|됩니다)/);
  });

  it("경고문 10종도 같은 말투·어휘 규칙을 지킨다", () => {
    const copies = DOCTRINE.archetypes
      .flatMap((frame) => [frame.warning_short, frame.warning_full])
      .filter((text): text is string => Boolean(text));
    expect(copies.length).toBeGreaterThan(0);
    const violations = copies.flatMap((text) => {
      const hits: string[] = [];
      if (/(습니다|합니다|입니다|됩니다)/.test(text)) hits.push(`합니다체: ${text.slice(0, 30)}`);
      for (const term of TRADER_TERMS) if (text.includes(term)) hits.push(`${term}: ${text.slice(0, 30)}`);
      for (const hit of bannedWordHits(text)) hits.push(`${hit.rule}="${hit.matched}"`);
      return hits;
    });
    expect(violations).toEqual([]);
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

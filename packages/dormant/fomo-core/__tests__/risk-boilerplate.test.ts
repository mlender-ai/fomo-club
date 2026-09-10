import { describe, expect, it } from "vitest";
import { DOCTRINE } from "../src/archetype/classify";
import { boilerplateHits, boilerplateRules, filterBoilerplate, isBoilerplate } from "../src/risk/boilerplate";

/**
 * WO-SUB-06 커밋 3 — 보일러플레이트 필터.
 *
 * 완료 조건 6: "골든셋에서 '경쟁 심화', '경기 변동' 류 문구를 제거한다."
 * 반대 방향(§10)도 함께 고정한다: 종목 고유 사실을 지우면 커버리지만 줄고 무엇이
 * 지워졌는지 안 보인다.
 */

/** 실제 공시 위험요소에 흔한 문구 — 지워져야 하는 것. */
const BOILERPLATE = [
  "동종 업계의 경쟁이 치열해지고 있습니다",
  "시장 경쟁이 심화될 수 있습니다",
  "국내외 경제 상황의 변화에 영향을 받을 수 있습니다",
  "경기 변동에 따라 실적이 달라질 수 있습니다",
  "금리·환율·유가 변동에 노출되어 있습니다",
  "관련 법령의 제정 및 개정에 따라 영향을 받을 수 있습니다",
  "천재지변 등 예측할 수 없는 사유가 발생할 수 있습니다",
  "우수 인력의 확보가 어려워질 수 있습니다",
  "해킹 등 사이버 공격이 발생할 가능성이 있습니다",
  "지식재산권 침해 분쟁이 발생할 가능성이 있습니다",
];

/** 이 회사만의 사실 — 살아남아야 하는 것. */
const SPECIFIC = [
  "주력 품목 케이캡의 물질특허가 2031년 만료됩니다",
  "매출의 42%가 상위 3개 고객에서 발생합니다",
  "2026년 1분기 대손충당금 전입액이 전년 동기의 2.4배입니다",
  "미국 FDA 실사에서 지적사항 3건을 받았습니다",
  "상업용 부동산 대출이 총여신의 28%입니다",
  "SK하이닉스향 매출 비중이 61%입니다",
];

describe("보일러플레이트 사전 v1", () => {
  it("전 기업 공통 문구를 지운다 (완료 조건 6)", () => {
    const survived = BOILERPLATE.filter((text) => !isBoilerplate(text));
    expect(survived).toEqual([]);
  });

  it("종목 고유 사실은 지우지 않는다 (§10 과잉 필터 방지)", () => {
    const removed = SPECIFIC.filter((text) => isBoilerplate(text)).map(
      (text) => `${text} → ${boilerplateHits(text).map((h) => h.rule).join(",")}`
    );
    expect(removed).toEqual([]);
  });

  it("빈 문장은 통과시키지 않는다", () => {
    expect(isBoilerplate("   ")).toBe(true);
  });

  it("수치·고유명사 없는 짧은 일반문을 마지막 그물로 잡는다", () => {
    expect(boilerplateHits("사업 환경이 나빠질 수 있습니다").map((h) => h.rule)).toContain("no_specifics");
    // 수치가 있으면 같은 길이라도 통과한다
    expect(isBoilerplate("영업이익률이 3분기 연속 하락했습니다")).toBe(false);
  });
});

describe("filterBoilerplate", () => {
  it("지워진 항목과 사유를 함께 돌려준다 — 조용한 절단 금지", () => {
    const result = filterBoilerplate([...BOILERPLATE, ...SPECIFIC], (text) => text);
    expect(result.kept).toEqual(SPECIFIC);
    expect(result.dropped).toHaveLength(BOILERPLATE.length);
    for (const entry of result.dropped) expect(entry.hits.length).toBeGreaterThan(0);
  });
});

/**
 * **필터와 독트린을 섞지 않는다.**
 *
 * 독트린의 `quality-competition` 은 이 필터의 `경쟁` 패턴과 문구 계열이 겹친다. 둘은 다르다 —
 * 유형 리스크는 고지를 붙여 일반론임을 밝히고 내보내고, 종목 고유 리스크는 이 회사만의
 * 사실이라 주장하므로 일반론이면 거짓이 된다. 필터를 공용으로 만들면 독트린 확정 항목이
 * 조용히 지워지는데, 이 테스트가 그 사고를 재현해 경계를 문서화한다.
 */
describe("적용 경계 — 유형 리스크에는 쓰지 않는다", () => {
  it("독트린 문안에 필터를 걸면 실제로 지워진다 (그래서 걸지 않는다)", () => {
    const doctrineTexts = DOCTRINE.archetypes.flatMap((frame) => frame.risks).map((risk) => risk.text);
    const wouldDrop = doctrineTexts.filter((text) => isBoilerplate(text));
    // 0 이 아님을 단정한다 — 0 이 되면 이 경계가 무해해 보여 누군가 공용화한다.
    expect(wouldDrop.length).toBeGreaterThan(0);
  });

  it("유형 리스크 렌더 경로는 필터를 부르지 않는다", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../src/risk/archetype-risk.ts", import.meta.url), "utf8")
    );
    expect(source).not.toContain("boilerplate");
  });
});

describe("사전 문서화", () => {
  it("모든 규칙이 사유를 갖는다 — 키울 때 중복·과잉을 판단할 근거", () => {
    const rules = boilerplateRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.note.length, rule.rule).toBeGreaterThan(10);
      expect(rule.source.length, rule.rule).toBeGreaterThan(0);
    }
  });
});

describe("사전 문서 동기화", () => {
  it("커밋된 BOILERPLATE_FILTER.md 가 정본 렌더와 일치한다", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { BOILERPLATE_DOC_PATH, renderBoilerplateDoc } = await import("../../../scripts/risk-boilerplate-render");
    const committed = readFileSync(join(process.cwd(), BOILERPLATE_DOC_PATH), "utf8");
    expect(committed).toBe(renderBoilerplateDoc());
  });
});

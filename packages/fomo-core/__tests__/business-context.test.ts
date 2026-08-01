import { describe, expect, it } from "vitest";
import {
  buildSlot3,
  computeBadge,
  contextViolations,
  DEPENDENCY_VARIABLES,
  dependencyVariable,
  isRenderable,
  mapDependencyVariable,
  promptOf,
  renderableVariables,
  sentenceViolations,
  sourcedSentence,
  toRenderable,
  topicParticle,
  type BusinessContext,
  type VariableObservation,
} from "@fomo/core";

/** WO-SUB-03 — 근거 강제·금지 패턴·배지·슬롯 3. 완료 조건 2·3·5·6·7. */

const CHUNK_IDS = ["doc#0", "doc#1"];

function sentence(text: string, ids: string[] = CHUNK_IDS, verified = true) {
  return sourcedSentence(text, ids, "disclosure", verified);
}

function context(overrides: Partial<BusinessContext> = {}): BusinessContext {
  const base: BusinessContext = {
    canonical: "테스트",
    market: "US",
    synthesized_at: "2026-07-29T00:00:00.000Z",
    prompt_version: "aaaa+bbbb",
    model: "test-model",
    slot1_revenue_source: sentence("지점망 기반 예수금과 대출이 주된 사업"),
    slot2_dependency: sentence("장단기 금리차와 예금 조달비용"),
    slot3_dependency_state: null,
    badge: "없음",
    insufficient_reason: null,
    documents: [],
    cited_chunks: [],
    errors: [],
    ...overrides,
  };
  return { ...base, badge: computeBadge(base) };
}

describe("근거 강제 (완료 조건 2)", () => {
  it("source_ids 가 비면 문장을 만들 수 없다", () => {
    expect(sourcedSentence("근거 없는 문장", [], "disclosure", true)).toBeNull();
    expect(sourcedSentence("근거 없는 문장", ["  "], "disclosure", true)).toBeNull();
  });

  it("빈 텍스트도 문장이 되지 않는다", () => {
    expect(sourcedSentence("   ", CHUNK_IDS, "disclosure", true)).toBeNull();
  });

  it("검증을 통과하지 않은 문장은 렌더 불가", () => {
    expect(isRenderable(sentence("검증 안 된 문장", CHUNK_IDS, false), "slot1")).toBe(false);
  });

  it("근거가 있고 검증을 통과하면 렌더 가능", () => {
    expect(isRenderable(sentence("구독료와 결제수수료 중심 매출"), "slot1")).toBe(true);
  });
});

describe("금지 패턴 (완료 조건 6·7)", () => {
  it("소재지·법인격만 설명하는 문장을 잡는다 — 현재 CLBK 노출 문구의 실패", () => {
    for (const text of [
      "메릴랜드 주에 소재한 은행 지주 회사입니다",
      "뉴저지에 본사를 둔 금융 회사입니다",
      "콜롬비아 은행의 주식 보유 회사입니다",
      "2013년 인적분할하여 설립된 제약회사입니다",
    ]) {
      const hits = sentenceViolations(sentence(text), "slot1");
      expect(hits.some((hit) => hit.rule === "location_only")).toBe(true);
    }
  });

  it("지명이 들어간 정상 문장은 통과한다", () => {
    const hits = sentenceViolations(sentence("뉴저지·뉴욕 100여 개 지점의 예대마진이 수익 대부분"), "slot1");
    expect(hits).toEqual([]);
  });

  it("평가 형용사를 잡는다", () => {
    for (const text of ["우수한 수익 구조", "유망한 신약 파이프라인", "탄탄한 재무구조", "선도적 시장 지위"]) {
      expect(sentenceViolations(sentence(text), "slot1").some((hit) => hit.rule === "evaluative")).toBe(true);
    }
  });

  it("인과 단정을 잡는다 — 검증 패스가 구조적으로 통과시키는 실패", () => {
    // 실측(EVAL_verifier.md 케이스 8): 검증기는 이 문장을 "지지된다"고 판정한다.
    // 청크에 조달비용 상승과 순이자이익이 각각 있으므로 검증기는 틀리지 않았다 — 인과로 이은 것이 문제다.
    for (const text of [
      "예금 조달비용 상승으로 순이자마진이 하락했다",
      "금리 인하 때문에 실적이 좋아졌다",
      "환율 상승 덕분에 수출이 늘었다",
      "유가 하락으로 정제마진이 개선",
    ]) {
      expect(sentenceViolations(sentence(text), "slot2").some((hit) => hit.rule === "causal")).toBe(true);
    }
  });

  it("시점 병기는 인과가 아니라 통과한다", () => {
    const hits = sentenceViolations(sentence("금리가 하락한 기간과 순이자마진 개선 기간이 겹친다"), "slot2");
    expect(hits.filter((hit) => hit.rule === "causal")).toEqual([]);
  });

  it("레코드 전체 검사가 슬롯별로 위반을 돌려준다", () => {
    const violations = contextViolations(
      context({ slot1_revenue_source: sentence("서울에 소재한 지주 회사입니다"), slot2_dependency: sentence("우수한 기술력") })
    );
    // 한 문장이 여러 패턴에 걸릴 수 있다("소재한" + "지주 회사입니다") — 슬롯 단위로 본다.
    expect([...new Set(violations.map((violation) => violation.slot))]).toEqual(["slot1", "slot2"]);
  });
});

describe("배지 (§4-7)", () => {
  it("슬롯 1·2 + 슬롯 3 이면 충분", () => {
    const slot3 = buildSlot3("장단기 금리차와 조달금리", {
      yield_curve_spread: { code: "yield_curve_spread", value_text: "0.55%p", as_of: "2026-07-25", source: "FRED:T10Y2Y" },
    });
    expect(slot3).not.toBeNull();
    expect(computeBadge({ slot1_revenue_source: sentence("A"), slot2_dependency: sentence("B"), slot3_dependency_state: slot3 })).toBe("충분");
  });

  it("슬롯 3 이 없으면 보통", () => {
    expect(computeBadge({ slot1_revenue_source: sentence("A"), slot2_dependency: sentence("B"), slot3_dependency_state: null })).toBe("보통");
  });

  it("슬롯 1만 있으면 낮음", () => {
    expect(computeBadge({ slot1_revenue_source: sentence("A"), slot2_dependency: null, slot3_dependency_state: null })).toBe("낮음");
  });

  it("전부 없으면 없음", () => {
    expect(computeBadge({ slot1_revenue_source: null, slot2_dependency: null, slot3_dependency_state: null })).toBe("없음");
  });

  it("근거가 벤더 요약뿐이면 충분을 주지 않는다 — 공시가 아님을 배지로 드러낸다", () => {
    const vendor = sourcedSentence("의약품 사업이 주력", CHUNK_IDS, "vendor_summary", true);
    const slot3 = buildSlot3("환율과 유가", {
      usd_krw: { code: "usd_krw", value_text: "1,380원", as_of: "2026-07-25", source: "FRED:DEXKOUS" },
    });
    expect(computeBadge({ slot1_revenue_source: vendor, slot2_dependency: vendor, slot3_dependency_state: slot3 })).toBe("보통");
  });
});

describe("렌더 계약 (완료 조건 5)", () => {
  it("배지가 없음이면 렌더 대상이 아니다 — 빈 헤더로 남기지 않는다", () => {
    expect(toRenderable(context({ slot1_revenue_source: null, slot2_dependency: null }))).toBeNull();
  });

  it("금지 패턴에 걸린 슬롯 1 은 렌더 대상에서 빠진다", () => {
    expect(toRenderable(context({ slot1_revenue_source: sentence("서울에 소재한 지주 회사입니다") }))).toBeNull();
  });

  it("렌더 대상은 인용 source_id 를 모아 준다", () => {
    const renderable = toRenderable(context());
    expect(renderable?.cited_source_ids).toEqual(CHUNK_IDS);
    expect(renderable?.vendor_only).toBe(false);
  });
});

describe("의존 변수 카탈로그 · 슬롯 3 (§4-6)", () => {
  it("키워드로 변수를 매핑한다", () => {
    expect(mapDependencyVariable("단기 조달금리와 대출 구조")?.code).toBe("interest_rate_short");
    expect(mapDependencyVariable("컨테이너 운임과 유가")?.code).toBe("shipping_rate_container");
  });

  it("여러 변수가 걸리면 문장에서 앞에 나온 것을 쓴다", () => {
    expect(mapDependencyVariable("환율과 유가에 걸려 있다")?.code).toBe("usd_krw");
    expect(mapDependencyVariable("유가와 환율에 걸려 있다")?.code).toBe("oil_price");
  });

  it("카탈로그에 없으면 매핑하지 않는다 — 자유 서술 금지", () => {
    expect(mapDependencyVariable("경영진의 실행력과 조직 문화")).toBeNull();
  });

  it("값 소스가 없는 변수는 슬롯 3 을 만들지 않는다 — 가짜 숫자 금지", () => {
    expect(dependencyVariable("memory_dram_price")?.source).toBeNull();
    expect(
      buildSlot3("메모리 가격에 걸려 있다", {
        memory_dram_price: { code: "memory_dram_price", value_text: "3.5달러", as_of: "2026-07-25", source: "guess" },
      })
    ).toBeNull();
  });

  it("관측값이 없으면 슬롯 3 을 만들지 않는다", () => {
    expect(buildSlot3("환율에 걸려 있다", {})).toBeNull();
  });

  it("템플릿은 인과 없이 값·기준일·방향만 담는다", () => {
    const observation: VariableObservation = {
      code: "oil_price",
      value_text: "배럴당 68.20달러",
      as_of: "2026-07-25",
      source: "FRED:DCOILWTICO",
      trend: { window: "3개월", direction: "하락" },
    };
    const slot3 = buildSlot3("유가와 정제마진", { oil_price: observation })!;
    expect(slot3.text).toBe("국제유가(WTI)는 2026-07-25 기준 배럴당 68.20달러입니다. (3개월 하락)");
    expect(sentenceViolations(sourcedSentence(slot3.text, ["x"], "market_data", true), "slot3")).toEqual([]);
  });

  it("조사를 받침에 맞춘다", () => {
    expect(topicParticle("환율")).toBe("은");
    expect(topicParticle("코스피")).toBe("는");
    // 괄호 표기는 읽을 때 건너뛴다 — 괄호 앞 한글("가")로 판정해야 "국제유가(WTI)는" 이 된다.
    expect(topicParticle("국제유가(WTI)")).toBe("는");
    expect(topicParticle("장단기 금리차(10년−2년)")).toBe("는");
  });

  it("값 소스가 있는 변수만 렌더 가능 목록에 든다", () => {
    const codes = renderableVariables().map((variable) => variable.code);
    expect(codes).toContain("usd_krw");
    expect(codes).not.toContain("memory_dram_price");
    expect(renderableVariables().length).toBeLessThan(DEPENDENCY_VARIABLES.length);
  });
});

describe("프롬프트 (완료 조건 3)", () => {
  it("프롬프트는 번들에서 로드되고 본문 해시를 갖는다", () => {
    for (const id of ["synthesize.v1", "verify.v1"]) {
      const prompt = promptOf(id);
      expect(prompt.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(prompt.text.length).toBeGreaterThan(200);
    }
  });

  it("합성 프롬프트가 금지 항목을 명시한다", () => {
    const text = promptOf("synthesize.v1").text;
    for (const rule of ["소재지", "인과", "null", "60자"]) expect(text).toContain(rule);
  });

  it("검증 프롬프트가 의심스러우면 폐기하도록 지시한다", () => {
    expect(promptOf("verify.v1").text).toContain("폐기하는 쪽으로");
  });
});


describe("슬롯3 폴백은 배지를 올리지 않는다 (WO-SUB-03.5 PART E-3 승인 조건)", () => {
  const disclosure = (text: string) => ({
    text,
    source_ids: ["d1"] as [string, ...string[]],
    kind: "disclosure" as const,
    verified: true,
  });
  const state = (source?: "observation" | "fallback_operating_income") => ({
    variable: "WTI",
    label_ko: "국제유가(WTI)",
    value_text: "$70",
    as_of: "2026-07-25",
    source: "FRED",
    trend_text: null,
    text: "국제유가(WTI)는 2026-07-25 기준 $70입니다.",
    ...(source ? { slot3_source: source } : {}),
  });

  it("실관측 슬롯3 은 충분까지 올라간다", () => {
    expect(computeBadge({
      slot1_revenue_source: disclosure("어디서 돈을 버는가"),
      slot2_dependency: disclosure("무엇에 걸려 있는가"),
      slot3_dependency_state: state("observation"),
    })).toBe("충분");
  });

  it("폴백(8분기 영업이익 추이)은 충분을 주지 않는다 — 배지 상향 금지", () => {
    expect(computeBadge({
      slot1_revenue_source: disclosure("어디서 돈을 버는가"),
      slot2_dependency: disclosure("무엇에 걸려 있는가"),
      slot3_dependency_state: state("fallback_operating_income"),
    })).toBe("보통");
  });

  it("출처 미기록(과거 레코드)은 실관측으로 읽는다", () => {
    expect(computeBadge({
      slot1_revenue_source: disclosure("어디서 돈을 버는가"),
      slot2_dependency: disclosure("무엇에 걸려 있는가"),
      slot3_dependency_state: state(),
    })).toBe("충분");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RISK_PROMPTS, riskPromptOf } from "@fomo/core";
import { RISK_PROMPT_CHARS, RISK_SYNTHESIZE_PROMPT_ID } from "../../lib/risk/synthesize";

/**
 * WO-SUB-06.5 합성 파이프라인 — 계약 검사.
 *
 * LLM 호출 자체는 여기서 하지 않는다(네트워크·비용). 대신 **깨지면 조용히 잘못 도는 것들**을 본다:
 * 프롬프트 정본↔번들 동기화, 검증기 재사용, 규칙 게이트가 합성 뒤에 있는지.
 */

const SYNTH = readFileSync(new URL("../../lib/risk/synthesize.ts", import.meta.url), "utf8");
const BUILD = readFileSync(new URL("../../lib/risk/build.ts", import.meta.url), "utf8");
const REFRESH = readFileSync(new URL("../../lib/risk/refresh.ts", import.meta.url), "utf8");

describe("프롬프트 번들", () => {
  it("정본과 번들 본문이 같다", () => {
    const source = readFileSync(new URL("../../../../prompts/risk/synthesize.v1.md", import.meta.url), "utf8");
    expect(riskPromptOf(RISK_SYNTHESIZE_PROMPT_ID).text).toBe(source);
  });

  it("검증 프롬프트를 새로 만들지 않았다 — WO-SUB-03 의 verify.v1 을 재사용한다(§5-2)", () => {
    expect(Object.keys(RISK_PROMPTS)).toEqual(["synthesize.v1"]);
    expect(SYNTH).toContain('verifySentence');
  });

  it("프롬프트가 뽑지 말 것을 명시한다 — 일반론·인과·투자판단·공포·관리방침", () => {
    const text = riskPromptOf(RISK_SYNTHESIZE_PROMPT_ID).text;
    for (const rule of ["일반론", "인과 단정", "투자 판단", "공포 조장", "관리 방침"]) {
      expect(text, rule).toContain(rule);
    }
  });
});

describe("합성 파이프라인 계약", () => {
  it("온도 0 이다 (§5-2 처리 2)", () => {
    expect(SYNTH).toMatch(/const TEMPERATURE = 0;/);
  });

  it("페이싱을 business-context 와 공유한다 — 배치마다 따로 두면 합산 TPM 을 넘긴다", () => {
    expect(SYNTH).toContain('from "../business-context/synthesize"');
    expect(SYNTH).toContain("callWithRetry");
  });

  it("검증 뒤에 규칙 게이트가 있다 — 검증은 인과·보일러플레이트를 통과시킨다", () => {
    const verifyAt = SYNTH.indexOf("await verifySentence");
    const gateAt = SYNTH.lastIndexOf("buildSymbolRiskBlock");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(verifyAt);
  });

  it("존재하지 않는 청크 인용을 버린다 (환각 인용)", () => {
    expect(SYNTH).toContain("validIds.has(id)");
  });

  it("실패해도 사유를 만들어 블록에 남긴다 — '리스크 없음'으로 저장되지 않는다", () => {
    for (const reason of ["LLM 미설정", "위험 섹션 청크 0건", "합성이 후보를 내지 못함"]) {
      expect(SYNTH, reason).toContain(reason);
    }
  });

  it("입력 상한이 사업 섹션(3,500자)보다 넓다 — 위험 섹션이 훨씬 길다", () => {
    expect(RISK_PROMPT_CHARS).toBeGreaterThan(3_500);
  });
});

describe("배치 계약", () => {
  it("US·KR 소스를 시장별로 나눠 쓴다", () => {
    expect(BUILD).toContain("fetchRiskFactorsSection");
    expect(BUILD).toContain("fetchKrRiskSections");
  });

  it("참조 편입 사유를 그대로 올린다 — '소스 없음'과 구분된다", () => {
    expect(BUILD).toContain("INCORPORATED_BY_REFERENCE_REASON");
  });

  it("실패해도 레코드를 쓴다 — 안 쓰면 다음 실행이 같은 실패를 반복한다", () => {
    expect(BUILD).toContain("await writeSymbolRisk(record)");
    // 성공 분기 안에만 있으면 안 된다 — 함수 끝에서 무조건 쓴다.
    const writeAt = BUILD.indexOf("await writeSymbolRisk(record)");
    const synthAt = BUILD.indexOf("await synthesizeSymbolRisk");
    expect(writeAt).toBeGreaterThan(synthAt);
  });

  it("KR 은 사업 위험을 주석보다 앞에 둔다 — 청크 예산이 앞에서부터 찬다", () => {
    expect(BUILD).toMatch(/section === "business" \? -1/);
  });

  it("프롬프트 본문 해시를 레코드에 남긴다", () => {
    expect(BUILD).toContain("prompt_hash: riskPromptOf(synthesis.promptId).hash");
  });
});

describe("재합성 판정", () => {
  it("본문 해시로 비교한다 — 버전 문자열이 아니다", () => {
    expect(REFRESH).toContain("record.prompt_hash !== hash");
  });

  it("쿼터·호출 실패 레코드는 재시도한다 — 영구 결손 방지", () => {
    expect(REFRESH).toMatch(/RETRYABLE_REASON\s*=/);
    for (const word of ["쿼터", "호출 실패", "API_KEY"]) {
      expect(REFRESH, word).toContain(word);
    }
  });

  it("건너뛴 수를 응답에 남긴다 — 비용이 어디로 갔는지 보인다", () => {
    expect(REFRESH).toMatch(/skipped/);
  });
});

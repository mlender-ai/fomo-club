import { describe, expect, it } from "vitest";
import { jaccard, labelCard, ratio, COPYPASTE_JACCARD } from "../audit/substance-labels";
import { seededShuffle, seededRandom, AUDIT_SEED, flag, numericFlag } from "../audit/universe";

/**
 * WO-SUB-00 §7 완료 조건 1·2 — 감사 스크립트는 시드 고정으로 재실행 시 동일 결과를 내야 하고,
 * 라벨 규칙은 흔들리면 안 된다(규칙이 흔들리면 기준선이 무의미해진다).
 */

describe("재현성 — 시드 고정", () => {
  it("같은 시드는 같은 순열을 낸다", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(seededShuffle(items, AUDIT_SEED)).toEqual(seededShuffle(items, AUDIT_SEED));
  });

  it("다른 시드는 다른 순열을 낸다(셔플이 실제로 동작)", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(seededShuffle(items, AUDIT_SEED)).not.toEqual(seededShuffle(items, AUDIT_SEED + 1));
  });

  it("입력 배열을 변형하지 않는다", () => {
    const items = [1, 2, 3, 4, 5];
    seededShuffle(items, AUDIT_SEED);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it("PRNG 는 Math.random 이 아니라 시드에서 결정된다", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("has_business_context — 원문 복붙은 정보로 세지 않는다", () => {
  const nasdaq =
    "Columbia Financial, Inc. operates as the holding company for Columbia Bank that provides financial services to businesses and consumers in New Jersey.";

  it("외부 원문을 그대로 넣으면 false", () => {
    const labels = labelCard({ businessText: nasdaq, externalDescription: nasdaq });
    expect(labels.has_business_context).toBe(false);
    expect(labels.reasons.join(" ")).toContain("복붙");
  });

  it("공백·구두점만 다른 복붙도 false", () => {
    const labels = labelCard({
      businessText: nasdaq.replace(/,/g, "").replace(/\s+/g, "  ").toUpperCase(),
      externalDescription: nasdaq,
    });
    expect(labels.has_business_context).toBe(false);
  });

  it("자체 서술이면 true", () => {
    const labels = labelCard({
      businessText: "뉴저지·뉴욕 지점망의 예대 마진이 수익의 대부분이고, 상업용 부동산 대출 비중이 높다.",
      externalDescription: nasdaq,
    });
    expect(labels.has_business_context).toBe(true);
  });

  it("빈 값이면 false", () => {
    expect(labelCard({ businessText: "   " }).has_business_context).toBe(false);
    expect(labelCard({}).has_business_context).toBe(false);
  });

  it("유사도 임계값은 0.8", () => {
    expect(COPYPASTE_JACCARD).toBe(0.8);
    expect(jaccard("bank holding company deposits", "bank holding company deposits")).toBe(1);
    expect(jaccard("bank holding company deposits", "memory semiconductor foundry wafer")).toBe(0);
  });

  it("1글자 토큰은 노이즈로 보고 세지 않는다(토크나이저 규칙)", () => {
    // 조사·이니셜 한 글자가 유사도를 흔들지 않게 한다. 빈 집합이면 0.
    expect(jaccard("a b c d", "a b c d")).toBe(0);
  });
});

describe("has_financial_fact — 필드가 있어도 null 이면 false", () => {
  it("실제 수치가 하나라도 있으면 true", () => {
    expect(labelCard({ financialValues: { per: 9.4 } }).has_financial_fact).toBe(true);
  });

  it("전부 null 이면 false", () => {
    expect(labelCard({ financialValues: { per: null, pbr: undefined } }).has_financial_fact).toBe(false);
  });

  it("가격·등락률은 재무 사실이 아니다(키 목록에 없음)", () => {
    expect(labelCard({ financialValues: { price: 10.88, changePct: 1.2 } as never }).has_financial_fact).toBe(false);
  });

  it("NaN 은 수치로 세지 않는다", () => {
    expect(labelCard({ financialValues: { per: Number.NaN } }).has_financial_fact).toBe(false);
  });
});

describe("has_frame — 해석 문장", () => {
  it("문장이 있으면 true, 없으면 false", () => {
    expect(labelCard({ frameText: "현재 PER 은 최근 5년 밴드 하위 20% 구간입니다." }).has_frame).toBe(true);
    expect(labelCard({ frameText: null }).has_frame).toBe(false);
  });
});

describe("비율 산출", () => {
  it("빈 입력은 0%", () => {
    expect(ratio([], "has_frame")).toBe(0);
  });

  it("절반이면 50%", () => {
    const items = [labelCard({ frameText: "있음" }), labelCard({ frameText: null })];
    expect(ratio(items, "has_frame")).toBe(50);
  });
});

describe("인자 파싱 — 1차 실측 사고 재발 방지", () => {
  it("플래그가 없으면 기본값을 쓴다(다음 토큰을 집지 않는다)", () => {
    // 실제 사고: --target 없이 실행 → indexOf(-1)+1=0 → args[0]="--base" → Number(NaN)
    // → slice(0, NaN) → 표본 0장. 로그에는 "13장 로드"가 찍혀 있어 눈치채기 어려웠다.
    const args = ["--base", "https://x", "--out", "docs/audit"];
    expect(numericFlag(args, "--target", 200)).toBe(200);
    expect(flag(args, "--target")).toBeUndefined();
  });

  it("플래그가 있으면 그 값을 쓴다", () => {
    expect(numericFlag(["--limit", "130"], "--limit", 999)).toBe(130);
    expect(flag(["--base", "https://x"], "--base")).toBe("https://x");
  });

  it("값이 숫자가 아니면 기본값으로 떨어진다", () => {
    expect(numericFlag(["--limit", "abc"], "--limit", 42)).toBe(42);
  });

  it("플래그가 마지막 토큰이면 값이 없다고 본다", () => {
    expect(numericFlag(["--limit"], "--limit", 7)).toBe(7);
  });
});

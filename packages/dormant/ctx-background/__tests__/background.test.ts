import { describe, expect, it } from "vitest";
import { BACKGROUND_CATALOG, catalogEntry, isProductionExposable, pendingReview } from "../src/catalog";
import { findCopyViolations, isCopySafe, assertCopySafe } from "../src/copy-guard";
import { CO_OBSERVATION_NOTE, MAX_CANDIDATES, toEvidencePair, type BackgroundEvidence } from "../src/types";

const evidence = (text: string): BackgroundEvidence => ({
  text,
  metric: "drawdown_from_high",
  value: -38,
  source: "candles",
  as_of: "2026-08-16",
});

describe("완료조건 4 — 금지어 사전 (§5-1)", () => {
  it.each([
    ["실적이 좋아져서 기관이 사고 있어요", "causal"],
    ["실적 개선 때문에 사고 있어요", "causal"],
    ["악재로 인해 조정을 받았어요", "causal"],
    ["호재가 반영되는 중이에요", "evaluation"],
    ["저평가 구간이에요", "opinion"],
    ["곧 오를 자리예요", "prediction"],
    ["지금 안 사면 늦어요", "prediction"],
  ])("금지 문안을 잡는다: %s", (text, reason) => {
    const violations = findCopyViolations(text);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.reason)).toContain(reason);
  });

  it("§5-2 허용 형태는 통과한다", () => {
    expect(isCopySafe("회사가 전망을 올린 뒤부터 기관 순매수가 이어지고 있어요")).toBe(true);
    expect(isCopySafe("2026-07-18 가이던스 상향 공시")).toBe(true);
    expect(isCopySafe(CO_OBSERVATION_NOTE)).toBe(true);
  });

  it("**카탈로그 전 문안이 금지어를 포함하지 않는다**", () => {
    const texts = BACKGROUND_CATALOG.flatMap((e) => [e.label_ko, e.falsifier]);
    const result = assertCopySafe(texts);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("§3 카탈로그 — 8종 + 반증조건 (완료조건 1·3)", () => {
  it("8개 후보가 전부 있다", () => {
    expect(BACKGROUND_CATALOG).toHaveLength(8);
    expect(BACKGROUND_CATALOG.map((e) => e.code)).toEqual([
      "DEEP_DRAWDOWN",
      "RANGE_ACCUMULATION",
      "PRE_EVENT",
      "POST_MATERIAL",
      "GUIDANCE_SHIFT",
      "SHAKEOUT_BUY",
      "VOLUME_WAKING",
      "NO_VISIBLE_REASON",
    ]);
  });

  it("**모든 후보에 falsifier 가 있다** — 자동 판정용 지표도 함께", () => {
    for (const entry of BACKGROUND_CATALOG) {
      expect(entry.falsifier.trim().length).toBeGreaterThan(0);
      expect(entry.falsifier_metric.trim().length).toBeGreaterThan(0);
    }
  });

  it("NO_VISIBLE_REASON 도 정상 출력이라 카탈로그에 있다 (§3-1 규칙 2)", () => {
    expect(catalogEntry("NO_VISIBLE_REASON")).not.toBeNull();
  });
});

describe("§10 — 사람 승인 전 프로덕션 노출 차단", () => {
  it("전 항목이 draft 이고 노출되지 않는다", () => {
    expect(pendingReview()).toHaveLength(8);
    for (const entry of BACKGROUND_CATALOG) {
      expect(isProductionExposable(entry.code)).toBe(false);
    }
  });
});

describe("완료조건 2 — 근거 2개 미만이면 후보를 만들지 않는다", () => {
  it("0개·1개는 거부한다", () => {
    expect(toEvidencePair([])).toBeNull();
    expect(toEvidencePair([evidence("52주 고점 대비 -38%")])).toBeNull();
  });

  it("2개 이상은 통과하고 개수를 보존한다", () => {
    const pair = toEvidencePair([evidence("a"), evidence("b"), evidence("c")]);
    expect(pair).not.toBeNull();
    expect(pair).toHaveLength(3);
  });
});

describe("완료조건 5 — 같은 시기에 관측됐다 꼬리표", () => {
  it("문구가 한 곳에 고정돼 있고 인과를 부정한다", () => {
    expect(CO_OBSERVATION_NOTE).toContain("같은 시기에 관측");
    expect(CO_OBSERVATION_NOTE).toContain("인과는 확인할 수 없어요");
  });
});

describe("§3-1 규칙 1 — 최대 2개", () => {
  it("상한이 2다", () => {
    expect(MAX_CANDIDATES).toBe(2);
  });
});

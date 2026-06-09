import { describe, it, expect } from "vitest";
import {
  validateConstraint,
  activeConstraints,
  renderForLane,
  renderForBrief,
  dedupeAndCompact,
  normalizeRule,
  makeId,
  normalizeIncoming,
  mergeConstraints,
  constraintKeywords,
  checkViolations,
  sumHitMaps,
  applyHits,
  type Constraint,
} from "../constraints";

const base = (over: Partial<Constraint>): Constraint => ({
  id: "c-1",
  rule: "테스트 규칙",
  scope: ["all"],
  kind: "prohibition",
  source: "test",
  permanent: true,
  createdAt: "2026-01-01",
  expiresAt: null,
  hits: 0,
  ...over,
});

describe("validateConstraint", () => {
  it("정상 객체를 통과시킨다", () => {
    expect(validateConstraint(base({})).id).toBe("c-1");
  });
  it("잘못된 kind 는 throw", () => {
    expect(() => validateConstraint(base({ kind: "bogus" as never }))).toThrow(/kind/);
  });
  it("빈 scope 는 throw", () => {
    expect(() => validateConstraint(base({ scope: [] }))).toThrow(/scope/);
  });
  it("비영구인데 expiresAt 없으면 throw", () => {
    expect(() => validateConstraint(base({ permanent: false, expiresAt: null }))).toThrow(/expiresAt/);
  });
});

describe("activeConstraints", () => {
  it("permanent 와 미만료만 남기고 만료된 것은 제외", () => {
    const all = [
      base({ id: "perm", permanent: true }),
      base({ id: "future", permanent: false, expiresAt: "2026-12-31" }),
      base({ id: "past", permanent: false, expiresAt: "2026-01-05" }),
    ];
    const active = activeConstraints(all, "2026-06-02");
    expect(active.map((c) => c.id).sort()).toEqual(["future", "perm"]);
  });
});

describe("renderForLane", () => {
  it("scope 에 lane 또는 all 이 포함된 것만 렌더", () => {
    const cs = [
      base({ id: "pmonly", rule: "PM 전용", scope: ["pm"] }),
      base({ id: "ctoonly", rule: "CTO 전용", scope: ["cto"] }),
      base({ id: "allrule", rule: "전체 규칙", scope: ["all"] }),
    ];
    const pm = renderForLane(cs, "pm");
    expect(pm).toContain("PM 전용");
    expect(pm).toContain("전체 규칙");
    expect(pm).not.toContain("CTO 전용");
  });
  it("all scope 는 모든 lane 에 나타난다", () => {
    const cs = [base({ rule: "전체", scope: ["all"] })];
    for (const lane of ["pm", "frontend", "cto", "security"]) {
      expect(renderForLane(cs, lane)).toContain("전체");
    }
  });
  it("매칭 없으면 빈 문자열", () => {
    expect(renderForLane([base({ scope: ["pm"] })], "qa")).toBe("");
  });
});

describe("renderForBrief", () => {
  it("비면 안내, 있으면 전체 나열", () => {
    expect(renderForBrief([])).toContain("없음");
    expect(renderForBrief([base({ rule: "X규칙" })])).toContain("X규칙");
  });
});

describe("dedupeAndCompact", () => {
  it("만료 constraint 를 제거한다", () => {
    const all = [
      base({ id: "keep", permanent: true }),
      base({ id: "expired", permanent: false, expiresAt: "2026-01-05" }),
    ];
    const { kept, removed } = dedupeAndCompact(all, "2026-06-02");
    expect(kept.map((c) => c.id)).toEqual(["keep"]);
    expect(removed.map((c) => c.id)).toEqual(["expired"]);
  });
  it("정규화 동일 rule 중복을 제거하고 scope/hits 병합", () => {
    const all = [
      base({ id: "a", rule: "데이터 불일치 배너 금지", scope: ["pm"], hits: 2 }),
      base({ id: "b", rule: "데이터  불일치  배너  금지!!", scope: ["frontend"], hits: 3 }),
    ];
    const { kept, removed } = dedupeAndCompact(all, "2026-06-02");
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(kept[0].hits).toBe(5);
    expect(kept[0].scope.sort()).toEqual(["frontend", "pm"]);
  });
});

describe("normalizeRule / makeId", () => {
  it("공백·구두점·대소문자 차이를 무시", () => {
    expect(normalizeRule("Hello, World!")).toBe(normalizeRule("helloworld"));
  });
  it("makeId 는 결정론적", () => {
    expect(makeId("데이터 불일치 금지", "2026-05-30")).toBe(makeId("데이터 불일치 금지", "2026-05-30"));
    expect(makeId("규칙", "2026-05-30")).toMatch(/^c-20260530-/);
  });
});

describe("normalizeIncoming / mergeConstraints", () => {
  it("부분 입력에 기본값을 채운다", () => {
    const c = normalizeIncoming({ rule: "새 규칙" }, "2026-06-02");
    expect(c.scope).toEqual(["all"]);
    expect(c.kind).toBe("prohibition");
    expect(c.permanent).toBe(true);
    expect(c.hits).toBe(0);
    expect(c.createdAt).toBe("2026-06-02");
  });
  it("기존과 중복인 후보는 skip, 새 것만 added", () => {
    const existing = [base({ id: "x", rule: "이미 있는 규칙" })];
    const merged = mergeConstraints(
      existing,
      [{ rule: "이미 있는 규칙" }, { rule: "완전히 새로운 규칙", scope: ["cto"] }],
      "2026-06-02",
    );
    expect(merged.added).toHaveLength(1);
    expect(merged.added[0].rule).toBe("완전히 새로운 규칙");
    expect(merged.skipped).toHaveLength(1);
    expect(merged.constraints).toHaveLength(2);
  });
  it("rule 없는 잘못된 후보는 skip", () => {
    const merged = mergeConstraints([], [{ rule: "" }], "2026-06-02");
    expect(merged.added).toHaveLength(0);
    expect(merged.skipped).toHaveLength(1);
  });
  it("keywords 를 보존한다", () => {
    const c = normalizeIncoming({ rule: "배너 금지", keywords: ["DataMismatchBanner"] }, "2026-06-02");
    expect(c.keywords).toEqual(["DataMismatchBanner"]);
  });
});

describe("constraintKeywords", () => {
  it("명시 keywords 를 우선 사용", () => {
    expect(constraintKeywords(base({ keywords: ["햅틱", "글로우"] }))).toEqual(["햅틱", "글로우"]);
  });
  it("없으면 따옴표·CamelCase 토큰 추출", () => {
    const kws = constraintKeywords(base({ rule: '"DataMismatchBanner" 류와 MismatchAlert 금지', keywords: undefined }));
    expect(kws).toContain("DataMismatchBanner");
    expect(kws).toContain("MismatchAlert");
  });
});

describe("checkViolations", () => {
  const dm = base({
    id: "dm",
    rule: "데이터 불일치 배너 금지",
    scope: ["frontend", "all"],
    kind: "prohibition",
    keywords: ["DataMismatchBanner", "불일치 배너"],
  });
  const toss = base({ id: "toss", rule: "토스 멘탈모델", scope: ["all"], kind: "mental-model", keywords: ["토스"] });

  it("금지 키워드를 포함한 제안을 위반으로 잡는다", () => {
    const v = checkViolations("DataMismatchBanner 컴포넌트를 추가하자", [dm], "frontend");
    expect(v).toHaveLength(1);
    expect(v[0]!.constraint.id).toBe("dm");
    expect(v[0]!.matched).toBe("DataMismatchBanner");
  });
  it("무관한 제안은 위반 아님", () => {
    expect(checkViolations("뉴스 탭 무한 스크롤 추가", [dm], "frontend")).toEqual([]);
  });
  it("lane 이 다르면(scope 불포함) 검사 안 함", () => {
    const pmOnly = base({ id: "x", rule: "x", scope: ["pm"], kind: "prohibition", keywords: ["배너"] });
    expect(checkViolations("배너 추가", [pmOnly], "qa")).toEqual([]);
  });
  it("prohibition 이 아닌 kind 는 위반 대상 아님", () => {
    expect(checkViolations("토스 레퍼런스 적용", [toss], "frontend")).toEqual([]);
  });

  // ── Phase B: 부정/회피 문맥 오탐 제거 (#416 사고 회귀) ──
  const advice = base({
    id: "adv",
    rule: "투자 조언성 표현 금지",
    scope: ["all"],
    kind: "prohibition",
    keywords: ["투자 조언", "매수 추천"],
  });
  it("회피/면책 문맥(아님·금지·하지 않)의 키워드는 위반 아님", () => {
    expect(checkViolations("투자 조언이 아님을 명시하는 면책 카피를 추가", [advice], "marketing")).toEqual([]);
    expect(checkViolations("매수 추천을 하지 않는다는 톤을 유지", [advice], "marketing")).toEqual([]);
    expect(checkViolations("투자 조언 금지 원칙을 지킨다", [advice], "marketing")).toEqual([]);
  });
  it("실제로 권유하는 문맥은 여전히 위반으로 잡는다", () => {
    const v = checkViolations("매수 추천 배지를 종목 카드에 노출하자", [advice], "marketing");
    expect(v).toHaveLength(1);
    expect(v[0]!.matched).toBe("매수 추천");
  });
  it("부정 등장과 비-부정 등장이 섞이면 위반(비-부정 우선)", () => {
    const v = checkViolations("투자 조언은 금지지만, 이번엔 투자 조언 문구를 본문에 넣자", [advice], "marketing");
    expect(v).toHaveLength(1);
  });
});

describe("hits 집계", () => {
  it("sumHitMaps 가 여러 맵을 합산", () => {
    expect(sumHitMaps([{ a: 1, b: 2 }, { a: 3 }, {}])).toEqual({ a: 4, b: 2 });
  });
  it("applyHits 가 id 매칭해 hits 누적(불변)", () => {
    const cs = [base({ id: "a", hits: 1 }), base({ id: "b", hits: 0 })];
    const out = applyHits(cs, { a: 2 });
    expect(out[0]!.hits).toBe(3);
    expect(out[1]!.hits).toBe(0);
    expect(cs[0]!.hits).toBe(1); // 원본 불변
  });
});

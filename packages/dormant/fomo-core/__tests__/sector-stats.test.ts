import { describe, it, expect } from "vitest";
import {
  buildSectorStats,
  sectorCandidates,
  sectorComparison,
  SECTOR_MIN_MEMBERS,
  type SectorStatInput,
} from "../src/keyword-cards/sector-stats";

const row = (o: Partial<SectorStatInput> = {}): SectorStatInput => ({
  industry: "제약", sector: "헬스케어", per: 12, pbr: 1, debtToEquity: 40, dividendYield: 1, ...o,
});

/**
 * FIX-02 PART B — 게이트가 **그룹 크기**에서 **지표별 비교 대상 수(자기 제외)** 로 옮겨졌다.
 *
 * 종전 테스트는 `buildSectorStats` 가 5종목 미만 그룹을 아예 빼는 것을 고정했다.
 * 그 규약이 실측 사고를 만들었다 — 5종목 그룹에서 `pbr` 을 가진 종목이 하나면 그 하나(자기)가
 * 중앙값이 됐다(`Major Banks 업종 중간값 1.02배` = 자기 PBR).
 *
 * 이제 표를 만드는 단계는 **크기로 걸러내지 않고**, 읽는 단계(`sectorComparison`)가
 * 지표별로 자기를 뺀 표본 수를 세어 자른다.
 */
describe("업종 통계 — 표는 크기로 걸러내지 않는다 (FIX-02 B-2)", () => {
  it("5종목 미만 그룹도 표에는 들어간다 — 자르는 것은 읽는 쪽 일이다", () => {
    const stats = buildSectorStats(Array.from({ length: SECTOR_MIN_MEMBERS - 1 }, () => row()));
    expect(stats.get("industry:제약")).toBeDefined();
    // 다만 비교는 만들어지지 않는다(자기를 빼면 3곳뿐).
    expect(sectorComparison(sectorCandidates(stats, { industry: "제약", sector: "헬스케어" }), "per", 12)).toBeNull();
  });

  it("좁은 분류가 모자라면 상위 분류로 올린다 — 지표별로 판단한다", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ industry: "제약" })),
      ...Array.from({ length: 4 }, () => row({ industry: "의료기기" })),
    ];
    const stats = buildSectorStats(rows);
    const cands = sectorCandidates(stats, { industry: "제약", sector: "헬스케어" });
    expect(cands.map((c) => c.level)).toEqual(["industry", "sector"]);
    // 제약 3곳(자기 빼면 2)은 모자라고, 헬스케어 7곳(자기 빼면 6)이 받는다.
    const cmp = sectorComparison(cands, "per", 12)!;
    expect(cmp.level).toBe("sector");
    expect(cmp.count).toBe(6);
  });

  it("상위 분류도 모자라면 null — 없는 비교를 만들지 않는다", () => {
    const stats = buildSectorStats([row(), row()]);
    expect(sectorComparison(sectorCandidates(stats, { industry: "제약", sector: "헬스케어" }), "per", 12)).toBeNull();
  });

  it("분류가 없는 종목은 통계에 안 들어가고 후보도 없다", () => {
    const stats = buildSectorStats(Array.from({ length: 6 }, () => row({ industry: null, sector: null })));
    expect(stats.size).toBe(0);
    expect(sectorCandidates(stats, { industry: null, sector: null })).toEqual([]);
  });
});

describe("자기 자신을 뺀 중앙값 (FIX-02 B-3)", () => {
  it("**업종 평균이 자기 값과 같아지지 않는다** — 실측 사고를 이 검사로 막는다", () => {
    /**
     * Pinnacle Financial 재현: 그룹에 6종목이 있지만 `pbr` 을 가진 종목이 조회 대상 하나뿐이면
     * 종전에는 그 하나가 중앙값이 되어 `자기 값과 비슷해요` 가 나갔다. 이제는 표본이 0이라
     * 비교가 아예 없다.
     */
    const rows = [
      row({ pbr: 1.02 }),
      ...Array.from({ length: 5 }, () => row({ pbr: null })),
    ];
    const cands = sectorCandidates(buildSectorStats(rows), { industry: "제약", sector: "헬스케어" });
    expect(sectorComparison(cands, "pbr", 1.02)).toBeNull();
  });

  it("자기 한 몫만 뺀다 — 같은 값을 가진 다른 종목까지 지우지 않는다", () => {
    const rows = [row({ per: 12 }), row({ per: 12 }), row({ per: 12 }), row({ per: 12 }), row({ per: 12 }), row({ per: 12 })];
    const cands = sectorCandidates(buildSectorStats(rows), { industry: "제약", sector: "헬스케어" });
    const cmp = sectorComparison(cands, "per", 12)!;
    // 6곳 중 자기 하나만 빠져 5곳이 남는다.
    expect(cmp.count).toBe(5);
    expect(cmp.median).toBe(12);
  });

  it("자기를 빼면 중앙값이 달라진다 — 그게 비교의 뜻이다", () => {
    const rows = [row({ per: 4 }), row({ per: 6 }), row({ per: 8 }), row({ per: 10 }), row({ per: 12 }), row({ per: 100 })];
    const cands = sectorCandidates(buildSectorStats(rows), { industry: "제약", sector: "헬스케어" });
    // 자기(100)를 빼면 4·6·8·10·12 → 8. 자기를 포함하면 (8+10)/2 = 9 였다.
    const cmp = sectorComparison(cands, "per", 100)!;
    expect(cmp.count).toBe(5);
    expect(cmp.median).toBe(8);
  });

  it("몇 곳과 견줬는지 돌려준다 — 화면이 그 수를 밝힌다 (B-4)", () => {
    const rows = Array.from({ length: 13 }, (_, i) => row({ per: 10 + i }));
    const cands = sectorCandidates(buildSectorStats(rows), { industry: "제약", sector: "헬스케어" });
    const cmp = sectorComparison(cands, "per", 10)!;
    expect(cmp.count).toBe(12);
    expect(cmp.label).toBe("제약");
  });
});

describe("중앙값과 표본 정리 — 종전 규칙은 그대로다", () => {
  const medianOf = (rows: SectorStatInput[], metric: "per" | "pbr", own: number | null) =>
    sectorComparison(sectorCandidates(buildSectorStats(rows), { industry: "제약", sector: "헬스케어" }), metric, own);

  it("평균이 아니라 중앙값이다 — PER 하나가 튀어도 안 흔들린다", () => {
    const rows = [row({ per: 10 }), row({ per: 11 }), row({ per: 12 }), row({ per: 13 }), row({ per: 14 }), row({ per: 250 })];
    // 250 은 상한(300) 안이라 표본에 남지만 중앙값은 흔들리지 않는다.
    expect(medianOf(rows, "per", null)!.median).toBe(12.5);
  });

  it("적자(PER 음수·없음)는 「싸다」가 아니라 **잴 수 없다** — 통계에서 뺀다", () => {
    const rows = [row({ per: -5 }), row({ per: null }), row({ per: 10 }), row({ per: 12 }), row({ per: 14 }), row({ per: 16 }), row({ per: 18 })];
    expect(medianOf(rows, "per", null)!.count).toBe(5);
    expect(medianOf(rows, "per", null)!.median).toBe(14);
  });

  it("이익이 0에 가까워 PER 이 수천 배인 것도 뺀다 — 밸류에이션이 아니라 분모 문제다", () => {
    const rows = [row({ per: 5000 }), row({ per: 8 }), row({ per: 10 }), row({ per: 12 }), row({ per: 14 }), row({ per: 16 })];
    expect(medianOf(rows, "per", null)!.count).toBe(5);
    expect(medianOf(rows, "per", null)!.median).toBe(12);
  });

  it("자본잠식(PBR·부채비율 음수)도 통계가 아니라 개별 사정이라 뺀다", () => {
    const rows = [row({ pbr: -2 }), row({ pbr: 1 }), row({ pbr: 2 }), row({ pbr: 3 }), row({ pbr: 4 }), row({ pbr: 5 })];
    expect(medianOf(rows, "pbr", null)!.count).toBe(5);
    expect(medianOf(rows, "pbr", null)!.median).toBe(3);
  });
});

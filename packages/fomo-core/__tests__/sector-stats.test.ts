import { describe, it, expect } from "vitest";
import { buildSectorStats, sectorStatFor, SECTOR_MIN_MEMBERS, type SectorStatInput } from "../src/keyword-cards/sector-stats";

const row = (o: Partial<SectorStatInput> = {}): SectorStatInput => ({
  industry: "제약", sector: "헬스케어", per: 12, pbr: 1, debtToEquity: 40, dividendYield: 1, ...o,
});

describe("업종 통계 — WO-RESET-05 §4-6", () => {
  it("소속이 5개 미만이면 통계로 쓰지 않는다", () => {
    const stats = buildSectorStats(Array.from({ length: SECTOR_MIN_MEMBERS - 1 }, () => row()));
    expect(stats.get("industry:제약")).toBeUndefined();
  });

  it("좁은 분류가 모자라면 상위 분류로 올린다", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ industry: "제약" })),
      ...Array.from({ length: 3 }, () => row({ industry: "의료기기" })),
    ];
    const stats = buildSectorStats(rows);
    expect(stats.get("industry:제약")).toBeUndefined();
    const hit = sectorStatFor(stats, { industry: "제약", sector: "헬스케어" });
    expect(hit?.level).toBe("sector");
    expect(hit?.members).toBe(6);
  });

  it("상위 분류도 모자라면 null — 없는 비교를 만들지 않는다", () => {
    const stats = buildSectorStats([row(), row()]);
    expect(sectorStatFor(stats, { industry: "제약", sector: "헬스케어" })).toBeNull();
  });

  it("평균이 아니라 중앙값이다 — PER 하나가 튀어도 안 흔들린다", () => {
    const rows = [row({ per: 10 }), row({ per: 11 }), row({ per: 12 }), row({ per: 13 }), row({ per: 250 })];
    expect(buildSectorStats(rows).get("industry:제약")!.per).toBe(12);
  });

  it("적자(PER 음수·없음)는 「싸다」가 아니라 **잴 수 없다** — 통계에서 뺀다", () => {
    const rows = [row({ per: -5 }), row({ per: null }), row({ per: 10 }), row({ per: 12 }), row({ per: 14 })];
    expect(buildSectorStats(rows).get("industry:제약")!.per).toBe(12);
  });

  it("이익이 0에 가까워 PER 이 수천 배인 것도 뺀다 — 밸류에이션이 아니라 분모 문제다", () => {
    const rows = [row({ per: 5000 }), row({ per: 8 }), row({ per: 10 }), row({ per: 12 }), row({ per: 14 })];
    expect(buildSectorStats(rows).get("industry:제약")!.per).toBe(11);
  });

  it("자본잠식(PBR·부채비율 음수)도 통계가 아니라 개별 사정이라 뺀다", () => {
    const rows = [row({ pbr: -2 }), row({ pbr: 1 }), row({ pbr: 2 }), row({ pbr: 3 }), row({ pbr: 4 })];
    expect(buildSectorStats(rows).get("industry:제약")!.pbr).toBe(2.5);
  });

  it("몇 개로 잰 값인지 남긴다 — 화면에서 밝힐 수 있어야 한다", () => {
    const stats = buildSectorStats(Array.from({ length: 7 }, () => row()));
    const hit = sectorStatFor(stats, { industry: "제약", sector: "헬스케어" })!;
    expect(hit.members).toBe(7);
    expect(hit.label).toBe("제약");
    expect(hit.level).toBe("industry");
  });

  it("분류가 없는 종목은 통계에 안 들어가고 조회도 null 이다", () => {
    const stats = buildSectorStats(Array.from({ length: 6 }, () => row({ industry: null, sector: null })));
    expect(stats.size).toBe(0);
    expect(sectorStatFor(stats, { industry: null, sector: null })).toBeNull();
  });
});

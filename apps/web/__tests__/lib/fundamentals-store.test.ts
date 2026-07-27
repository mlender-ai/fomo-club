import { describe, expect, it, vi } from "vitest";

/** FeedContentCache 를 인메모리로 흉내 낸다 — 저장소 계약만 검증한다(신규 DDL 없음이 전제). */
const store = new Map<string, unknown>();
vi.mock("../../lib/feed-content-store", () => ({
  readFeedContent: vi.fn(async (id: string) => store.get(id) ?? null),
  writeFeedContent: vi.fn(async (id: string, row: unknown) => {
    store.set(id, row);
  }),
  readFeedContentByPrefix: vi.fn(async (prefix: string) =>
    [...store.entries()].filter(([id]) => id.startsWith(prefix)).map(([id, row]) => ({ id, row }))
  ),
  deleteFeedContent: vi.fn(async (id: string) => {
    store.delete(id);
  }),
}));

import { emptyFactSheet, type FactSheet } from "@fomo/core";
import {
  factsheetHash,
  factsheetKey,
  readFactSheet,
  readFactSheetSnapshot,
  readLatestFactSheetIndex,
  writeFactSheet,
  writeFactSheetIndex,
} from "../../lib/fundamentals/repository";
import { summarizeCoverage } from "../../lib/fundamentals/coverage";

function sheet(overrides: Partial<Parameters<typeof emptyFactSheet>[0]> = {}): FactSheet {
  return emptyFactSheet({
    canonical: "종근당",
    displayName: "종근당",
    symbol: "185750",
    market: "KR",
    currency: "KRW",
    snapshotAt: "2026-07-28T00:00:00.000Z",
    sourceErrors: [],
    ...overrides,
  });
}

describe("팩트시트 해시 (완료 조건 3)", () => {
  it("같은 내용이면 같은 해시", () => {
    expect(factsheetHash(sheet())).toBe(factsheetHash(sheet()));
  });

  it("snapshot_at 만 다르면 해시는 같다 — 시각은 내용이 아니다", () => {
    expect(factsheetHash(sheet())).toBe(factsheetHash(sheet({ snapshotAt: "2026-08-01T12:00:00.000Z" })));
  });

  it("내용이 다르면 해시도 다르다", () => {
    expect(factsheetHash(sheet())).not.toBe(factsheetHash(sheet({ canonical: "SK하이닉스" })));
  });
});

describe("저장소 키 규약", () => {
  it("최신 레코드 키는 시장 + canonical", () => {
    expect(factsheetKey(sheet())).toBe("factsheet:KR:종근당");
  });

  it("최신 저장 + 해시 스냅샷이 함께 남는다(WO-SUB-07 재현 경로)", async () => {
    store.clear();
    const record = await writeFactSheet(sheet());
    expect(await readFactSheet("KR", "종근당")).toEqual(record);
    expect(await readFactSheetSnapshot("KR", "종근당", record.factsheet_hash)).toEqual(record);
  });

  it("해시가 같으면 스냅샷 행이 늘지 않는다(행 폭발 방지)", async () => {
    store.clear();
    await writeFactSheet(sheet());
    await writeFactSheet(sheet({ snapshotAt: "2026-08-02T00:00:00.000Z" }));
    const snapshots = [...store.keys()].filter((key) => key.startsWith("factsheet-snap:"));
    expect(snapshots).toHaveLength(1);
  });

  it("내용이 바뀌면 스냅샷이 append 된다(이력 보존)", async () => {
    store.clear();
    await writeFactSheet(sheet());
    await writeFactSheet(sheet({ sourceErrors: ["naver: integration 500"] }));
    const snapshots = [...store.keys()].filter((key) => key.startsWith("factsheet-snap:"));
    expect(snapshots).toHaveLength(2);
  });

  it("일자 인덱스를 최신부터 찾는다", async () => {
    store.clear();
    await writeFactSheetIndex("2026-07-27", [{ canonical: "A", market: "KR", hash: "h1", coverage_flag: "partial", missing_count: 3 }]);
    await writeFactSheetIndex("2026-07-28", [{ canonical: "B", market: "KR", hash: "h2", coverage_flag: "full", missing_count: 1 }]);
    expect((await readLatestFactSheetIndex())?.date).toBe("2026-07-28");
  });
});

describe("커버리지 리포트 (완료 조건 7)", () => {
  it("레코드 수가 유니버스와 같아야 완료 조건 1 을 만족한다", () => {
    const report = summarizeCoverage([sheet(), sheet({ canonical: "SK하이닉스" })], { universe: 2 });
    expect(report.records).toBe(2);
    expect(report.universe).toBe(2);
  });

  it("데이터 없는 종목은 실패 목록에 남는다", () => {
    const report = summarizeCoverage([sheet({ sourceErrors: ["sec: CIK 매핑 없음"] })], { universe: 1 });
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.coverage_flag).toBe("none");
    expect(report.failures[0]!.errors).toContain("sec: CIK 매핑 없음");
  });

  it("밴드 미계산 사유를 종류별로 집계한다(수치는 정규화)", () => {
    const report = summarizeCoverage([sheet()], { universe: 1 });
    expect(Object.keys(report.band_insufficient_reasons)).toContain("일별 종가 없음");
  });

  it("필드별 확보율이 0/n 으로 정직하게 나온다", () => {
    const report = summarizeCoverage([sheet()], { universe: 1 });
    const kr = report.groups.find((group) => group.group === "KR")!;
    expect(kr.fields["valuation.per_ttm"]).toEqual({ ok: 0, n: 1, pct: 0 });
    expect(kr.coverage_flags.none).toBe(1);
  });
});

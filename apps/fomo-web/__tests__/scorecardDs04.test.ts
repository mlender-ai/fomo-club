import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FIRST_SCORING_DAYS,
  MIN_SAMPLE,
  hasEnoughSample,
  koreanDate,
  medianOf,
  pendingScoring,
  rateOrSampleShort,
  sinceMove,
} from "../lib/scorecard";
import { seenByDate, shortDate, watchRows } from "../lib/myRecord";
import type { ScorecardPick } from "../lib/judgmentLedgerClient";
import type { WatchItem } from "../lib/watchlist";

/** DS-04 성적표·내 기록 — 절대 규칙(§1-4)과 빈 상태(§1-5) 계약. */

const pick = (date: string, priceAt: number, canonical = "빅텍", returns: Partial<ScorecardPick["returns"]> = {}): ScorecardPick => ({
  canonical,
  date,
  priceAt,
  pickType: "quiet",
  signalTypes: [],
  returns: { "7": null, "30": null, "90": null, ...returns } as ScorecardPick["returns"],
});

describe("완료 기준 1 — 표본 30 미만은 비율 대신 표본을 말한다", () => {
  it("29건이면 비율을 내지 않는다", () => {
    expect(rateOrSampleShort(62.5, 29)).toBe("표본 부족 (29건)");
    expect(hasEnoughSample(29)).toBe(false);
  });

  it("30건이면 비율이 나온다", () => {
    expect(rateOrSampleShort(62.5, MIN_SAMPLE)).toBe("62.5%");
    expect(hasEnoughSample(MIN_SAMPLE)).toBe(true);
  });

  it("표본이 충분해도 값이 없으면 지어내지 않는다", () => {
    expect(rateOrSampleShort(null, 40)).toBe("—");
  });

  it("`packages/lab` 의 최소 표본과 같은 값이다 (INV-C13)", () => {
    expect(MIN_SAMPLE).toBe(30);
  });
});

describe("§1-4 평균 금지 — 중앙값만 쓴다", () => {
  it("중앙값을 계산한다", () => {
    expect(medianOf([1, 2, 3])).toBe(2);
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });

  it("소수 대박이 값을 끌어올리지 않는다 — 평균이라면 340% 가 됐다", () => {
    expect(medianOf([1, 2, 3, 4, 1700])).toBe(3);
  });

  it("빈 배열이면 null — 0% 로 둔갑시키지 않는다", () => {
    expect(medianOf([])).toBeNull();
  });
});

describe("완료 기준 4·5·6 — 빈 성적표 (§1-5)", () => {
  const picks = [pick("2026-08-17", 4370), pick("2026-08-19", 4945, "휴니드")];

  it("채점 대기 건수와 첫 발행일을 센다", () => {
    const out = pendingScoring(picks, "2026-08-20");
    expect(out.pending).toBe(2);
    expect(out.firstPublishedAt).toBe("2026-08-17");
  });

  it("첫 채점 예정일 = 첫 발행일 + 7일", () => {
    expect(pendingScoring(picks, "2026-08-20").firstScoringAt).toBe("2026-08-24");
    expect(FIRST_SCORING_DAYS).toBe(7);
    expect(koreanDate("2026-08-24")).toBe("8월 24일");
  });

  it("이미 지난 예정일은 표시하지 않는다", () => {
    expect(pendingScoring(picks, "2026-09-01").firstScoringAt).toBeNull();
  });

  it("채점이 끝난 건은 대기에서 빠진다", () => {
    const graded = [pick("2026-08-01", 4000, "빅텍", { "7": { returnPct: 3.2 } as never }), pick("2026-08-19", 4945, "휴니드")];
    expect(pendingScoring(graded, "2026-08-20").pending).toBe(1);
  });

  it("발행 기록이 없으면 아무 말도 하지 않는다", () => {
    expect(pendingScoring([], "2026-08-20")).toEqual({ pending: 0, firstPublishedAt: null, firstScoringAt: null });
  });

  describe("짚은 뒤 지금까지 변동 — 채점 결과가 아니다", () => {
    it("발행가 대비 현재가의 중앙값을 낸다", () => {
      const out = sinceMove([pick("2026-08-17", 100, "A"), pick("2026-08-18", 200, "B")], (s) => (s === "A" ? 110 : 190));
      expect(out.n).toBe(2);
      expect(out.medianPct).toBe(2.5); // +10% 와 -5% 의 중앙값
    });

    it("같은 종목을 여러 번 발행해도 **가장 오래된 발행가로 한 번만** 센다", () => {
      const out = sinceMove([pick("2026-08-17", 100, "A"), pick("2026-08-19", 150, "A")], () => 110);
      expect(out.n).toBe(1);
      expect(out.medianPct).toBe(10);
    });

    it("현재가가 없는 종목은 세지 않는다", () => {
      expect(sinceMove([pick("2026-08-17", 100, "A")], () => undefined)).toEqual({ medianPct: null, n: 0 });
    });

    it("레거시 30장 기록(pickType 다름)은 섞이지 않는다", () => {
      const legacy = [{ ...pick("2026-08-17", 100, "A"), pickType: "keyword" }];
      expect(sinceMove(legacy, () => 200).n).toBe(0);
    });

    it("나쁜 성적도 그대로 낸다", () => {
      expect(sinceMove([pick("2026-08-17", 100, "A")], () => 80).medianPct).toBe(-20);
    });
  });
});

describe("내 기록 — 관심 종목 (§2-1·§2-2)", () => {
  const watch = (stock: string, ts: number, priceAt?: number, naverCode?: string): WatchItem => ({
    stock,
    ts,
    ...(priceAt ? { priceAt } : {}),
    ...(naverCode ? { naverCode } : {}),
  });

  it("최근 등록 순으로 정렬하고 등록 후 변동을 계산한다", () => {
    const rows = watchRows([watch("빅텍", 1000, 100, "065450"), watch("휴니드", 2000, 200)], () => 110);
    expect(rows.map((r) => r.stock)).toEqual(["휴니드", "빅텍"]);
    expect(rows[1]).toMatchObject({ code: "065450", returnPct: 10, best: true });
    expect(rows[0]!.returnPct).toBe(-45);
  });

  it("기준가가 없으면 변동을 비운다 — 없는 기준가를 추측하지 않는다", () => {
    const rows = watchRows([watch("빅텍", 1000)], () => 110);
    expect(rows[0]!.returnPct).toBeUndefined();
    expect(rows[0]!.best).toBe(false);
  });

  it("accent 는 수익 1위 한 곳뿐이고, 전부 음수면 없다", () => {
    const gains = watchRows([watch("A", 1, 100, "1"), watch("B", 2, 100, "2")], (s) => (s === "A" ? 130 : 110));
    expect(gains.filter((r) => r.best).map((r) => r.stock)).toEqual(["A"]);
    const losses = watchRows([watch("A", 1, 100, "1"), watch("B", 2, 100, "2")], () => 90);
    expect(losses.some((r) => r.best)).toBe(false);
  });
});

describe("내 기록 — 본 카드 (§2-1)", () => {
  it("KST 날짜별 장수를 최신순으로 센다", () => {
    const at = (iso: string) => Date.parse(iso);
    const items = [
      { stock: "A", firstSeenAt: at("2026-08-19T01:00:00Z"), firstSeenPrice: 1 },
      { stock: "B", firstSeenAt: at("2026-08-19T02:00:00Z"), firstSeenPrice: 1 },
      { stock: "C", firstSeenAt: at("2026-08-17T23:00:00Z"), firstSeenPrice: 1 },
    ];
    expect(seenByDate(items)).toEqual([
      { date: "2026-08-19", count: 2 },
      { date: "2026-08-18", count: 1 }, // 08-17 23:00 UTC = 08-18 08:00 KST
    ]);
  });

  it("등록일은 `8/14` 형태", () => {
    expect(shortDate(Date.parse("2026-08-14T05:00:00Z"))).toBe("8/14");
  });
});

describe("DS-04 구조 — 소스 계약", () => {
  const page = readFileSync(new URL("../app/track-record/page.tsx", import.meta.url), "utf8");
  const tab = readFileSync(new URL("../components/MyRecordTab.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../components/HomeView.tsx", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../lib/scorecard.ts", import.meta.url), "utf8");
  const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("완료 기준 7 — 각 탭에 accent 가 1회만 있다", () => {
    /**
     * 성적표: `accent` 는 대표 지표 한 곳에만 붙는다(`Row accent` prop 하나). 채점 결과가 있으면
     * 중앙값, 없으면 현재 변동 — 둘 중 하나다.
     */
    expect(code(page)).toContain('const accentOn: "median" | "since" | null');
    expect((code(page).match(/text-ds-accent/g) ?? []).length).toBe(1);
    // 내 기록: 수익 1위 행 하나 + 빈 상태 CTA(둘은 동시에 나오지 않는다).
    expect(code(tab)).toContain('row.best ? "text-ds-accent"');
  });

  it("완료 기준 8 — 일러스트·아이콘이 없다", () => {
    // 성적표의 SVG 는 뒤로 화살표 하나뿐. 내 기록에는 SVG 가 없다.
    expect((code(page).match(/<svg/g) ?? []).length).toBe(1);
    expect(code(tab)).not.toContain("<svg");
    expect(code(tab)).not.toContain("Icon");
    expect(code(tab)).not.toContain("Illustration");
  });

  it("완료 기준 2 — 판정 불가가 분모에서 빠지지 않는다", () => {
    expect(code(page)).toContain("판정 불가");
    expect(code(page)).toContain("분모에서 빼지 않아요");
    expect(code(page)).toContain("미도달");
  });

  it("완료 기준 3 — 표본 수를 병기한다", () => {
    expect(code(page)).toMatch(/sample=\{`판단 \$\{overall\.n/);
    expect(code(page)).toContain("rateOrSampleShort(overall.winRate, overall.n)");
  });

  it("완료 기준 5 — 채점 결과와 현재 변동을 구분한다", () => {
    expect(code(page)).toContain("채점 결과가 아니라 현재 시점 변동이에요");
    expect(code(page)).toContain('title="그동안 이건 볼 수 있어요"');
  });

  it("§1-4 평균 금지 — 계산부에 평균 함수가 없다", () => {
    expect(code(lib)).not.toMatch(/function (mean|average)/i);
    expect(code(lib)).toContain("export function medianOf");
  });

  /**
   * WO-RESET-01 A-2·A-3·A-4 — 하단 탭 바 자체를 없앴다. 남는 화면은 카드와 상세 둘뿐이다.
   *
   * `MyRecordTab`·`track-record` 페이지·`DS-04` 계산부는 **지우지 않았다** — 데이터는 계속
   * 쌓이고 화면만 뺐다. 그래서 아래 §1-4(평균 금지) 같은 계산부 계약은 그대로 살아 있다.
   */
  it("하단 탭 바가 없다 — 성적표·내 기록으로 가는 길이 화면에 없다", () => {
    const body = code(home);
    expect(body).not.toContain("<nav");
    expect(body).not.toContain("track-record");
    expect(body).not.toContain("<MyRecordTab");
    expect(body).not.toContain("검증실");
  });

  it("내 기록 화면 자체는 남아 있다 — 되살릴 수 있게", () => {
    expect(code(tab)).toContain('title="관심 종목"');
    expect(code(tab)).toContain('title="본 카드"');
  });
});

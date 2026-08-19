import { describe, expect, it } from "vitest";
import { computeOurRecord, sinceText } from "../lib/ourRecord";
import { cardEvidenceRows, companyBlurb, evidenceRows } from "../lib/depthSections";
import type { ScorecardPick } from "../lib/judgmentLedgerClient";
import type { QuietPick } from "../lib/fomoApi";

/** DS-03 상세 — 순수 함수 계약. 렌더는 `e2e/quiet-depth.spec.ts` 가 본다. */

const pickOf = (over: Record<string, unknown> = {}) =>
  ({
    subject: { canonical: "Angel Studios", country: "US", market: "NASDAQ", symbol: "ANGX" },
    price: { current: 4.945, sparkline: [] },
    signal: { kind: "insider_cluster", code: "insider_cluster", actors: "임원 3명", scale: "$2.8M", days: 5, insiderCount: 3 },
    hook: "임원 3명이 최근 5일 새 같이 샀어요",
    signalFacts: { priorBuys12mo: 2, volumePct: 51 },
    invalidation: { level: 2.05, text: "" },
    ...over,
  }) as unknown as QuietPick;

const record = (date: string, priceAt: number, returns: Partial<ScorecardPick["returns"]> = {}): ScorecardPick => ({
  canonical: "Angel Studios",
  date,
  priceAt,
  pickType: "quiet",
  signalTypes: [],
  returns: { "7": null, "30": null, "90": null, ...returns } as ScorecardPick["returns"],
});

describe("완료 기준 9 — 중복 출력이 없다", () => {
  it("`임원 3명` 에 인원을 다시 붙이지 않는다", () => {
    const rows = evidenceRows(pickOf());
    expect(rows[0]).toEqual({ label: "누가", value: "임원 3명 · $2.8M" });
    expect(rows[0]!.value).not.toContain("3명 · 3명");
  });

  it("주체에 인원이 없으면 붙인다", () => {
    const rows = evidenceRows(pickOf({ signal: { kind: "insider_cluster", actors: "임원", scale: "$4.0M", days: 5, insiderCount: 2 } }));
    expect(rows[0]!.value).toBe("임원 2명 · $4.0M");
  });
});

describe("② 근거 — 논증 순서, 최대 5행, 없는 행은 만들지 않는다", () => {
  it("누가 → 언제 → 얼마나 드문가 → 거래량/비중", () => {
    expect(evidenceRows(pickOf()).map((r) => r.label)).toEqual(["누가", "언제", "얼마나 드문가", "거래량", "비중"]);
  });

  it("실수치가 없으면 그 행이 아예 없다", () => {
    const rows = evidenceRows(pickOf({ signalFacts: undefined }));
    expect(rows.map((r) => r.label)).toEqual(["누가", "언제"]);
  });

  it("거래량 축은 말라 있음 → 많음 → 같음 순으로 하나만 말한다", () => {
    const vacuum = evidenceRows(pickOf({ signalFacts: { volumeVacuumRatio: 0.25 } }));
    expect(vacuum.find((r) => r.label === "거래량")?.value).toBe("평소의 25%");
    const elevated = evidenceRows(pickOf({ signalFacts: { volumeElevated: true } }));
    expect(elevated.find((r) => r.label === "거래량")?.value).toBe("평소보다 많음");
    const flat = evidenceRows(pickOf({ signalFacts: { pctAboveYearLow: 3 } }));
    expect(flat.find((r) => r.label === "거래량")?.value).toBe("평소와 같음");
  });

  it("연속 매수는 최장 여부로 희소성을 말한다", () => {
    const rows = evidenceRows(
      pickOf({
        signal: { kind: "institution_streak", actors: "기관", scale: "74주", days: 25 },
        signalFacts: { isLongestStreak: true, streakWindowDays: 40 },
      })
    );
    expect(rows).toEqual([
      { label: "누가", value: "기관 · 74주" },
      { label: "언제", value: "25일째 이어짐" },
      { label: "얼마나 드문가", value: "40거래일 중 최장" },
      // 진공 수치를 안 넘긴 픽스처 — 거래량 축은 "평소와 같음" 으로 말한다(지어내지 않는다).
      { label: "거래량", value: "평소와 같음" },
    ]);
  });

  it("행은 5개를 넘지 않는다", () => {
    expect(evidenceRows(pickOf({ signalFacts: { priorBuys12mo: 2, volumePct: 51, mcapPct: 4 } })).length).toBeLessThanOrEqual(5);
  });
});

describe("카드 근거 박스 — 3행, 결론이 말한 숫자는 빼고 (모킹 기준)", () => {
  it("결론에 나온 일수는 빠지고 규모·희소성·거래량이 남는다", () => {
    const pick = pickOf({
      signal: { kind: "institution_streak", actors: "기관", scale: "919주", days: 3 },
      hook: "기관이 3일째 조용히 사고 있어요",
      signalFacts: { isLongestStreak: true, streakWindowDays: 40, volumeVacuumRatio: 0.25, volumePct: 0.5 },
    });
    expect(cardEvidenceRows(pick, "기관이 3일째 조용히 사고 있어요")).toEqual([
      { label: "누가", value: "기관 · 919주" },
      { label: "얼마나 드문가", value: "40거래일 중 최장" },
      { label: "거래량", value: "평소의 25%" },
    ]);
  });

  it("`하루 거래량의 1%` 같은 값은 근거가 아니다 — 행을 만들지 않는다", () => {
    const rows = evidenceRows(pickOf({ signalFacts: { volumePct: 0.5 } }));
    expect(rows.find((r) => r.label === "비중")).toBeUndefined();
  });

  it("박스는 3행을 넘지 않는다", () => {
    expect(cardEvidenceRows(pickOf(), "임원 3명이 최근 5일 새 같이 샀어요").length).toBeLessThanOrEqual(3);
  });
});

describe("완료 기준 6 — 회사 설명 첫 문장이 주력 사업이다", () => {
  it("`동사는 1968년 …으로 설립되어 … 상장되었음` 은 통째로 걸러진다 (실측 결함)", () => {
    const blurb = companyBlurb(
      "동사는 1968년 대영전자공업으로 설립되어 1973년 방산업체로 지정되었고, 1991년 유가증권시장에 상장되었음. 전술통신장비 및 시스템의 방산사업과 보잉, GA-ASI 등 글로벌 기업과의 제휴를 통한 항공전자장비 수출을 하고 있음."
    );
    // 등기 문장은 사라지고 **주력 사업이 첫 문장**이 된다(완료 기준 6).
    expect(blurb?.text.startsWith("전술통신장비")).toBe(true);
    expect(blurb?.text).not.toContain("설립");
    expect(blurb?.text).not.toContain("상장");
    expect(blurb?.text.endsWith("있어요.")).toBe(true); // 해요체
    expect(blurb?.truncated).toBe(true);
  });

  it("업종명 나열은 회사 설명이 아니다 — 섹션이 사라진다", () => {
    expect(companyBlurb("투자매매업, 투자중개업, 집합투자업을 영위하고 있습니다.")).toBeNull();
  });

  it("설립 문장으로 시작하면 그 문장을 버린다", () => {
    const blurb = companyBlurb(
      "2024년 자회사 빅텍엠에이치디로클랜드를 설립하였습니다. 군용 전자전 장비와 전원공급장치를 만들어 방위사업청에 납품해요."
    );
    expect(blurb?.text.startsWith("군용 전자전 장비")).toBe(true);
  });

  it("최대 2문장까지만 남긴다", () => {
    const blurb = companyBlurb("스위스 스포츠화 브랜드예요. 러닝화가 매출의 대부분이에요. 최근 의류로 넓히고 있어요.");
    expect(blurb?.text).toBe("스위스 스포츠화 브랜드예요. 러닝화가 매출의 대부분이에요.");
    expect(blurb?.truncated).toBe(true);
  });

  it("풀 수 있는 약어는 풀어 쓴다", () => {
    expect(companyBlurb("MRO 부품을 항공사에 공급하는 회사예요.")?.text).toBe("정비·보수 부품을 항공사에 공급하는 회사예요.");
  });

  it("약어로 이뤄진 문장(2개 이상)은 버린다 — 왕초보가 읽을 수 없다", () => {
    const blurb = companyBlurb("방산사업에서는 HCTRS 체계개발을 완료했고, P5G·MANET 개발을 준비하고 있어요.");
    expect(blurb).toBeNull();
  });

  it("설명이 없으면 null — 빈 헤더를 만들지 않는다", () => {
    expect(companyBlurb(undefined)).toBeNull();
    expect(companyBlurb("   ")).toBeNull();
  });
});

describe("완료 기준 7 — `7일 아직` 대신 실제 수익률", () => {
  const picks = [record("2026-08-17", 4.37), record("2026-08-18", 4.37), record("2026-08-19", 4.945)];

  it("가장 오래된 발행일 대비 현재 수익률을 계산한다", () => {
    const out = computeOurRecord(picks, "Angel Studios", 4.945, "2026-08-20");
    expect(out?.firstPublishedAt).toBe("2026-08-17");
    expect(out?.sinceText).toBe("8월 17일에 짚은 뒤");
    // 4.37 → 4.945 = +13.158% → 소수 첫째 자리 반올림 13.2. DS-03 §9 의 13.1 은 절사값이다.
    expect(out?.returnPct).toBe(13.2);
  });

  it("이력은 최신순 최대 5건", () => {
    const out = computeOurRecord(picks, "Angel Studios", 4.945, "2026-08-20");
    expect(out?.history.map((h) => h.date)).toEqual(["2026-08-19", "2026-08-18", "2026-08-17"]);
  });

  it("1건뿐이면 이력 목록을 만들지 않는다 — 수익률과 같은 말을 두 번 하지 않는다", () => {
    const out = computeOurRecord([record("2026-08-17", 4.37)], "Angel Studios", 4.945, "2026-08-20");
    expect(out?.history).toEqual([]);
    expect(out?.returnPct).toBe(13.2);
  });

  it("도래하지 않은 지평은 목록에 없다 (`아직` 을 만들지 않는다)", () => {
    const out = computeOurRecord(picks, "Angel Studios", 4.945, "2026-08-20");
    expect(out?.graded).toEqual([]);
  });

  it("도래한 지평만 들어온다", () => {
    const graded = [record("2026-05-01", 4.0, { "7": { returnPct: 5.2 } as never, "30": { returnPct: -3.1 } as never })];
    const out = computeOurRecord(graded, "Angel Studios", 4.945, "2026-08-20");
    expect(out?.graded).toEqual([
      { horizon: 7, returnPct: 5.2 },
      { horizon: 30, returnPct: -3.1 },
    ]);
  });

  it("0.0% 는 성적이 아니다 — 블록을 그리지 않는다", () => {
    expect(computeOurRecord([record("2026-08-19", 4560)], "Angel Studios", 4560, "2026-08-20")).toBeNull();
  });

  it("오늘 첫 발행이면 섹션이 없다", () => {
    expect(computeOurRecord([record("2026-08-20", 4.9)], "Angel Studios", 4.945, "2026-08-20")).toBeNull();
  });

  it("레거시 30장 기록(pickType 다름)은 우리 성적에 안 섞인다", () => {
    expect(computeOurRecord([{ ...record("2026-08-17", 4.37), pickType: "keyword" }], "Angel Studios", 4.945, "2026-08-20")).toBeNull();
  });

  it("다른 종목 기록은 섞이지 않는다", () => {
    expect(computeOurRecord([{ ...record("2026-08-17", 4.37), canonical: "빅텍" }], "Angel Studios", 4.945, "2026-08-20")).toBeNull();
  });

  it("현재가가 없으면 성적을 지어내지 않는다", () => {
    expect(computeOurRecord(picks, "Angel Studios", undefined, "2026-08-20")).toBeNull();
    expect(computeOurRecord(picks, "Angel Studios", 0, "2026-08-20")).toBeNull();
  });

  it("음수 수익률도 그대로 (좋은 것만 보여주지 않는다)", () => {
    const out = computeOurRecord([record("2026-08-01", 10)], "Angel Studios", 9.18, "2026-08-20");
    expect(out?.returnPct).toBe(-8.2);
  });

  it("날짜 문구", () => {
    expect(sinceText("2026-01-05")).toBe("1월 5일에 짚은 뒤");
  });
});

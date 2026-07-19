import { describe, expect, it } from "vitest";
import type { SourceDoc } from "@fomo/core";
import { computePriceCause, CAUSE_NEWS_PATTERN } from "../../lib/price-cause";

const TODAY = "2026-07-17";

const earningsFiling: SourceDoc = {
  id: "S1",
  kind: "official",
  title: "분기 실적 발표 (공식 공시) · 7/14",
  body: "2026-07-14 접수 공시",
  source: "SEC EDGAR",
  url: "https://www.sec.gov/example",
  publishedAt: "2026-07-14",
  tier: "official-high",
};

const staleFiling: SourceDoc = {
  ...earningsFiling,
  id: "S2",
  title: "대형 계약 체결 공시 · 6/23",
  publishedAt: "2026-06-23",
};

const fredDoc: SourceDoc = {
  id: "S3",
  kind: "official",
  title: "나스닥 종합지수 25881.95",
  source: "FRED(미 연준)",
  publishedAt: "2026-07-16",
  tier: "official-high",
};

// WO 뎁스 재건 A — 치명 모순 재현: 답(실적 공시)을 수집해놓고 "계기 미확인"이라 말하던 것.
describe("원인 연결 엔진 (price-cause)", () => {
  it("IBM 케이스 — 시간창(±3일) 안의 실적 공시를 급락 원인으로 연결한다", () => {
    const cause = computePriceCause({ today: "2026-07-16", changePct: -8.2, docs: [earningsFiling, staleFiling, fredDoc] });
    expect(cause).toBeDefined();
    expect(cause!.kind).toBe("material");
    expect(cause!.text).toContain("분기 실적 발표");
    expect(cause!.text).toContain("급락(-8.2%)");
    expect(cause!.url).toBe("https://www.sec.gov/example");
  });

  it("시간창 밖(3주 전) 공시는 원인으로 잇지 않는다 — 추측 인과 금지", () => {
    const cause = computePriceCause({ today: TODAY, changePct: -5, docs: [staleFiling] });
    expect(cause!.kind).not.toBe("material");
  });

  it("FRED 거시 지표는 종목 원인이 아니다", () => {
    const cause = computePriceCause({ today: TODAY, changePct: 4, docs: [fredDoc] });
    expect(cause!.kind).toBe("unknown");
  });

  it("당일 뉴스가 원인 패턴(잠정실적·가이던스 하향)에 걸리면 제목 그대로 grounded 원인", () => {
    const news: SourceDoc = {
      id: "S4",
      kind: "news",
      title: "OO전자, 잠정 실적 시장 예상 하회…영업이익 -32%",
      source: "연합뉴스",
      url: "https://news.example/1",
      publishedAt: `${TODAY}T09:10:00+09:00`,
      tier: "news-mid",
    };
    const cause = computePriceCause({ today: TODAY, changePct: -6.4, docs: [news] });
    expect(cause!.kind).toBe("material");
    expect(cause!.text).toContain("잠정 실적");
    expect(cause!.sourceLabel).toBe("연합뉴스");
  });

  it("제닉스로보틱스 케이스 — 3일 전 재료 보도(자사주 신탁)도 원인으로 잇는다(실측 회귀)", () => {
    const news: SourceDoc = {
      id: "S5",
      kind: "news",
      title: "제닉스로보틱스, 10억원 규모 자사주 취득 신탁계약",
      source: "이데일리",
      publishedAt: "2026-07-15T07:49:00.000Z",
      tier: "news-mid",
    };
    const cause = computePriceCause({ today: "2026-07-18", changePct: 5.58, docs: [news] });
    expect(cause!.kind).toBe("material");
    expect(cause!.text).toContain("자사주");
  });

  it("시간창(3일) 밖 뉴스는 잇지 않는다", () => {
    const news: SourceDoc = {
      id: "S6",
      kind: "news",
      title: "OO, 대규모 수주 계약 체결",
      source: "이데일리",
      publishedAt: "2026-07-10T00:00:00.000Z",
      tier: "news-mid",
    };
    const cause = computePriceCause({ today: "2026-07-18", changePct: 5, docs: [news] });
    expect(cause!.kind).not.toBe("material");
  });

  it("재료가 없고 지수가 같은 방향 ±1.5%+면 동반 사실로 설명한다", () => {
    const cause = computePriceCause({
      today: TODAY,
      changePct: -4.1,
      docs: [],
      indexMoves: [
        { label: "코스닥", changePct: -4.5 },
        { label: "코스피", changePct: -6.4 },
      ],
    });
    expect(cause!.kind).toBe("co-move");
    expect(cause!.text).toContain("코스피");
    expect(cause!.text).toContain("-6.4%");
  });

  it("지수가 반대 방향이면 동반 설명하지 않는다 — 최후의 정직한 미확인", () => {
    const cause = computePriceCause({
      today: TODAY,
      changePct: 5.2,
      docs: [],
      indexMoves: [{ label: "코스피", changePct: -2.0 }],
    });
    expect(cause!.kind).toBe("unknown");
    expect(cause!.text).toContain("찾지 못했어요");
  });

  it("±3% 미만 움직임엔 개입하지 않는다", () => {
    expect(computePriceCause({ today: TODAY, changePct: 1.2, docs: [earningsFiling] })).toBeUndefined();
  });

  it("원인 패턴 사전 — 실적하회·가이던스·잠정실적 계열이 명시돼 있다(WO A-2)", () => {
    for (const title of ["잠정실적 하회", "가이던스 하향 조정", "preliminary results", "misses estimates", "cuts guidance", "profit warning"]) {
      expect(CAUSE_NEWS_PATTERN.test(title), title).toBe(true);
    }
  });
});

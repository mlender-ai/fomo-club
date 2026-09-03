/**
 * WO-RESET-02 PART C — 「왜 지금 사는가」는 **날짜와 사건**이어야 한다.
 *
 * 완료 확인 1·4·5·8 을 여기서 고정한다.
 */
import { describe, expect, it } from "vitest";
import {
  buildWhyNowTimeline,
  whyNowQuietNote,
  whenLabel,
  earningsTurnEvent,
  WHY_NOW_FORBIDDEN,
  WHY_NOW_TIMELINE_DISCLAIMER,
  WHY_NOW_BAND_EXTREME_PCTILE,
  WHY_NOW_PRICE_EXTREME_PCT,
} from "../src/keyword-cards/why-now";

const 수주공시 = {
  date: "2026-08-04",
  title: "단일판매·공급계약체결 · 계약금액 320억",
  kind: "수주",
  url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1",
};

describe("buildWhyNowTimeline — 날짜와 사건", () => {
  it("WO 0-1 의 모양이 그대로 나온다", () => {
    const rows = buildWhyNowTimeline({
      signalStartedAt: "2026-08-06",
      actor: "기관",
      disclosures: [수주공시],
      earnings: { date: "2026-07-28", text: "2분기 영업이익이 흑자로 돌아섰어요" },
    });
    expect(rows.map((r) => `${r.when} ${r.text}`)).toEqual([
      "7월 28일 2분기 영업이익이 흑자로 돌아섰어요",
      // 서식 이름은 사람 말로 옮기고, 제목이 들고 있던 수치는 그대로 남긴다(WO-RESET-05 §3-1).
      "8월 4일 큰 계약을 따냈어요 · 계약금액 320억",
      "8월 6일 그 다음부터 기관이 사기 시작했어요",
    ]);
    // 시간순이다 — 사건이 매수보다 앞에 있다는 사실 자체가 이 섹션의 내용이다.
    expect(rows.map((r) => r.date)).toEqual(["2026-07-28", "2026-08-04", "2026-08-06"]);
  });

  it("[완료 1] 공시가 없어도 매수 시작일이 날짜 항목을 보장한다", () => {
    const rows = buildWhyNowTimeline({ signalStartedAt: "2026-08-06", actor: "외국인" });
    expect(rows.filter((r) => r.date)).toHaveLength(1);
    expect(rows[0]!.text).toBe("외국인이 사기 시작했어요");
  });

  it("[완료 3] 공시 항목은 `url` 을 들고 온다 — 화면은 링크로 그리지 않고 표식으로만 쓴다(DETAIL-04)", () => {
    const rows = buildWhyNowTimeline({ signalStartedAt: "2026-08-06", disclosures: [수주공시] });
    expect(rows.find((r) => r.url)?.url).toBe(수주공시.url);
    // 매수 시작·상태 서술에는 없다 — 그래서 이 필드로 공시 항목을 셀 수 있다(계수기).
    expect(rows.filter((r) => r.url)).toHaveLength(1);
  });

  /**
   * DETAIL-04 — 원문 링크를 화면에서 뺐으므로, **뜻풀이가 그 자리를 대신한다.**
   * 굽는 경로가 이 필드를 실어 보내지 않으면 화면엔 서식 이름 한 줄만 남는다.
   */
  it("[DETAIL-04] 공시 항목에 서식 뜻풀이가 함께 실린다", () => {
    const rows = buildWhyNowTimeline({ signalStartedAt: "2026-08-06", disclosures: [수주공시] });
    const 공시 = rows.find((r) => r.url)!;
    expect(공시.meaning).toContain("5%");
    // 뜻풀이도 인과·평가·예측 금지 게이트를 통과한다.
    expect(WHY_NOW_FORBIDDEN.test(공시.meaning!)).toBe(false);
    // 신호 시작 줄은 공시가 아니라 뜻풀이가 없다 — 없는 설명을 지어내지 않는다.
    expect(rows.find((r) => !r.url)?.meaning).toBeUndefined();
  });

  it("[DETAIL-04] 번역표에 없는 서식은 뜻풀이 없이 원문 제목만 나간다", () => {
    const rows = buildWhyNowTimeline({
      signalStartedAt: "2026-08-06",
      disclosures: [{ date: "2026-08-04", title: "투자판단관련주요경영사항", kind: "기타" }],
    });
    const 공시 = rows.find((r) => r.rawTitle)!;
    expect(공시.text).toBe("투자판단관련주요경영사항");
    expect(공시.meaning).toBeUndefined();
  });

  it("[완료 5] 값은 밴드 상·하위 20% 일 때만 — 평균 근처는 안 넣는다", () => {
    const base = { signalStartedAt: "2026-08-06" };
    const band = (percentile: number) => ({ label: "PBR", current: 0.36, percentile, sufficient: true });
    const 넣음 = buildWhyNowTimeline({ ...base, band: band(WHY_NOW_BAND_EXTREME_PCTILE - 1) });
    expect(넣음.some((r) => r.text.includes("PBR"))).toBe(true);
    const 안넣음 = buildWhyNowTimeline({ ...base, band: band(50) });
    expect(안넣음.some((r) => r.text.includes("PBR"))).toBe(false);
    // 밴드 표본이 모자라면 쓰지 않는다.
    expect(
      buildWhyNowTimeline({ ...base, band: { ...band(5), sufficient: false } }).some((r) => r.text.includes("PBR"))
    ).toBe(false);
  });

  it("[완료 5] 가격은 저점/고점 근처일 때만 — `저점에서 16% 위` 같은 애매한 위치는 뺀다", () => {
    const base = { signalStartedAt: "2026-08-06" };
    expect(buildWhyNowTimeline({ ...base, pctAboveYearLow: 16 }).some((r) => r.text.includes("52주"))).toBe(false);
    expect(
      buildWhyNowTimeline({ ...base, pctAboveYearLow: WHY_NOW_PRICE_EXTREME_PCT }).some((r) => r.text.includes("52주"))
    ).toBe(true);
  });

  it("[완료 1·C-3] 날짜 항목이 하나도 없으면 빈 배열 — 상태만으로는 섹션이 안 된다", () => {
    const rows = buildWhyNowTimeline({
      band: { label: "PBR", current: 0.36, percentile: 3, sufficient: true },
      pctAboveYearLow: 2,
    });
    expect(rows).toEqual([]);
  });

  it("매수 시작 **이후** 공시는 넣지 않는다 — '그래서 샀다' 로 읽힌다", () => {
    const rows = buildWhyNowTimeline({
      signalStartedAt: "2026-08-06",
      disclosures: [{ ...수주공시, date: "2026-08-10" }],
    });
    expect(rows.some((r) => r.url)).toBe(false);
  });

  it("90일보다 오래된 공시는 창 밖이다", () => {
    const rows = buildWhyNowTimeline({
      signalStartedAt: "2026-08-06",
      disclosures: [{ ...수주공시, date: "2026-01-01" }],
    });
    expect(rows.some((r) => r.url)).toBe(false);
  });

  it("[완료 8] 생성된 모든 문장에 금칙어가 없다", () => {
    const rows = buildWhyNowTimeline({
      signalStartedAt: "2026-08-06",
      actor: "기관",
      disclosures: [수주공시],
      earnings: { date: "2026-07-28", text: "2분기 영업이익이 흑자로 돌아섰어요" },
      band: { label: "PBR", current: 0.36, percentile: 3, sufficient: true },
      pctAboveYearLow: 2,
    });
    for (const r of rows) {
      // 공시 제목은 원문 그대로라 예외다 — 우리가 쓴 문장만 본다.
      if (r.url) continue;
      expect(r.text, r.text).not.toMatch(WHY_NOW_FORBIDDEN);
    }
    expect(WHY_NOW_TIMELINE_DISCLAIMER).not.toMatch(WHY_NOW_FORBIDDEN);
  });
});

describe("whyNowQuietNote — [완료 4] 공시가 없으면 그렇게 말한다", () => {
  it("수집했고 0건이면 강조한다", () => {
    expect(whyNowQuietNote({ disclosuresCollected: true, disclosureCount: 0 })).toBe("최근 90일 공시가 한 건도 없었어요");
  });

  it("아직 수집 안 한 종목에는 아무 말도 하지 않는다 — '없었다' 와 '안 봤다' 는 다르다", () => {
    expect(whyNowQuietNote({ disclosureCount: 0 })).toBeNull();
    expect(whyNowQuietNote({ disclosuresCollected: false, disclosureCount: 0 })).toBeNull();
  });

  it("공시가 있으면 이 줄은 없다", () => {
    expect(whyNowQuietNote({ disclosuresCollected: true, disclosureCount: 2 })).toBeNull();
  });
});

describe("whenLabel", () => {
  it("YYYY-MM-DD → N월 N일", () => expect(whenLabel("2026-08-04")).toBe("8월 4일"));
  it("형식이 아니면 null — 지어내지 않는다", () => {
    expect(whenLabel("20260804")).toBeNull();
    expect(whenLabel("")).toBeNull();
  });
});

/** WO-RESET-02 PART B — 상태가 아니라 **변화**만, 그리고 날짜는 공시일이다. */
describe("earningsTurnEvent", () => {
  const q = (period: string, operating_income: number | null, filed_at?: string) => ({
    period,
    operating_income,
    ...(filed_at ? { filed_at } : {}),
  });

  it("적자 → 흑자면 공시일과 함께 돌려준다", () => {
    expect(
      earningsTurnEvent([q("2026Q1", -120, "2026-05-15"), q("2026Q2", 340, "2026-07-28")])
    ).toEqual({ date: "2026-07-28", text: "2분기 영업이익이 흑자로 돌아섰어요" });
  });

  it("흑자 → 적자도 말한다 — 좋고 나쁨을 우리가 정하지 않는다", () => {
    expect(earningsTurnEvent([q("2026Q1", 200, "2026-05-15"), q("2026Q2", -40, "2026-07-28")])?.text).toBe(
      "2분기 영업이익이 적자로 돌아섰어요"
    );
  });

  it("계속 흑자·계속 적자는 근거가 아니다", () => {
    expect(earningsTurnEvent([q("2026Q1", 100, "2026-05-15"), q("2026Q2", 200, "2026-07-28")])).toBeNull();
    expect(earningsTurnEvent([q("2026Q1", -100, "2026-05-15"), q("2026Q2", -50, "2026-07-28")])).toBeNull();
  });

  it("공시일이 없으면 쓰지 않는다 — 기간말로 대신하면 시점이 거짓이 된다", () => {
    expect(earningsTurnEvent([q("2026Q1", -120, "2026-05-15"), q("2026Q2", 340)])).toBeNull();
  });

  it("분기가 하나뿐이면 전환을 판정할 수 없다", () => {
    expect(earningsTurnEvent([q("2026Q2", 340, "2026-07-28")])).toBeNull();
  });

  it("생성 문장에 금칙어가 없다", () => {
    const e = earningsTurnEvent([q("2026Q1", -1, "2026-05-15"), q("2026Q2", 1, "2026-07-28")]);
    expect(e!.text).not.toMatch(WHY_NOW_FORBIDDEN);
  });
});

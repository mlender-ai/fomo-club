"use client";

import type { QuietPick } from "@/lib/fomoApi";
import { QuietPickDepth } from "@/components/QuietPickDepth";

/**
 * 상세 렌더 프리뷰 — DS-03 검증용 픽스처(`e2e/quiet-depth.spec.ts` 가 잰다).
 *
 * ## 이 페이지가 보는 것
 *
 * WO-RESET-05 이후 이 화면은 **네 걸음**이다. 픽 페이로드만으로 네 걸음이 다 선다 —
 * 1걸음(신호) · 2걸음(`whyNow`) · 3걸음(`companyRead`) · 4걸음(결정).
 *
 * 회사 설명 한 줄은 벤더 요약이 필요해서 이 페이지엔 없다. **그건 3걸음이 사라지는 것이
 * 아니라 그 줄만 없는 것**이다 — 걸음의 성립 조건은 `companyRead` 다.
 */

const PICK = {
  subject: {
    canonical: "Angel Studios",
    displayName: "Angel Studios",
    ticker: "ANGX",
    symbol: "ANGX",
    market: "NASDAQ",
    country: "US" as const,
    identity: "미디어·레저",
  },
  price: { current: 4.945, currentText: "4.945", changePct: -2.8, sparkline: [] as number[] },
  signal: {
    kind: "insider_cluster" as const,
    code: "insider_cluster",
    actors: "임원 3명",
    scale: "$2.8M",
    days: 5,
    insiderCount: 3,
    priceAtSignal: 4.37,
    startedAt: "2026-08-14",
    strength: 420,
  },
  hook: "임원 3명이 최근 5일 새 같이 샀어요",
  anomalies: [],
  /**
   * 「왜 지금 사는가」 타임라인(WO-RESET-02 PART C) — **서버가 굽는 시점에 굳혀 보낸다.**
   * 픽스처가 이 필드를 안 채우면 이 화면에서 그 섹션을 영영 못 본다(날짜 항목 0개 → 미표시).
   *
   * `pctAboveYearLow` 는 27.4% 로 둔다 — **특이하지 않은 위치**라 `지금 52주 …` 줄이
   * 붙지 않아야 한다(§C-2 5번). 그 규칙을 이 화면에서 눈으로 확인하기 위한 값이다.
   */
  whyNow: [
    {
      date: "2026-08-11",
      when: "8월 11일",
      // **번역된 형태**로 둔다(WO-RESET-05 §3-1). 서버가 굽는 시점에 옮기므로 화면에
      // 도착하는 것은 이 모양이다 — 픽스처에 서식 이름을 두면 없어진 동작을 그리게 된다.
      text: "큰 계약을 따냈어요 · 계약금액 320억",
      url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260811000001",
    },
    { date: "2026-08-14", when: "8월 14일", text: "그 다음부터 임원이 사기 시작했어요" },
  ],
  signalFacts: { priorBuys12mo: 2, volumePct: 51, pctAboveYearLow: 27.4 },
  signalStats: {
    n: 50,
    up: 26,
    winRate: 52,
    down: 20,
    downRate: 40,
    medianReturn: 1.8,
    windowDays: 30,
    sourceLabel: "백테스트",
    method: "backtest",
    headline: "비슷한 신호 50번 중 26번 올랐어요",
    detail: "30일 기준",
  },
  invalidation: { level: 2.05, text: "52주 저점 $2.05 이탈 여부가 다음 판단 기준이에요." },
  conviction: {
    whyCompany: "",
    whyNow: {},
    committee: { timingGrade: "B" as const, valuationGrade: "B" as const, verdict1line: "" },
  },
  companyScore: 61,
  /**
   * WO-RESET-06 §C-1 — 노출 이력. 이 종목은 **세 번째** 나온 것으로 둔다.
   * 처음 나온 종목이면 이 필드가 없고 상세에서 이력 블록이 통째로 사라진다(§C-2).
   */
  exposure: {
    count: 3,
    firstDate: "2026-08-24",
    firstWhen: "8월 24일",
    firstPrice: 4.37,
    recent: [
      { date: "2026-08-25", when: "8월 25일", reason: "기관이 계속 사고 있어요", price: 4.61 },
      { date: "2026-08-24", when: "8월 24일", reason: "기관이 사기 시작했어요", price: 4.37 },
    ],
  },
  /**
   * WO-RESET-05 §4 — 3걸음 재료. **서버가 굽는 시점에 굳혀 보낸다.**
   * 픽스처가 안 채우면 이 화면에서 3걸음을 영영 못 본다(걸음이 건너뛰어진다, §6).
   *
   * 일부러 **비교 문장이 없는 지표를 넣지 않았다** — 그런 줄은 애초에 만들어지지 않는다는
   * 것이 규칙이라 픽스처에도 있을 수 없다(§4-3).
   */
  companyRead: [
    {
      title: "돈은 잘 버나요",
      rows: [
        { label: "매출", value: "+8.0%", comparison: "작년보다 늘었어요 · 3년째 늘고 있어요" },
        { label: "영업이익", value: "+22.0%", comparison: "작년보다 늘었어요" },
      ],
      score: 5,
      scoreText: "매출도 이익도 늘고 있어요",
      method: "매출 증가·영업이익 증가·흑자 여부 셋을 세어 5점으로 옮겼어요.",
    },
    {
      title: "값은 어떤가요",
      rows: [
        { label: "PER", value: "12.25배", comparison: "미디어 업종 중간값 18.00배보다 낮아요" },
        { label: "PBR", value: "0.88배", comparison: "미디어 업종 중간값 1.40배보다 낮아요" },
      ],
      score: 4,
      scoreText: "미디어 업종 안에서 낮은 편이에요",
      method: "같은 업종(미디어) 12종목의 중간값과 견줘 5점으로 옮겼어요.",
    },
    {
      title: "빚은 괜찮나요",
      rows: [{ label: "부채비율", value: "42%", comparison: "미디어 업종 중간값 80%보다 낮아요" }],
      score: 5,
      scoreText: "같은 업종보다 빚이 적어요",
      method: "같은 업종(미디어) 12종목의 부채비율 중간값과 견줬어요.",
    },
  ],
  qualifiedAt: "2026-08-19",
} as unknown as QuietPick;

export default function QuietDepthPreview() {
  return <QuietPickDepth pick={PICK} onClose={() => undefined} />;
}

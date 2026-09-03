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
 * 아니라 그 줄만 없는 것**이다.
 *
 * 걸음 성립 조건은 `companyRead` **하나가 아니다**(DETAIL-03 PART A) — 회사 설명·실체 중
 * 하나만 있어도 걸음을 만든다. 종전에는 `companyRead` 만 봐서 팩트시트가 없는 종목은
 * 설명이 있어도 3걸음이 통째로 사라졌다(프로덕션 15장 중 7장).
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
      /**
       * DETAIL-04 — 서식의 뜻. 원문 링크를 뺀 자리를 이 줄이 대신한다. 굽는 시점에
       * 번역표(`disclosure-phrase`)가 붙여 보내므로 화면에 도착하는 것은 이 모양이다.
       */
      meaning: "한 건 계약 금액이 최근 1년 매출의 5%(코스닥은 10%)를 넘으면 알려야 해요. 그래서 이 공시는 회사 규모에 견줘 큰 계약이라는 뜻이에요.",
      // DETAIL-02 §C-1 — 금액은 규모 대비로. `320억` 만으로는 크기가 오지 않는다.
      scaleNote: "계약금액이 최근 1년 매출의 26%",
      url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260811000001",
    },
    {
      date: "2026-08-14",
      when: "8월 14일",
      /**
       * DETAIL-02 — `실적을 냈어요` 로 끝나지 않는다. 서버가 공시일과 맞는 분기를 찾아
       * 숫자를 실어 보내므로, 화면에 도착하는 것은 이 모양이다.
       */
      text: "반년 치 실적을 냈어요",
      /**
       * 이 항목은 **숫자가 붙어 있다** — 화면은 뜻풀이를 그리지 않는다(DETAIL-04).
       * 서버는 서식대로 실어 보내고, 감추는 판단은 화면이 한다. 그 규칙을 이 화면에서
       * 눈으로 확인하기 위해 일부러 채워 둔다.
       */
      meaning: "회계연도 절반이 지난 시점의 매출·이익을 공식 숫자로 낸 정기 보고서예요. 감사가 아닌 검토를 받아요.",
      figures: {
        periodLabel: "2026년 2분기",
        headline: "매출 늘고 영업이익 흑자로 돌아섰어요",
        rows: [
          { label: "매출", value: "1,240억", change: "작년 2분기보다 +18%" },
          { label: "영업이익", value: "92억", change: "작년 2분기 -14억에서 흑자로" },
          { label: "순이익", value: "71억", change: "작년 2분기보다 +230%" },
        ],
      },
      url: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814000001",
    },
    { date: "2026-08-18", when: "8월 18일", text: "그 다음부터 임원이 사기 시작했어요" },
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
  /**
   * 3걸음 세 덩어리 — **FIX-01 이후 모양**이다(서버가 굽는 시점에 굳혀 보낸다).
   *
   * 값을 일부러 PS일렉트로닉스 실측(매출 -1.0% · 영업이익 -97.1% · 흑자)으로 둔다.
   * 그 화면이 FIX-01 이 고친 세 가지를 한꺼번에 갖고 있었기 때문이다:
   *  · 한 줄에 정반대 말(`줄었어요 · 3년째 늘고 있어요`) → `trend` 로 줄을 나눈다
   *  · 점 옆에 줄 설명을 되풀이(`섞여 있어요`) → `scoreText: null`, 점은 혼자 선다
   *  · 점수 재료인 흑자 여부가 화면에 없었다 → `영업이익률` 줄이 선다
   */
  companyRead: [
    {
      title: "돈은 잘 버나요",
      rows: [
        {
          label: "매출",
          value: "-1.0%",
          comparison: "작년 같은 기간보다 조금 줄었어요",
          // 방향이 반대인 둘째 사실만 둘째 줄로. 같은 방향이면 이 필드가 없다.
          trend: "다만 3년으로 보면 늘어왔어요",
        },
        { label: "영업이익", value: "-97.1%", comparison: "작년 같은 기간보다 크게 줄었어요" },
        { label: "영업이익률", value: "+1.2%", comparison: "지금은 영업에서 흑자예요" },
      ],
      score: 2,
      scoreText: null,
      summaryText: "매출도 영업이익도 줄었어요",
      method: "매출 증가·영업이익 증가·흑자 여부 셋을 세어 5점으로 옮겼어요.",
    },
    {
      title: "값은 어떤가요",
      rows: [
        { label: "PER", value: "12.25배", comparison: "미디어 업종 평균 18.00배보다 낮아요" },
        { label: "PBR", value: "0.88배", comparison: "미디어 업종 평균 1.40배보다 낮아요" },
      ],
      score: 4,
      scoreText: null,
      summaryText: "PER·PBR이 미디어 업종 안에서 낮은 편이에요",
      method: "같은 업종(미디어) 12종목의 가운데 값과 견줘 5점으로 옮겼어요.",
    },
    {
      title: "빚은 괜찮나요",
      rows: [{ label: "부채비율", value: "42.0%", comparison: "미디어 업종 평균 80.0%보다 낮아요" }],
      score: 5,
      scoreText: null,
      summaryText: "빚은 같은 업종보다 적어요",
      method: "같은 업종(미디어) 12종목의 부채비율 가운데 값과 견줬어요.",
    },
  ],
  qualifiedAt: "2026-08-19",
} as unknown as QuietPick;

export default function QuietDepthPreview() {
  return <QuietPickDepth pick={PICK} onClose={() => undefined} />;
}

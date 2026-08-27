"use client";

import type { QuietPick, QuietPickCardType } from "@/lib/fomoApi";
import { QuietPickCard } from "@/components/QuietPickCard";

/**
 * 픽 카드 렌더 프리뷰 — WO-HOOK-01 검증용 픽스처(`e2e/quiet-card.spec.ts` 가 boundingBox 로 잰다).
 *
 * ## 왜 픽스처 페이지인가
 *
 * "카드 높이가 내용에 따라 변한다"(§10 완료 기준 11)와 "320px 에서 후킹이 3줄이 되지 않는다"
 * (기준 12)는 **렌더해야만 확인된다.** 유닛 테스트는 소스와 순수 함수까지만 본다.
 *
 * ## 경우
 *
 * | case | 구성 |
 * |---|---|
 * | `a` | A형 역행 — 두 선의 갭. 이 배치의 핵심 산출물 |
 * | `b` | B형 비율 — 하루 거래량 중 매수분 막대 |
 * | `c` | C형 희소성 — 40거래일 막대, 연속 구간만 accent |
 * | `min` | 형은 있으나 보조 줄이 없는 가장 짧은 카드 |
 * | `revealed` | 상세를 열어 정체가 해제된 뒤(종목명·티커 표시) |
 *
 * 마스킹 상태는 로컬 저장소를 읽으므로, 프리뷰는 `revealed` prop 을 직접 넘겨 두 상태를
 * 모두 결정론적으로 렌더한다(테스트가 저장소 상태에 의존하지 않게).
 */

const basePick = {
  subject: {
    canonical: "빅텍",
    displayName: "빅텍",
    ticker: "065450",
    naverCode: "065450",
    market: "KOSDAQ",
    country: "KR" as const,
    identity: "방산",
  },
  price: { current: 3035, currentText: "3,035원", changePct: -1.46, sparkline: [] as number[] },
  signal: {
    kind: "institution_streak" as const,
    code: "institution_streak",
    actors: "기관",
    scale: "74주",
    days: 25,
    priceAtSignal: 3005,
    startedAt: "2026-07-09",
    strength: 350,
  },
  hook: "기관이 40거래일 중 가장 긴 25일 매수",
  anomalies: [],
  invalidation: { level: 2500, text: "52주 저점 2,500원 이탈 여부가 다음 판단 기준이에요." },
  conviction: {
    whyCompany: "",
    whyNow: {},
    committee: { timingGrade: "C" as const, valuationGrade: "A" as const, verdict1line: "" },
  },
  companyScore: 77,
  qualifiedAt: "2026-08-14",
} as unknown as QuietPick;

/** 40거래일 종가 — 신호 구간 동안 제자리다(A형이 말하는 바로 그 모양). */
const PRICES = [
  2930, 2950, 3030, 3015, 3080, 3035, 2990, 3005, 3050, 3120,
  3100, 3075, 3040, 3010, 2995, 3020, 3065, 3090, 3110, 3085,
  3055, 3030, 3000, 2985, 3015, 3045, 3070, 3095, 3060, 3035,
  3020, 3040, 3010, 3025, 3005, 3030, 3015, 3040, 3020, 3035,
];

/** 같은 기간 기관 순매수 누적 — 주가가 제자리인 동안 계속 올라간다. */
const CUMULATIVE = PRICES.map((_, i) => Math.round(1200 * i + 40 * i * i));

/** 40거래일 매수일 — 뒤쪽 6일이 붙어 있는 현재 연속 구간이다. */
const BUY_DAYS = [
  false, true, false, false, false, true, false, false, true, false,
  false, false, false, true, false, false, false, false, true, false,
  false, true, false, false, false, false, true, false, false, false,
  false, true, false, false, true, true, true, true, true, true,
];

/** A형 픽스처 — 알 수 없는 case id 의 폴백이기도 하다. */
const A_CASE: QuietPickCardType = {
  type: "A",
  hook: "주가는 제자리인데\n기관만 사고 있어요",
  figure: { kind: "divergence", priceSeries: PRICES, buySeries: CUMULATIVE, buyLegend: "기관 매수 누적" },
  support: ["25일간 · 74주", "거래는 평소의 25%로 말라 있었어요"],
};

const CARD_TYPES: Record<string, QuietPickCardType> = {
  a: A_CASE,
  b: {
    type: "B",
    hook: "기관이 하루 거래량의\n절반을 사갔어요",
    figure: { kind: "ratio", ratioPct: 51, actor: "기관" },
    support: ["25일간 · 74주", "1년 매수는 3건뿐이었어요"],
  },
  c: {
    type: "C",
    hook: "40거래일 만에\n가장 길게 사고 있어요",
    figure: { kind: "streak", buyDays: BUY_DAYS, streakFrom: 34, streakTo: 39, actor: "기관" },
    support: ["25일간 · 74주"],
  },
  d: {
    type: "D",
    hook: "시장은 빠지는데\n이것만 버티고 있어요",
    figure: {
      kind: "divergence",
      // 회색 = 지수, 라임 = 이 종목. A형과 같은 문법이되 라임선의 뜻이 다르다.
      priceSeries: PRICES.map((v, i) => v * (1 - i * 0.002)),
      buySeries: PRICES,
      buyLegend: "이 종목",
      priceLegend: "코스피",
    },
    support: ["5일 연속 시장보다 강해요", "같은 기간 코스피 -2.4%"],
  },
  e: {
    type: "E",
    hook: "석 달 만에 처음\n거래가 4배로 늘었어요",
    figure: {
      kind: "volume",
      volumes: [...Array(39).fill(0).map((_, i) => 900 + (i % 5) * 120), 4200],
      spikeFrom: 39,
      baseDays: 60,
    },
    support: ["주가는 아직 안 움직였어요"],
  },
  min: {
    type: "C",
    hook: "40거래일 만에\n가장 길게 사고 있어요",
    figure: { kind: "streak", buyDays: BUY_DAYS, streakFrom: 34, streakTo: 39, actor: "기관" },
    support: [],
  },
};

function withCase(id: string): QuietPick {
  const pick = { ...basePick, price: { ...basePick.price }, signal: { ...basePick.signal } } as QuietPick;
  pick.cardType = CARD_TYPES[id === "revealed" ? "a" : id] ?? A_CASE;
  if (id === "b") pick.price.sparkline = PRICES.slice(-30);
  /**
   * WO-RESET-06 §B — 다시 나온 카드. 라벨·훅·이름 공개·처음 가격이 한꺼번에 달라진다.
   * 이 케이스가 없으면 그 네 가지를 화면에서 볼 방법이 없다.
   */
  if (id === "returning") {
    pick.signal = { ...pick.signal, reentry: { code: "actor_joined", text: "외국인도 사기 시작했어요", occurredAt: "2026-08-26" } } as QuietPick["signal"];
    pick.exposure = {
      count: 2,
      firstDate: "2026-08-24",
      firstWhen: "8월 24일",
      // 기준 픽(빅텍 3,035원)과 같은 자릿수여야 한다 — 안 그러면 미리보기가 -91% 로 보인다.
      firstPrice: 2_890,
      recent: [{ date: "2026-08-24", when: "8월 24일", reason: "기관이 사기 시작했어요", price: 2_890 }],
    };
  }
  return pick;
}

const CASES: Array<{ id: string; label: string; revealed?: boolean }> = [
  { id: "a", label: "A형 역행 — 두 선의 갭" },
  { id: "b", label: "B형 비율 — 하루 거래량 중 매수분 막대" },
  { id: "c", label: "C형 희소성 — 연속 구간만 accent" },
  { id: "d", label: "D형 시장역행 — 지수선 vs 종목선" },
  { id: "e", label: "E형 거래량각성 — 급증 구간만 accent" },
  { id: "min", label: "보조 줄 없음 — 가장 짧은 카드" },
  { id: "revealed", label: "정체 해제 후 — 종목명·티커 표시", revealed: true },
  { id: "returning", label: "다시 나옴 — 라벨·새 훅·이름 공개·처음 가격 (WO-RESET-06 §B)" },
];

export default function QuietCardPreview() {
  return (
    <main className="mx-auto w-full max-w-md space-y-s5 bg-ds-bg p-gutter">
      <h1 className="text-ds-title text-ds-text-1">메인 카드 — WO-HOOK-01 3형</h1>
      {CASES.map((entry) => (
        <section key={entry.id} data-testid="card-case" data-case={entry.id}>
          <p className="mb-s2 font-mono text-ds-label text-ds-text-3">{entry.label}</p>
          {/* 무대는 덱과 같다 — 고정 높이·테두리 없이 카드가 높이와 표면을 정한다. */}
          <div className="rounded-card">
            <QuietPickCard pick={withCase(entry.id)} onDetail={() => {}} revealed={entry.revealed ?? false} />
          </div>
        </section>
      ))}
    </main>
  );
}

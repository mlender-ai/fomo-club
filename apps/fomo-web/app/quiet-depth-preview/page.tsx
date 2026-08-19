"use client";

import type { QuietPick } from "@/lib/fomoApi";
import { QuietPickDepth } from "@/components/QuietPickDepth";

/**
 * 상세 렌더 프리뷰 — DS-03 검증용 픽스처(`e2e/quiet-depth.spec.ts` 가 잰다).
 *
 * ## 이 페이지가 보는 것
 *
 * 픽 페이로드**만으로** 성립하는 부분이다 — ① 결론 · ② 근거 · ⑤ 틀리는 경우(가격 조건).
 * ③ 회사 · ④ 값 · ⑥ 우리 기록은 각각 벤더 요약 · 지표 3개 · 발행 원장이 필요하고, 이 페이지는
 * API 를 태우지 않으므로 **세 섹션이 통째로 사라지는 것이 정상 동작**이다(DS-03 완료 기준 8).
 * 그 세 섹션의 계약은 유닛(`__tests__/depthDs03.test.ts`)이 지킨다.
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
  signalFacts: { priorBuys12mo: 2, volumePct: 51 },
  invalidation: { level: 2.05, text: "52주 저점 $2.05 이탈 여부가 다음 판단 기준이에요." },
  conviction: {
    whyCompany: "",
    whyNow: {},
    committee: { timingGrade: "B" as const, valuationGrade: "B" as const, verdict1line: "" },
  },
  companyScore: 61,
  qualifiedAt: "2026-08-19",
} as unknown as QuietPick;

export default function QuietDepthPreview() {
  return <QuietPickDepth pick={PICK} onClose={() => undefined} />;
}

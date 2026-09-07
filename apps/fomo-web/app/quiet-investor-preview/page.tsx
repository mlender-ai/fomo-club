"use client";

import { QuietPickDepth } from "@/components/QuietPickDepth";
import type { InvestorPortfolio, QuietPick } from "@/lib/fomoApi";

/**
 * INFLUENCER-01 D-2·E 확인 화면.
 *
 * 인물 걸음과 인물 페이지는 **API 로 오는 포트폴리오**가 있어야 그려진다(90종목을 픽
 * 페이로드에 복제하지 않으므로). 프리뷰는 배포된 백엔드를 보기 때문에 새 라우트가 나가기
 * 전에는 눈으로 확인할 수 없다 — 그래서 픽스처를 주입한다.
 *
 * 값은 2026-09-04 ARK 실측(4펀드 합산 90종목)에서 가져왔다: TSLA 7.1% · CRCL 4.9% ·
 * TEM 4.6% · SPCX 4.5% · COIN 4.1% · HOOD 4.0%.
 */
const PORTFOLIO: InvestorPortfolio = {
  ok: true,
  investor: { id: "cathie-wood", name: "캐시 우드", firm: "ARK", source: "ark" },
  asOf: "2026-09-04",
  asOfLabel: "9월 4일",
  priorAsOf: "2026-08-28",
  priorAsOfLabel: "8월 28일",
  totals: { holdings: 90, valueText: "$6.2B", bought: 2, sold: 1 },
  top: [
    { ticker: "TSLA", weightPct: 7.1 },
    { ticker: "CRCL", weightPct: 4.9 },
    { ticker: "TEM", weightPct: 4.6 },
  ],
  recent: {
    bought: [
      { ticker: "TTMI", name: "TTM TECHNOLOGIES", text: "새로 샀어요" },
      { ticker: "TSLA", name: "TESLA INC", text: "더 샀어요" },
    ],
    sold: [{ ticker: "ZM", name: "ZOOM COMMUNICATIONS", text: "전부 팔았어요" }],
  },
  holdings: [
    { ticker: "TSLA", name: "TESLA INC", weightPct: 7.1, shares: 2_070_000, sharesText: "207만주", valueText: "$780M", deltaWeightPct: 0.3 },
    { ticker: "CRCL", name: "CIRCLE INTERNET GROUP", weightPct: 4.9, shares: 512_000, sharesText: "51만주", valueText: "$300M", deltaWeightPct: -0.8 },
    { ticker: "TEM", name: "TEMPUS AI", weightPct: 4.6, shares: 1_240_000, sharesText: "124만주", valueText: "$280M" },
    { ticker: "COIN", name: "COINBASE GLOBAL", weightPct: 4.1, shares: 401_000, sharesText: "40만주", valueText: "$250M", deltaWeightPct: 0 },
    { ticker: "HOOD", name: "ROBINHOOD MARKETS", weightPct: 4.0, shares: 2_800_000, sharesText: "280만주", valueText: "$240M", deltaWeightPct: 0.1 },
  ],
  truncated: true,
};

const PICK = {
  subject: {
    canonical: "테슬라",
    displayName: "테슬라",
    ticker: "TSLA",
    symbol: "TSLA",
    market: "NASDAQ",
    country: "US" as const,
    identity: "자동차",
  },
  price: { current: 112.3, currentText: "112.30", changePct: 4.8, sparkline: [] as number[] },
  signal: {
    kind: "investor_move" as const,
    code: "investor_move",
    actors: "캐시 우드",
    scale: "207만주",
    days: 3,
    priceAtSignal: 107.2,
    startedAt: "2026-09-04",
    strength: 190,
  },
  hook: "캐시 우드가\n포트폴리오의 7.1%를 이 종목에 담고 있어요",
  /** 인물 카드임을 가리는 필드 — 이게 있으면 상세가 포트폴리오를 받는다. */
  investor: { id: "cathie-wood", name: "캐시 우드", firm: "ARK", asOf: "2026-09-04", changeKind: "holding" },
  anomalies: [],
  signalFacts: {},
  invalidation: { level: 95.4, text: "52주 저점 $95.40 이탈 여부가 다음 판단 기준이에요." },
  conviction: { whyCompany: "", whyNow: {}, committee: { timingGrade: "B" as const, valuationGrade: "B" as const, verdict1line: "" } },
  qualifiedAt: "2026-09-07",
} as unknown as QuietPick;

export default function QuietInvestorPreview() {
  return <QuietPickDepth pick={PICK} onClose={() => undefined} investorPortfolio={PORTFOLIO} />;
}

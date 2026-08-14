"use client";

import type { CardSlotPayload, QuietPick } from "@/lib/fomoApi";
import { QuietPickCard } from "@/components/QuietPickCard";

/**
 * 픽 카드 렌더 프리뷰 (WO-SUB-HOOK PART 2-3 · 완료 조건 5).
 *
 * ## 왜 픽스처 페이지인가
 *
 * "슬롯 조합에 따라 카드 높이가 실제로 달라진다"는 **렌더해야만 확인된다.** 유닛 테스트는
 * 높이를 정하는 계약(`quietCardMinHeight`)까지만 볼 수 있고, 그 계약이 화면에 닿았는지는
 * 못 본다 — WO-SUB-04 에서 "빌더는 맞는데 감싸는 박스가 남는" 결함이 그렇게 새어나갔다.
 * 그래서 4가지 조합을 한 페이지에 세우고 `e2e/quiet-card.spec.ts` 가 boundingBox 로 잰다.
 *
 * 픽스처는 **2026-08-14 프로덕션 payload 를 그대로** 쓴다(옛 문장 포함). 읽는 쪽 복구까지
 * 함께 검증하기 위해서다 — 배치가 돌기 전 화면이 실제로 무엇을 보여주는지가 이 페이지다.
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
  price: { current: 3035, currentText: "3,035원", changePct: -1.46, sparkline: [2930, 2950, 3030, 3015, 3080, 3035] },
  signal: {
    kind: "institution_streak" as const,
    code: "institution_streak",
    actors: "기관",
    scale: "74주",
    days: 25,
    priceAtSignal: 3005,
    startedAt: "2026-07-09",
    strength: 350,
    progress: "25일째 계속 — 어제보다 1일 더 이어졌어요",
  },
  // 배포 직후 실제로 내려오던 옛 훅 — 읽는 쪽이 고쳐야 한다.
  hook: "기관이 25일 연속 — 최근 40거래일 중 가장 길어요 — 거래가 평소의 25%로 말라 있던 자리예요",
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

const substance: CardSlotPayload["substance"] = {
  text: "군용 전자전 장비와 전원공급장치를 만들어 방위사업청에 납품해요.",
  kind: "disclosure",
  badge: "공시",
  vendor_only: false,
};

const valuation = {
  symbol: "065450",
  archetype: "QUALITY_COMPOUNDER",
  ruleset_version: "archetype-v1.0.0",
  bars: [
    { label: "23", value: 800, kind: "actual", source: "dart", as_of: "2023-12-31" },
    { label: "24", value: 950, kind: "actual", source: "dart", as_of: "2024-12-31" },
    { label: "25", value: 1_100, kind: "actual", source: "dart", as_of: "2025-12-31" },
  ],
  line: null,
  bar_metric: "annual_revenue",
  bar_label: "매출",
  line_metric: "per_ttm",
  line_label: "PER",
  currency: "KRW",
  estimate_meta: { present: false, source: null, as_of: null, analyst_count: null },
  band: null,
  warning: null,
  captions: ["5년 밴드를 계산할 만큼의 이력이 확보되지 않았습니다."],
  renderable: true,
  unavailable_reason: null,
} as unknown as NonNullable<CardSlotPayload["valuation"]>;

function slots(kind: "substance" | "valuation" | "both"): CardSlotPayload {
  return {
    canonical: "빅텍",
    market: "KR",
    substance: kind === "valuation" ? null : substance,
    valuation: kind === "substance" ? null : valuation,
    valuation_unavailable_reason: null,
    valuation_frame: null,
    risk: null,
  };
}

const CASES: Array<{ id: string; label: string; slots?: CardSlotPayload }> = [
  { id: "slot1", label: "① 만" },
  { id: "slot12", label: "①②", slots: slots("substance") },
  { id: "slot13", label: "①③", slots: slots("valuation") },
  { id: "slot123", label: "①②③", slots: slots("both") },
];

export default function QuietCardPreview() {
  return (
    <main className="mx-auto w-full max-w-md space-y-6 p-4">
      <h1 className="text-lg font-bold text-whiteout">픽 카드 — 슬롯 조합 4종</h1>
      {CASES.map((entry) => (
        <section key={entry.id} data-testid="card-case" data-case={entry.id}>
          <p className="mb-2 text-xs text-muted">{entry.label}</p>
          {/* 무대는 덱과 같은 구조다 — 고정 높이 없이 카드가 높이를 정한다. */}
          <div className="rounded-3xl border border-hairline bg-[#14161c] p-5">
            <QuietPickCard pick={basePick} slots={entry.slots} />
          </div>
        </section>
      ))}
    </main>
  );
}

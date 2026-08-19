"use client";

import type { QuietPick } from "@/lib/fomoApi";
import { QuietPickCard } from "@/components/QuietPickCard";

/**
 * 픽 카드 렌더 프리뷰 — DS-01 검증용 픽스처(`e2e/quiet-card.spec.ts` 가 boundingBox 로 잰다).
 *
 * ## 왜 픽스처 페이지인가
 *
 * "블록이 빠지면 카드가 짧아진다"(DS-01 §5)는 **렌더해야만 확인된다.** 유닛 테스트는 소스와
 * 순수 함수까지만 본다 — 화면에 닿았는지는 못 본다.
 *
 * ## 4가지 경우
 *
 * | case | 구성 |
 * |---|---|
 * | `min` | ①②③⑦ — 근거·스파크라인·성적 없음(가장 짧은 카드) |
 * | `evidence` | + ④ 근거 한 줄 |
 * | `spark` | + ⑤ 스파크라인(30포인트) |
 * | `full` | + ⑥ 우리 성적(accent 있는 유일한 경우) |
 *
 * 픽스처는 **2026-08-14 프로덕션 payload 를 그대로** 쓴다(옛 문장 포함). 읽는 쪽 복구까지
 * 함께 검증하기 위해서다.
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

/** 30거래일 종가 — DS-01 §3-⑤ 는 20포인트 미만이면 스파크라인을 숨긴다. */
const SERIES = [
  2930, 2950, 3030, 3015, 3080, 3035, 2990, 3005, 3050, 3120,
  3100, 3075, 3040, 3010, 2995, 3020, 3065, 3090, 3110, 3085,
  3055, 3030, 3000, 2985, 3015, 3045, 3070, 3095, 3060, 3035,
];

/** 근거 한 줄의 원료. 실수치가 없으면 카드는 근거 줄을 그리지 않는다. */
const FACTS = { isLongestStreak: true, streakWindowDays: 40, volumeVacuumRatio: 0.25 };

function withCase(id: string): QuietPick {
  const pick = { ...basePick, price: { ...basePick.price }, signal: { ...basePick.signal } } as QuietPick;
  if (id === "min") {
    // 근거로 쓸 실수치도, 규모도 없는 픽 — ④ 가 통째로 빠지는 경우다(빈 자리 없이 짧아진다).
    pick.signal.scale = "";
    pick.signal.days = 0;
  } else {
    pick.signalFacts = FACTS;
  }
  if (id === "spark" || id === "full") pick.price.sparkline = SERIES;
  if (id === "full") {
    pick.ourRecord = { firstPublishedAt: "2026-08-17", sinceText: "8월 17일에 짚은 뒤", returnPct: 13.1 };
  }
  return pick;
}

const CASES: Array<{ id: string; label: string }> = [
  { id: "min", label: "①②③⑦ — 최소 구성" },
  { id: "evidence", label: "+ ④ 근거 한 줄" },
  { id: "spark", label: "+ ⑤ 스파크라인" },
  { id: "full", label: "+ ⑥ 우리 성적 (accent)" },
];

export default function QuietCardPreview() {
  return (
    <main className="mx-auto w-full max-w-md space-y-s5 bg-ds-bg p-gutter">
      <h1 className="text-ds-title text-ds-text-1">메인 카드 — DS-01 구성 4종</h1>
      {CASES.map((entry) => (
        <section key={entry.id} data-testid="card-case" data-case={entry.id}>
          <p className="mb-s2 font-mono text-ds-label text-ds-text-3">{entry.label}</p>
          {/* 무대는 덱과 같다 — 고정 높이·테두리 없이 카드가 높이와 표면을 정한다. */}
          <div className="rounded-card">
            <QuietPickCard pick={withCase(entry.id)} onDetail={() => {}} />
          </div>
        </section>
      ))}
    </main>
  );
}

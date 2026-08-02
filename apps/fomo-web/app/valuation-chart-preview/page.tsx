"use client";

import type { ValuationChartData } from "@fomo/core";
import { ValuationChart } from "@/components/ValuationChart";

/**
 * 값의 상태 차트 프리뷰 (WO-SUB-04 B안).
 *
 * **픽스처로 그린다.** 팩트시트를 프론트로 내보내는 경로가 아직 없어서(백엔드 라우트 +
 * `auth-proxy` 허용 목록 + 페치가 전부 필요하다) 실데이터 배선은 다음 단계다.
 * 그 배선을 기다리며 렌더를 못 보는 것보다, 계약(`ValuationChartData`)에 맞춘 픽스처로
 * 규칙이 눈에 보이게 해두는 편이 검토에 낫다.
 *
 * 카드 앞면에 넣지 않은 이유: 카드 레이아웃 재배치는 `WO-SUB-08` 범위다(이 WO 의 범위 밖).
 */

const base = {
  ruleset_version: "archetype-v1.0.0",
  currency: "USD" as const,
  line: null,
  renderable: true,
  unavailable_reason: null,
};

/** 실적만 — 컨센서스가 없으면 예상 막대를 그리지 않는다(§4 규칙 2). */
const actualOnly: ValuationChartData = {
  ...base,
  symbol: "ACTUAL",
  archetype: "PHARMA_STABLE",
  bars: [
    { label: "22", value: 820, kind: "actual", source: "sec_xbrl", as_of: "2022-12-31" },
    { label: "23", value: 910, kind: "actual", source: "sec_xbrl", as_of: "2023-12-31" },
    { label: "24", value: 1_050, kind: "actual", source: "sec_xbrl", as_of: "2024-12-31" },
    { label: "25", value: 1_180, kind: "actual", source: "sec_xbrl", as_of: "2025-12-31" },
  ],
  bar_metric: "annual_revenue",
  bar_label: "매출",
  line_metric: "per_ttm",
  line_label: "PER",
  estimate_meta: { present: false, source: null, as_of: null, analyst_count: null },
  band: null,
  warning: null,
  captions: ["5년 밴드를 계산할 만큼의 이력이 확보되지 않았습니다."],
};

/** 실적 + 예상 — 경계에 점선과 "예상" 라벨이 붙는다. */
const withEstimates: ValuationChartData = {
  ...base,
  symbol: "ESTIMATE",
  archetype: "QUALITY_COMPOUNDER",
  bars: [
    { label: "23", value: 1_000, kind: "actual", source: "sec_xbrl", as_of: "2023-12-31" },
    { label: "24", value: 1_240, kind: "actual", source: "sec_xbrl", as_of: "2024-12-31" },
    { label: "25", value: 1_530, kind: "actual", source: "sec_xbrl", as_of: "2025-12-31" },
    { label: "26", value: 1_820, kind: "estimate", source: "nasdaq", as_of: "2026-08-01" },
    { label: "27", value: 2_150, kind: "estimate", source: "nasdaq", as_of: "2026-08-01" },
  ],
  bar_metric: "annual_revenue",
  bar_label: "매출",
  line_metric: "per_forward",
  line_label: "Forward PER",
  estimate_meta: { present: true, source: "nasdaq", as_of: "2026-08-01", analyst_count: 12 },
  band: null,
  captions: [
    "현재 Forward PER은 최근 5년 밴드에서 34% 구간입니다. (기준일 2026-08-02)",
    "26 이후는 애널리스트 예상치입니다. (출처 nasdaq, 12명, 기준일 2026-08-01)",
  ],
  warning: null,
};

/** 적자 구간에서 배수 선이 **끊긴다**. 보간하면 거짓말이 된다(완료 조건 4). */
const brokenLine: ValuationChartData = {
  ...base,
  symbol: "BROKEN",
  archetype: "TURNAROUND_LOSS",
  bars: [
    { label: "23Q1", value: 40, kind: "actual", source: "dart", as_of: "2023-03-31" },
    { label: "23Q2", value: 28, kind: "actual", source: "dart", as_of: "2023-06-30" },
    { label: "23Q3", value: -25, kind: "actual", source: "dart", as_of: "2023-09-30" },
    { label: "23Q4", value: -18, kind: "actual", source: "dart", as_of: "2023-12-31" },
    { label: "24Q1", value: 12, kind: "actual", source: "dart", as_of: "2024-03-31" },
  ],
  line: [
    { date: "2023-03-31", value: 22 },
    { date: "2023-06-30", value: 19 },
    // 적자 구간의 배수는 존재하지 않는다 — 여기서 선이 끊긴다.
    { date: "2023-09-30", value: null },
    { date: "2023-12-31", value: null },
    // 흑자 전환 후 다시 관측된다. 앞 조각과 이어 붙이지 않는다(점으로 남는다).
    { date: "2024-03-31", value: 15 },
  ],
  bar_metric: "quarterly_operating_income",
  bar_label: "분기 영업이익",
  line_metric: "pbr",
  line_label: "PBR",
  estimate_meta: { present: false, source: null, as_of: null, analyst_count: null },
  band: null,
  captions: ["현재 PBR은 최근 5년 밴드에서 61% 구간입니다. (기준일 2026-08-02)"],
  warning: null,
};

/** 경고문 강제 부착 — 시클리컬(INV-11). 문안은 독트린에서 온다. */
const cyclical: ValuationChartData = {
  ...withEstimates,
  symbol: "CYCLICAL",
  archetype: "CYCLICAL_COMMODITY",
  line_metric: "pbr",
  line_label: "PBR",
  warning:
    "이 유형은 이익이 정점일 때 PER이 가장 낮게 나오는 경향이 있습니다. 지금의 낮은 PER은 값의 위치보다 이익의 위치를 반영하고 있을 수 있습니다.",
};

/** 미분류 — 차트 영역 **자체가 사라진다**(빈 박스로 남지 않는다, 완료 조건 2). */
const unclassified: ValuationChartData = {
  ...base,
  symbol: "UNCLASSIFIED",
  archetype: "UNCLASSIFIED",
  bars: [],
  bar_metric: null,
  bar_label: null,
  line_metric: null,
  line_label: null,
  estimate_meta: { present: false, source: null, as_of: null, analyst_count: null },
  band: null,
  warning: null,
  captions: [],
  renderable: false,
  unavailable_reason: "unclassified",
};

const CASES: Array<{ title: string; note: string; data: ValuationChartData }> = [
  { title: "실적만", note: "컨센서스가 없으면 예상 막대를 그리지 않는다", data: actualOnly },
  { title: "실적 + 예상", note: "경계에 점선과 '예상' 라벨", data: withEstimates },
  { title: "배수 선 끊김", note: "적자 구간의 배수는 존재하지 않는다 — 보간 금지", data: brokenLine },
  { title: "경고문 강제 부착", note: "시클리컬 — 문안은 독트린에서 로드", data: cyclical },
  { title: "미분류", note: "차트 영역 자체가 사라진다(아래가 비어 있으면 정상)", data: unclassified },
];

export default function ValuationChartPreviewPage() {
  return (
    <main className="mx-auto max-w-[420px] px-4 py-8">
      <h1 className="font-pixel text-sm text-whiteout">값의 상태 차트 — 렌더 프리뷰</h1>
      <p className="mt-2 text-[11px] leading-4 text-muted">
        WO-SUB-04 B안. 픽스처로 그린 화면이며 실데이터 배선은 다음 단계다.
      </p>
      <div className="mt-6 space-y-8">
        {CASES.map((entry) => (
          <section key={entry.title}>
            <h2 className="text-xs text-whiteout">{entry.title}</h2>
            <p className="mb-2 text-[10px] leading-4 text-muted">{entry.note}</p>
            {/*
              **소비자도 `renderable` 을 봐야 한다.** 컴포넌트가 `null` 을 돌려줘도 감싸는
              박스를 그대로 두면 화면에는 빈 상자가 남는다 — 완료 조건 2 가 금지하는 것이
              정확히 그 모양이다(실측: 첫 프리뷰에서 미분류 칸에 빈 상자가 남았다).
              차트를 감싸는 쪽은 이 패턴을 그대로 따른다.
            */}
            {entry.data.renderable && (
              <div className="rounded-xl border border-hairline bg-elevated p-3">
                <ValuationChart data={entry.data} />
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchTrackRecord, type TrackMetric, type TrackRecordResponse, type TrackWindowResult } from "@/lib/fomoApi";

const NEON = "#D8FF3A";
const ASSET_LABEL: Record<string, string> = {
  "kr-stock": "국장",
  "us-stock": "미장",
  coin: "코인",
  macro: "거시",
};
const SIGNAL_LABEL: Record<string, string> = {
  insider: "내부자 매수",
  flow: "수급",
  volume: "거래량",
  material: "재료",
  chart: "차트",
  price: "가격",
  time: "시점",
  herd: "화제성",
  affinity: "관심",
};
const SCORE_LABEL: Record<string, string> = {
  "80-100": "80점 이상",
  "60-79": "60–79점",
  "0-59": "60점 미만",
};

function signed(value: number | null): string {
  if (value === null) return "축적 중";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function MetricBlock({ label, metric, value }: { label: string; metric: TrackMetric; value: "winRate" | "median" | "n" }) {
  const display = value === "n"
    ? metric.n.toLocaleString("ko-KR")
    : value === "median"
      ? signed(metric.medianReturn)
      : metric.winRate === null ? "축적 중" : `${metric.winRate.toFixed(1)}%`;
  const note = value === "winRate" ? "수익률 0% 초과" : value === "median" ? "전체 수익률 중앙값" : "상승·하락 모두 포함";
  return (
    <div className="border-l border-hairline pl-3 first:border-l-0 first:pl-0">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-1 font-number text-xl font-bold text-whiteout">{display}</p>
      <p className="mt-0.5 text-[10px] text-muted">{note}</p>
    </div>
  );
}

function Breakdown({
  title,
  values,
  labels,
  order,
}: {
  title: string;
  values: Record<string, TrackMetric>;
  labels: Record<string, string>;
  order?: string[];
}) {
  const rank = new Map((order ?? []).map((key, index) => [key, index]));
  const rows = Object.entries(values).sort((a, b) => {
    if (order) return (rank.get(a[0]) ?? 999) - (rank.get(b[0]) ?? 999);
    return b[1].n - a[1].n || a[0].localeCompare(b[0]);
  });
  return (
    <section className="border-t border-hairline py-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-whiteout">{title}</h2>
        <span className="text-[10px] text-muted">상승·하락 전체</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">고정 기간이 지난 기록을 축적 중이에요.</p>
      ) : (
        <div className="divide-y divide-hairline">
          {rows.map(([key, metric]) => (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
              <span className="min-w-0 truncate text-sm text-whiteout">{labels[key] ?? key}</span>
              <div className="min-w-16 text-right">
                <p className="font-number text-sm font-bold" style={{ color: metric.winRate !== null && metric.winRate >= 50 ? NEON : "#A3A3A0" }}>
                  {metric.winRate === null ? "—" : `${metric.winRate.toFixed(1)}%`}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">n={metric.n}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function TrackRecordPage() {
  const [record, setRecord] = useState<TrackRecordResponse | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void fetchTrackRecord().then(setRecord).catch(() => setFailed(true));
  }, []);

  const windowResult = useMemo<TrackWindowResult | null>(
    () => record?.windows.find((item) => item.days === days) ?? null,
    [record, days]
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 pb-16 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <a href="/" className="text-sm text-muted">← 오늘의 30장</a>
        <span className="font-pixel text-xs text-whiteout">FOMO CLUB</span>
      </div>

      <header className="pb-6 pt-10">
        <p className="font-pixel text-[10px] text-muted">JUDGMENT LEDGER</p>
        <h1 className="mt-2 text-3xl font-bold text-whiteout">포모클럽의 성적표</h1>
        <p className="mt-3 max-w-xl break-words text-sm leading-6 text-muted">
          선정 당시 가격을 바꾸지 않고 박제한 뒤, 7·30·90일의 실제 종가로 전부 채점합니다. 오른 카드와 내린 카드를 모두 포함합니다.
        </p>
      </header>

      <div className="mb-6 inline-flex rounded-lg border border-hairline p-1">
        {([7, 30, 90] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDays(value)}
            className="min-w-20 rounded-md px-4 py-2 text-xs font-semibold"
            style={days === value ? { backgroundColor: NEON, color: "#0A0A0A" } : { color: "#A3A3A0" }}
          >
            {value}일
          </button>
        ))}
      </div>

      {failed ? (
        <p className="border-t border-hairline py-12 text-center text-sm text-muted">성과 원장을 불러오지 못했어요.</p>
      ) : !windowResult ? (
        <p className="border-t border-hairline py-12 text-center text-sm text-muted">성과 원장을 불러오는 중이에요.</p>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-4 border-y border-hairline py-5">
            <MetricBlock label={`${days}일 상승 비율`} metric={windowResult.overall} value="winRate" />
            <MetricBlock label="중앙값 수익" metric={windowResult.overall} value="median" />
            <MetricBlock label="전체 표본" metric={windowResult.overall} value="n" />
          </section>
          <Breakdown title="자산군별" values={windowResult.byAsset} labels={ASSET_LABEL} />
          <Breakdown title="신호 유형별" values={windowResult.bySignal} labels={SIGNAL_LABEL} />
          <Breakdown
            title="종합 점수대별"
            values={windowResult.byScoreBand}
            labels={SCORE_LABEL}
            order={["80-100", "60-79", "0-59"]}
          />
        </>
      )}

      <footer className="break-words border-t border-hairline pt-5 text-[11px] leading-5 text-muted">
        수익률은 선정 시점 가격 대비 목표일 당일 또는 다음 첫 거래일 종가입니다. 거래비용·세금·환율 효과는 포함하지 않습니다.
      </footer>
    </main>
  );
}

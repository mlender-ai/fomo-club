"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeCompanyName } from "@fomo/core";
import { SIGNAL_TYPE_CODES, SIGNAL_TYPE_LABELS } from "@fomo/core";
import {
  fetchTrackRecord,
  fetchScorecardPicks,
  fetchInvalidationSummary,
  type InvalidationMetric,
  type InvalidationSummary,
  type TrackMetric,
  type TrackRecordResponse,
  type TrackWindowResult,
  type ScorecardPick,
} from "@/lib/fomoApi";
import { StockInsightView } from "@/components/KeywordDepthPage";

const NEON = "#D8FF3A";
const ASSET_LABEL: Record<string, string> = {
  "kr-stock": "국장",
  "us-stock": "미장",
  coin: "코인",
  macro: "거시",
};
const SIGNAL_LABEL: Record<string, string> = SIGNAL_TYPE_LABELS;
const SCORE_LABEL: Record<string, string> = {
  "80-100": "80점 이상",
  "60-79": "60–79점",
  "0-59": "60점 미만",
};

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * 무효 조건 블록 (WO-SUB-07 §8).
 *
 * **판정 불가를 미충족으로 세지 않는다**(§6-4). 셋을 모두 보여주고 표본 수(n)를 병기한다 —
 * 표본이 작으면 작다고 보여야 한다(§8). 비율만 내면 3건의 33% 와 300건의 33% 가 같아 보인다.
 *
 * 데이터가 없으면 블록 자체를 숨긴다(빈 상자 금지). 성적이 나빠서 숨기는 것이 아니라
 * 아직 판정할 발행분이 없다는 뜻이다 — 생기면 자동으로 나온다.
 */
function InvalidationRow({ label, metric, note }: { label: string; metric: InvalidationMetric; note: string }) {
  if (metric.n === 0) return null;
  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-whiteout">{label}</span>
        <span className="text-sm font-bold" style={{ color: NEON }}>
          {metric.rate === null ? "—" : `${metric.rate.toFixed(1)}%`}
          {/* 표본 수를 항상 병기한다(§8). 다만 영문 약어 표기는 내부 용어라 화면에서는 한국어로
              쓴다 — WO §8 목업도 "판단 수 1,240" 형태이고, insufficientSampleCopyGuard 가 그 약어를 막는다. */}
          <span className="ml-1.5 text-[11px] font-normal text-muted">판단 {metric.n.toLocaleString("ko-KR")}건</span>
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-muted [overflow-wrap:anywhere]">
        도달 {metric.reached} · 미도달 {metric.notReached} · 판정 불가 {metric.undetermined}
      </p>
      <p className="mt-0.5 text-[11px] leading-5 text-muted [overflow-wrap:anywhere]">{note}</p>
    </div>
  );
}

function InvalidationBlock({ summary }: { summary: InvalidationSummary | null }) {
  if (!summary) return null;
  if (summary.price.n === 0 && summary.business.n === 0) return null;
  const reasons = Object.entries(summary.businessUndeterminedReasons).sort((a, b) => b[1] - a[1]);
  const versions = Object.entries(summary.rulesetVersions).sort((a, b) => b[1] - a[1]);
  return (
    <section className="mt-4 rounded-xl border border-hairline bg-white/[0.03] px-4 py-4">
      <p className="text-sm font-bold text-whiteout">무효 조건</p>
      <p className="mt-1 text-[12px] leading-5 text-muted [overflow-wrap:anywhere]">
        발행할 때 &ldquo;이러면 이 관점은 틀린 겁니다&rdquo;라고 미리 적어둔 선이에요. 얼마나 도달했는지 그대로 셉니다.
      </p>
      <div className="mt-3">
        <InvalidationRow label="가격 무효선 도달" metric={summary.price} note="발행 시점 무효선을 이후 관측 가격이 넘었는지" />
        <InvalidationRow label="사업 무효 조건 도달" metric={summary.business} note="실적 데이터로 자동 판정한 결과" />
      </div>
      {reasons.length > 0 && (
        <p className="mt-3 text-[11px] leading-5 text-muted [overflow-wrap:anywhere]">
          판정 불가 사유 · {reasons.map(([reason, count]) => `${reason} ${count}`).join(" · ")}
        </p>
      )}
      {versions.length > 0 && (
        <p className="mt-1 text-[11px] leading-5 text-muted [overflow-wrap:anywhere]">
          규칙 버전 분포 · {versions.map(([version, count]) => `${version} ${count}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function MetricBlock({ label, metric, value }: { label: string; metric: TrackMetric; value: "winRate" | "median" | "n" }) {
  if ((value === "winRate" && metric.winRate === null) || (value === "median" && metric.medianReturn === null)) return null;
  const display = value === "n"
    ? metric.n.toLocaleString("ko-KR")
    : value === "median"
      ? signed(metric.medianReturn!)
      : `${metric.winRate!.toFixed(1)}%`;
  const note = value === "winRate" ? "수익률 0% 초과" : value === "median" ? "전체 수익률 중앙값" : "상승·하락 모두 포함";
  return (
    <div className="min-w-0 border-l border-hairline pl-3 first:border-l-0 first:pl-0">
      <p className="break-words text-[10px] leading-4 text-muted">{label}</p>
      <p className="mt-1 break-words font-number text-lg font-bold leading-6 text-whiteout sm:text-xl">{display}</p>
      <p className="mt-0.5 break-words text-[10px] leading-4 text-muted">{note}</p>
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
  const rows = Object.entries(values).filter(([, metric]) => metric.n > 0 && metric.winRate !== null).sort((a, b) => {
    if (order) return (rank.get(a[0]) ?? 999) - (rank.get(b[0]) ?? 999);
    return b[1].n - a[1].n || a[0].localeCompare(b[0]);
  });
  if (rows.length === 0) return null;
  return (
    <section className="border-t border-hairline py-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-whiteout">{title}</h2>
        <span className="text-[10px] text-muted">상승·하락 전체</span>
      </div>
      <div className="divide-y divide-hairline">
          {rows.map(([key, metric]) => (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
              <span className="min-w-0 truncate text-sm text-whiteout">{labels[key] ?? key}</span>
              <div className="min-w-16 text-right">
                <p className="font-number text-sm font-bold" style={{ color: metric.winRate !== null && metric.winRate >= 50 ? NEON : "#A3A3A0" }}>
                  {metric.winRate!.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-[10px] text-muted">{metric.n}건 기준</p>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

function marketTag(pick: ScorecardPick): string {
  if (pick.market === "COIN") return "₿";
  if (pick.country === "US") return "🇺🇸";
  return "🇰🇷";
}

function PickRow({ pick, days, onOpen }: { pick: ScorecardPick; days: 7 | 30 | 90; onOpen: () => void }) {
  const ret = pick.returns[String(days) as "7" | "30" | "90"];
  const color = ret ? (ret.returnPct > 0 ? NEON : ret.returnPct < 0 ? "#F87171" : "#A3A3A0") : "#6B6B68";
  return (
    <button type="button" onClick={onOpen} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-3 text-left">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span aria-hidden>{marketTag(pick)}</span>
          <span className="truncate text-sm font-semibold text-whiteout">{normalizeCompanyName(pick.canonical)}</span>
          <span className="shrink-0 text-[10px] text-muted">{pick.date}</span>
        </div>
        {pick.hook && <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted [overflow-wrap:anywhere]">“{pick.hook}”</p>}
      </div>
      <div className="min-w-16 shrink-0 text-right">
        <p className="font-number text-sm font-bold" style={{ color }}>
          {ret ? signed(ret.returnPct) : "채점 전"}
        </p>
        <p className="mt-0.5 text-[10px] text-muted">당시 {pick.priceAt >= 1000 ? pick.priceAt.toLocaleString("ko-KR") : pick.priceAt.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
      </div>
    </button>
  );
}

function PickList({ picks, days, onOpen }: { picks: ScorecardPick[]; days: 7 | 30 | 90; onOpen: (pick: ScorecardPick) => void }) {
  if (picks.length === 0) return null;
  return (
    <section className="border-t border-hairline py-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-whiteout">짚은 픽 · 최신순</h2>
        <span className="text-[10px] text-muted">그때 뭐라 했는지 그대로</span>
      </div>
      <div className="divide-y divide-hairline">
        {picks.map((pick) => (
          <PickRow key={`${pick.date}:${pick.canonical}`} pick={pick} days={days} onOpen={() => onOpen(pick)} />
        ))}
      </div>
    </section>
  );
}

/** 헤드라인 + 최근 픽을 정사각 이미지로 — 공유·저장(마케팅 1등 화면). */
async function shareScorecard(headline: string, picks: ScorecardPick[], days: 7 | 30 | 90): Promise<void> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0A0A0A";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = NEON;
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("FOMO CLUB · 성적표", 72, 120);
  ctx.fillStyle = "#FAFAFA";
  ctx.font = "bold 52px sans-serif";
  wrapText(ctx, headline, 72, 220, size - 144, 66);
  ctx.font = "bold 34px sans-serif";
  let y = 470;
  for (const pick of picks.slice(0, 5)) {
    const ret = pick.returns[String(days) as "7" | "30" | "90"];
    ctx.fillStyle = "#FAFAFA";
    ctx.fillText(`${marketTag(pick)} ${normalizeCompanyName(pick.canonical)}`.slice(0, 22), 72, y);
    ctx.fillStyle = ret ? (ret.returnPct >= 0 ? NEON : "#F87171") : "#6B6B68";
    ctx.textAlign = "right";
    ctx.fillText(ret ? signed(ret.returnPct) : "채점 전", size - 72, y);
    ctx.textAlign = "left";
    y += 78;
  }
  ctx.fillStyle = "#A3A3A0";
  ctx.font = "26px sans-serif";
  ctx.fillText("이 기록은 수정·삭제되지 않습니다.", 72, size - 80);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const file = new File([blob], "fomo-scorecard.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ files: [file], title: "FOMO CLUB 성적표" }).catch(() => undefined);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fomo-scorecard.png";
  a.click();
  URL.revokeObjectURL(url);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

export default function TrackRecordPage() {
  const [record, setRecord] = useState<TrackRecordResponse | null>(null);
  const [picks, setPicks] = useState<ScorecardPick[]>([]);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [userPicked, setUserPicked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ScorecardPick | null>(null);
  // 무효 조건 성적 — 실패해도 성적표 나머지는 그대로다(선택 블록).
  const [invalidation, setInvalidation] = useState<InvalidationSummary | null>(null);

  useEffect(() => {
    void fetchTrackRecord().then(setRecord).catch(() => setFailed(true));
    void fetchScorecardPicks().then((res) => setPicks(res.picks)).catch(() => undefined);
    void fetchInvalidationSummary().then(setInvalidation).catch(() => undefined);
  }, []);

  // 아직 도래한 outcome이 특정 창에만 있을 수 있어, 첫 진입은 기록이 가장 많은 창을 고른다.
  useEffect(() => {
    if (!record || userPicked) return;
    const best = record.windows.reduce<{ days: 7 | 30 | 90; n: number } | null>((acc, w) => {
      const d = w.days as 7 | 30 | 90;
      return acc && acc.n >= w.overall.n ? acc : { days: d, n: w.overall.n };
    }, null);
    if (best && best.n > 0 && best.days !== days) setDays(best.days);
  }, [record, userPicked, days]);

  const windowResult = useMemo<TrackWindowResult | null>(
    () => record?.windows.find((item) => item.days === days) ?? null,
    [record, days]
  );

  const headline = useMemo(() => {
    const o = windowResult?.overall;
    if (!o || o.n === 0 || o.winRate === null || o.medianReturn === null) return null;
    return `우리가 짚은 ${o.n}곳, ${days}일 승률 ${o.winRate.toFixed(1)}% · 중앙값 ${signed(o.medianReturn)}`;
  }, [windowResult, days]);

  const onShare = useCallback(() => {
    void shareScorecard(headline ?? "포모클럽의 성적표", picks, days);
  }, [headline, picks, days]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 pb-16 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <a href="/" className="text-sm text-muted">← 오늘의 30장</a>
        <span className="font-pixel text-xs text-whiteout">FOMO CLUB</span>
      </div>

      <header className="pb-6 pt-10">
        <p className="font-pixel text-[10px] text-muted">JUDGMENT LEDGER</p>
        <h1 className="mt-2 text-3xl font-bold text-whiteout">포모클럽의 성적표</h1>
        {headline ? (
          <p className="mt-3 max-w-xl break-words text-lg font-bold leading-7 text-whiteout [overflow-wrap:anywhere]">{headline}</p>
        ) : (
          <p className="mt-3 max-w-xl break-words text-sm leading-6 text-muted [overflow-wrap:anywhere]">
            선정 당시 가격을 박제한 뒤 7·30·90일 실제 종가로 채점 중이에요. 도래한 창부터 공개됩니다.
          </p>
        )}
        <p className="mt-2 max-w-xl break-words text-[12px] leading-5 text-muted [overflow-wrap:anywhere]">
          전체 공개(하락 포함) · 고정 창 · 소급 불변. 오른 것만 고르지 않아요.
        </p>
        <button
          type="button"
          onClick={onShare}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-black"
          style={{ backgroundColor: NEON }}
        >
          성적표 공유하기
        </button>
      </header>

      <div className="mb-6 inline-flex rounded-lg border border-hairline p-1">
        {([7, 30, 90] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setUserPicked(true);
              setDays(value);
            }}
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
      ) : windowResult.overall.n > 0 ? (
        <>
          <section className="grid grid-cols-3 gap-4 border-y border-hairline py-5">
            <MetricBlock label={`${days}일 상승 비율`} metric={windowResult.overall} value="winRate" />
            <MetricBlock label="중앙값 수익" metric={windowResult.overall} value="median" />
            <MetricBlock label="전체 표본" metric={windowResult.overall} value="n" />
          </section>
          <Breakdown title="자산군별" values={windowResult.byAsset} labels={ASSET_LABEL} />
          <Breakdown
            title="신호 유형별"
            values={windowResult.bySignal}
            labels={SIGNAL_LABEL}
            order={[...SIGNAL_TYPE_CODES]}
          />
          <Breakdown
            title="종합 점수대별"
            values={windowResult.byScoreBand}
            labels={SCORE_LABEL}
            order={["80-100", "60-79", "0-59"]}
          />
        </>
      ) : null}

      <InvalidationBlock summary={invalidation} />

      <PickList picks={picks} days={days} onOpen={setSelected} />

      <section className="mt-4 rounded-xl border border-hairline bg-white/[0.03] px-4 py-4">
        <p className="text-sm font-bold text-whiteout">이 기록은 수정·삭제되지 않습니다.</p>
        <p className="mt-1 text-[12px] leading-5 text-muted [overflow-wrap:anywhere]">
          선정 시점 가격과 그때의 훅을 append-only 원장에 봉인해요. 틀린 픽도 그대로 남습니다 — 그게 제품의 서약이에요.
        </p>
      </section>

      <footer className="break-words border-t border-hairline pt-5 text-[11px] leading-5 text-muted [overflow-wrap:anywhere]">
        수익률은 선정 시점 가격 대비 목표일 당일 또는 다음 첫 거래일 종가입니다. 거래비용·세금·환율 효과는 포함하지 않습니다.
      </footer>

      {selected && (
        <StockInsightView
          stock={selected.canonical}
          context={{
            ...(selected.symbol ? { symbol: selected.symbol } : {}),
            ...(selected.naverCode ? { naverCode: selected.naverCode } : {}),
            ...(selected.market ? { market: selected.market } : {}),
            ...(selected.country ? { country: selected.country } : {}),
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

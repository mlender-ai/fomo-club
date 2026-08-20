"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeCompanyName } from "@fomo/core";
import {
  fetchTrackRecord,
  fetchInvalidationSummary,
  fetchDiscoveryPerformancePrices,
  type DiscoveryPerformancePriceRequestItem,
  type InvalidationSummary,
  type TrackWindowResult,
  type TrackRecordResponse,
} from "@/lib/fomoApi";
import { fetchScorecardPicksCached, type ScorecardPick } from "@/lib/judgmentLedgerClient";
import {
  formatSignedPct,
  hasEnoughSample,
  koreanDate,
  pendingScoring,
  rateOrSampleShort,
  sinceMove,
} from "@/lib/scorecard";
import { StockInsightView } from "@/components/KeywordDepthPage";

/**
 * 성적표 — DS-04 §1(`docs/design/DS-04_RECORDS.md`). 토큰은 DS-00.
 *
 * ## 이 화면의 설계 과제는 **빈 상태**다
 *
 * 지금 채점 표본이 거의 없다(가격 무효선 30건 전부 판정 불가, T+30 표본 부족). 그대로 열면
 * 빈 화면인데, 그게 고장으로 읽히면 안 된다. 그래서
 *
 * 1. 채점 결과가 없으면 **채점 대기 건수 + 첫 채점 예정일**을 말한다(다시 올 이유).
 * 2. 채점과 별개로 **"짚은 뒤 지금까지 얼마나 움직였나"** 는 지금 계산할 수 있다 — 그걸 보여준다.
 *    단 **채점 결과가 아니라고 명시**한다(§1-5).
 *
 * ## 절대 규칙 (§1-4)
 *
 * 표본 30 미만이면 비율 대신 `표본 부족 (N건)` · 판정 불가를 분모에서 빼지 않는다 ·
 * 평균 금지(중앙값만) · 나쁜 성적도 그대로. 계산은 `lib/scorecard.ts` 가 한다.
 *
 * accent 는 **대표 지표 하나**뿐이다. 채점 결과가 있으면 중앙값, 없으면 현재 변동이 그 자리다.
 */

/** KST 오늘 `YYYY-MM-DD`. */
function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

/** 섹션 — 제목은 `label` mono, 위에 0.5px 구분선. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-s5 border-t-hair border-ds-border pt-s5">
      <h2 className="font-mono text-ds-label tracking-[0.06em] text-ds-text-2">{title}</h2>
      <div className="mt-s3">{children}</div>
    </section>
  );
}

/** 라벨-값 행 — 값은 우측 정렬. 표본 수는 값 아래 `caption` 으로 항상 병기한다(§1-3). */
function Row({
  label,
  value,
  sample,
  accent = false,
}: {
  label: string;
  value: string;
  sample?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-s3 py-s2">
      <span className="shrink-0 font-mono text-ds-label text-ds-text-2">{label}</span>
      <span className="min-w-0 text-right">
        <span
          className={
            accent
              ? "font-mono text-[28px] font-medium leading-none text-ds-accent"
              : "font-mono text-[16px] leading-tight text-ds-text-1"
          }
        >
          {value}
        </span>
        {sample && <span className="mt-s1 block font-mono text-ds-caption text-ds-text-3">{sample}</span>}
      </span>
    </div>
  );
}

const WINDOWS = [7, 30, 90] as const;

/** 지표 행 3개 스켈레톤 (DS-05 §5). 스피너 금지. */
function ScorecardSkeleton() {
  return (
    <div className="mt-s5 border-t-hair border-ds-border pt-s5" data-testid="scorecard-skeleton" aria-busy>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-baseline justify-between gap-s3 py-s3">
          <span className="ds-skeleton h-4 w-24 rounded-block bg-ds-surface-1" />
          <span className="ds-skeleton h-6 w-20 rounded-block bg-ds-surface-1" />
        </div>
      ))}
    </div>
  );
}

export default function TrackRecordPage() {
  const [record, setRecord] = useState<TrackRecordResponse | null>(null);
  const [picks, setPicks] = useState<ScorecardPick[]>([]);
  const [invalidation, setInvalidation] = useState<InvalidationSummary | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ScorecardPick | null>(null);

  useEffect(() => {
    void fetchTrackRecord().then(setRecord).catch(() => setFailed(true));
    void fetchScorecardPicksCached().then((res) => setPicks(res.picks ?? [])).catch(() => undefined);
    void fetchInvalidationSummary().then(setInvalidation).catch(() => undefined);
  }, []);

  /**
   * "짚은 뒤 지금까지" 의 현재가 — 종목별 1회, 최대 40건 한 번에 받는다(벌크 라우트).
   * 실패하면 그 블록만 사라진다.
   */
  useEffect(() => {
    const quiet = picks.filter((p) => p.pickType === "quiet");
    if (quiet.length === 0) return;
    // 종목별 한 번만, 최대 40건. 원장의 market·country 는 느슨한 문자열이라 좁혀 담는다.
    const seen = new Set<string>();
    const items: DiscoveryPerformancePriceRequestItem[] = [];
    for (const p of quiet) {
      if (seen.has(p.canonical) || items.length >= 40) continue;
      seen.add(p.canonical);
      const item: DiscoveryPerformancePriceRequestItem = { stock: p.canonical };
      if (p.symbol) item.symbol = p.symbol;
      if (p.naverCode) item.naverCode = p.naverCode;
      // 좁은 유니온으로 단정하되 undefined 는 담지 않는다(exactOptionalPropertyTypes).
      const market = p.market as NonNullable<DiscoveryPerformancePriceRequestItem["market"]> | undefined;
      const country = p.country as NonNullable<DiscoveryPerformancePriceRequestItem["country"]> | undefined;
      if (market) item.market = market;
      if (country) item.country = country;
      items.push(item);
    }
    let alive = true;
    void fetchDiscoveryPerformancePrices(items)
      .then((res) => {
        if (!alive) return;
        const next: Record<string, number> = {};
        for (const [stock, price] of Object.entries(res.prices)) {
          if (typeof price?.currentPrice === "number") next[stock] = price.currentPrice;
        }
        setPrices(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [picks]);

  const windowResult = useMemo<TrackWindowResult | null>(
    () => record?.windows.find((item) => item.days === days) ?? null,
    [record, days]
  );
  const pending = useMemo(() => pendingScoring(picks, todayKst()), [picks]);
  const since = useMemo(() => sinceMove(picks, (canonical) => prices[canonical]), [picks, prices]);

  const overall = windowResult?.overall ?? null;
  const scored = Boolean(overall && overall.n > 0 && overall.medianReturn !== null);
  /** accent 는 한 곳 — 채점 결과가 있으면 중앙값, 없으면 현재 변동. */
  const accentOn: "median" | "since" | null = scored ? "median" : since.medianPct !== null ? "since" : null;

  const recent = useMemo(
    () => picks.filter((p) => p.pickType === "quiet").slice(0, 20),
    [picks]
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] px-gutter pb-s6 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="flex h-14 items-center">
        <a href="/" aria-label="뒤로" className="-ml-2 flex h-touch w-touch items-center justify-center text-ds-text-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M12.5 4L6.5 10l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <header>
        <h1 className="text-ds-title-lg text-ds-text-1">성적표</h1>
        <p className="mt-s1 text-ds-caption text-ds-text-2">우리가 짚은 뒤 얼마나 움직였나</p>
      </header>

      {/* ① 채점 결과 — 도래한 창만. 표본 30 미만이면 비율 대신 표본을 말한다. */}
      {scored && overall && (
        <Section title="채점 결과">
          <div className="mb-s3 inline-flex h-9 rounded-pill bg-ds-surface-1 p-[3px]" role="tablist" aria-label="채점 기간">
            {WINDOWS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={days === value}
                onClick={() => setDays(value)}
                className={`min-w-16 rounded-pill px-s3 font-mono text-ds-label ${
                  days === value ? "bg-ds-surface-2 text-ds-text-1" : "text-ds-text-3"
                }`}
              >
                {value}일
              </button>
            ))}
          </div>
          <Row
            label={`${days}일 후 중앙값`}
            value={formatSignedPct(overall.medianReturn!)}
            sample={`판단 ${overall.n.toLocaleString("ko-KR")}건`}
            accent={accentOn === "median"}
          />
          <Row
            label="상승 비율"
            value={rateOrSampleShort(overall.winRate, overall.n)}
            sample={hasEnoughSample(overall.n) ? `판단 ${overall.n.toLocaleString("ko-KR")}건` : "30건부터 비율을 내요"}
          />
          <Row label="판단 수" value={`${overall.n.toLocaleString("ko-KR")}건`} sample="상승·하락 모두 포함" />
        </Section>
      )}

      {/* ② 아직 채점 전 — 빈 화면을 고장으로 읽히지 않게 하는 자리(§1-5). */}
      {pending.pending > 0 && (
        <Section title="아직 채점 전">
          <p className="text-ds-body text-ds-text-1" data-testid="scorecard-pending-note">
            발행 후 7일이 지나야 채점이 시작돼요.
          </p>
          <div className="mt-s3">
            <Row label="채점 대기" value={`${pending.pending.toLocaleString("ko-KR")}건`} />
            {pending.firstPublishedAt && (
              <Row label="첫 판단" value={koreanDate(pending.firstPublishedAt)} />
            )}
            {pending.firstScoringAt && (
              <Row label="첫 채점 예정" value={koreanDate(pending.firstScoringAt)} />
            )}
          </div>
        </Section>
      )}

      {/* ③ 그동안 볼 수 있는 것 — **채점 결과가 아니다.** 그 구분을 문장으로 못 박는다. */}
      {since.medianPct !== null && (
        <Section title="그동안 이건 볼 수 있어요">
          <p className="text-ds-body text-ds-text-1">우리가 짚은 뒤 지금까지</p>
          <div className="mt-s3">
            <Row
              label="변동 중앙값"
              value={formatSignedPct(since.medianPct)}
              sample={`대상 ${since.n.toLocaleString("ko-KR")}곳`}
              accent={accentOn === "since"}
            />
          </div>
          <p className="mt-s3 text-ds-caption text-ds-text-3" data-testid="scorecard-since-disclaimer">
            채점 결과가 아니라 현재 시점 변동이에요. 채점은 발행 후 7·30·90일 종가로 해요.
          </p>
        </Section>
      )}

      {/* ④ 무효 조건 — **판정 불가를 분모에서 빼지 않는다.** 세 값을 그대로 센다. */}
      {invalidation && (invalidation.price.n > 0 || invalidation.business.n > 0) && (
        <Section title="무효 조건">
          <p className="text-ds-body text-ds-text-2">
            발행할 때 &ldquo;이러면 이 판단은 틀린 거예요&rdquo; 라고 미리 적어둔 선이에요.
          </p>
          <div className="mt-s3" data-testid="scorecard-invalidation">
            {/*
              **도달·미도달·판정 불가를 모두 낸다.** 판정 불가를 미도달로 합치거나 분모에서 빼면
              성적이 조용히 좋아진다(WO-SUB-07 §6-4 — 그 회귀를 테스트가 감시한다).
              DS-04 §1-2 목업은 3행이지만, 이 정직성 규칙이 요구하는 `미도달` 행을 더 둔다.
            */}
            <Row
              label="가격 무효선 도달"
              value={`${invalidation.price.reached.toLocaleString("ko-KR")}건`}
              sample={`판단 ${invalidation.price.n.toLocaleString("ko-KR")}건`}
            />
            <Row label="미도달" value={`${invalidation.price.notReached.toLocaleString("ko-KR")}건`} />
            <Row label="사업 조건 충족" value={`${invalidation.business.reached.toLocaleString("ko-KR")}건`} />
            <Row
              label="판정 불가"
              value={`${(invalidation.price.undetermined + invalidation.business.undetermined).toLocaleString("ko-KR")}건`}
              sample="분모에서 빼지 않아요"
            />
          </div>
          {Object.keys(invalidation.rulesetVersions).length > 0 && (
            <p className="mt-s3 font-mono text-ds-caption text-ds-text-3">
              규칙 버전 분포 ·{" "}
              {Object.entries(invalidation.rulesetVersions)
                .sort((a, b) => b[1] - a[1])
                .map(([version, count]) => `${version} ${count}`)
                .join(" · ")}
            </p>
          )}
        </Section>
      )}

      {/* ⑤ 짚은 픽 — 그때 뭐라 했는지 그대로. 구분선 리스트(카드 아님), 이모지 없음. */}
      {recent.length > 0 && (
        <Section title="짚은 픽 · 최신순">
          <ul>
            {recent.map((pick) => {
              const graded = pick.returns[String(days) as "7" | "30" | "90"];
              const current = prices[pick.canonical];
              const sincePct =
                typeof current === "number" && pick.priceAt > 0
                  ? ((current - pick.priceAt) / pick.priceAt) * 100
                  : null;
              return (
                <li key={`${pick.date}:${pick.canonical}`} className="border-b-hair border-ds-border">
                  <button
                    type="button"
                    onClick={() => setSelected(pick)}
                    className="tap-row flex min-h-16 w-full items-baseline justify-between gap-s3 py-s3 text-left"
                    data-testid="scorecard-pick-row"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium leading-tight text-ds-text-1">
                        {normalizeCompanyName(pick.canonical)}
                      </span>
                      <span className="mt-s1 block font-mono text-ds-caption text-ds-text-3">
                        {koreanDate(pick.date)} · 당시 {pick.priceAt.toLocaleString("en-US")}
                      </span>
                    </span>
                    {/*
                      값이 없으면 **값 줄을 만들지 않는다**(DS-05 §3 "값 없는 대시" 금지).
                      `—` 는 고장으로 읽힌다 — 상태만 한 줄로 말한다.
                    */}
                    <span className="shrink-0 text-right">
                      {(graded || sincePct !== null) && (
                        <span className="block font-mono text-ds-data text-ds-text-1">
                          {graded ? formatSignedPct(graded.returnPct) : formatSignedPct(sincePct!)}
                        </span>
                      )}
                      <span className="mt-s1 block font-mono text-ds-caption text-ds-text-3">
                        {graded ? `${days}일 채점` : sincePct !== null ? "현재 변동" : "채점 전"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* 로딩 — 아무것도 안 왔고 실패도 아니면 지표 행 스켈레톤(DS-05 §5). */}
      {!failed && !record && picks.length === 0 && <ScorecardSkeleton />}

      {failed && picks.length === 0 && (
        <Section title="성적표">
          <p className="text-ds-body text-ds-text-1">잠시 후 다시 열어주세요.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-s4 h-btn-secondary w-full rounded-pill border-hair border-ds-border text-[14px] font-medium text-ds-text-1"
          >
            다시 시도
          </button>
        </Section>
      )}

      <p className="mt-s5 border-t-hair border-ds-border pt-s4 text-ds-caption text-ds-text-3">
        이 기록은 수정·삭제되지 않아요. 발행 시점 가격과 그때의 문장을 그대로 남겨요.
        수익률은 발행가 대비 목표일 종가이고, 거래비용·세금·환율은 넣지 않아요.{" "}
        <a href="/about" className="underline">데이터 출처와 면책 보기</a>
      </p>

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

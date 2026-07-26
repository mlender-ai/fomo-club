"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyOhlcv } from "@fomo/core";
import type { QuietPick, StockBasics } from "@/lib/fomoApi";
import {
  fetchStockBasics,
  fetchStockFront,
  fetchStockInsight,
  type StockFrontResponse,
} from "@/lib/fomoApi";
import { fetchScorecardPicks, type ScorecardPick } from "@/lib/judgmentLedgerClient";
import { CompanyProfileBlock, FinanceGlanceBlock } from "@/components/KeywordDepthPage";
import { StockLogoBadge } from "@/components/StockLogoBadge";
import { displayName } from "@/components/QuietPickCard";
import { chartTokens } from "@/lib/chartTokens";

/**
 * 픽 전용 뎁스 문서 (WO-P3) — 백지 재작성. 레거시 30장 뎁스(KeywordDepthPage)에 섹션을 끼워 넣지 않는다.
 *
 * 질문 순서 5블록: ①이 매수 어떻게 읽나 ②무슨 회사 ③최근 무슨 일 ④차트 ⑤판단 기록.
 * 절대 규칙: **빈 섹션은 렌더 자체를 하지 않는다.** 데이터 부재를 고백하는 상태 문구 금지
 *   (예외는 ③의 '침묵' 한 줄 — 데이터 부재를 픽 논리로 쓰는 의도된 문장이다).
 * 모바일: 상단 sticky 헤더 + 본문 스크롤, 하단은 GNB·safe-area 만큼 여백을 줘 마지막 블록이 안 잘린다.
 */

/** 하단 여백 — GNB(≈64px) + safe-area + 여유. 마지막 블록 잘림 방지(WO-P3 §2). */
const BOTTOM_PAD = "pb-[calc(7rem+env(safe-area-inset-bottom))]";

/**
 * 블록 껍데기 — 타이포 3단 위계의 1단(제목: 작게·회색).
 * 블록 사이에 구분선 + 넉넉한 여백을 둬 "어디서 끊기는지"가 눈에 보이게 한다(WO-P5 §2).
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 border-t border-hairline-soft pt-5 first:mt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/**
 * ① 표 한 줄 — 라벨(3단 위계 3단: 작게·회색) / 값(2단: 크게·흰색).
 * accent 는 화면 전체에서 **성적 행 하나에만** 쓴다(강조 1곳 규칙, WO-P5 §2).
 */
function ReadRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <li className="flex gap-3 border-b border-hairline-soft py-2.5 last:border-b-0">
      <span className="w-[92px] shrink-0 text-[12px] leading-6 text-muted">{label}</span>
      <span
        className={`min-w-0 flex-1 leading-6 ${accent ? "text-[15px] font-semibold" : "text-sm text-whiteout"}`}
        {...(accent ? { style: { color: chartTokens.up } } : {})}
      >
        {value}
      </span>
    </li>
  );
}

/** "누가 샀나" — 주체·규모·기간(+내부자 수). 픽 payload 만으로 구성(가짜 없음). */
function whoBought(pick: QuietPick): string {
  const parts = [pick.signal.actors];
  if (typeof pick.signal.insiderCount === "number" && pick.signal.insiderCount > 0) {
    parts.push(`${pick.signal.insiderCount}명`);
  }
  parts.push(pick.signal.scale);
  const days = pick.signal.days;
  if (days > 0) parts.push(pick.signal.kind === "insider_cluster" ? `최근 ${days}일` : `${days}일째`);
  return parts.filter(Boolean).join(" · ");
}

/** "얼마나 이례적인가" — 이례성 지표(G1-A2) 중 강한 것부터 최대 2개. 없으면 undefined → 행 생략. */
function howUnusual(pick: QuietPick): string | undefined {
  const all = (pick.anomalies ?? []).filter((a) => a.text?.trim());
  if (all.length === 0) return undefined;
  // 빈도(1년 0건→N명) → 규모(시총 %·거래량 배수) 순으로 최대 2개. 나머지는 훅이 이미 말한다.
  const rank = (kind: string) => (kind === "frequency" ? 0 : kind === "scale" ? 1 : kind === "participants" ? 2 : 3);
  return [...all]
    .sort((a, b) => rank(a.kind) - rank(b.kind) || b.strength - a.strength)
    .slice(0, 2)
    .map((a) => a.text.trim())
    .join(" · ");
}

/** ① 이 매수, 어떻게 읽나 — 뎁스의 심장. 성적(P2)·이례성(A2)을 한 표로. */
function ReadingBlock({ pick }: { pick: QuietPick }) {
  const unusual = howUnusual(pick);
  const stats = pick.signalStats;
  return (
    <Section title="이 매수, 어떻게 읽나">
      <ul className="rounded-xl border border-hairline-soft bg-white/[0.02] px-3">
        <ReadRow label="누가 샀나" value={whoBought(pick)} />
        {unusual && <ReadRow label="얼마나 이례적인가" value={unusual} />}
        {stats && (
          <ReadRow
            label="이런 패턴의 성적"
            accent
            value={`${stats.headline} · ${stats.windowDays}일 중앙값 ${stats.medianReturn > 0 ? "+" : ""}${stats.medianReturn}%`}
          />
        )}
        {stats && (
          <ReadRow
            label="단, 이건 알고"
            value={`${stats.detail.split("·").pop()?.trim() ?? ""} — 아래 무효선이 그 대비책이에요`}
          />
        )}
      </ul>
      {stats && <p className="mt-1.5 text-[11px] leading-5 text-muted">{stats.sourceLabel} · {stats.method}</p>}
    </Section>
  );
}

/** ③ 최근 무슨 일 — 재료 1~3건. 없으면 '침묵'을 픽 논리로 쓴다(빈 박스 아님). */
function RecentBlock({ items, loaded }: { items: { title: string; source?: string; url?: string }[]; loaded: boolean }) {
  if (!loaded) return null; // 로딩 중엔 섹션 자체를 만들지 않는다(빈 껍데기 금지)
  return (
    <Section title="최근 무슨 일이 있었나">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.slice(0, 3).map((it, i) => (
            <li key={`${it.title}-${i}`} className="rounded-lg border border-hairline-soft bg-white/[0.02] px-3 py-2">
              {it.url ? (
                <a href={it.url} target="_blank" rel="noreferrer" className="text-sm leading-6 text-whiteout underline decoration-white/20">
                  {it.title}
                </a>
              ) : (
                <p className="text-sm leading-6 text-whiteout">{it.title}</p>
              )}
              {it.source && <p className="mt-0.5 text-[11px] text-muted">{it.source}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-whiteout">
          최근 30일 뉴스·공시가 없어요 — 그래서 이 매수가 더 눈에 띄는 거예요.
        </p>
      )}
    </Section>
  );
}

/** ④ 차트 — 종가 선 + 돈 들어온 자리 ◆ + 무효선. 캔들 없으면 섹션 생략(빈 신호 박스 금지). */
function PickChart({
  candles,
  signalDays,
  invalidation,
}: {
  candles: readonly DailyOhlcv[];
  signalDays: number;
  invalidation: number | null;
}) {
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 20) return null;

  const w = 320;
  const h = 132;
  const pad = 6;
  const values = invalidation && invalidation > 0 ? [...closes, invalidation] : closes;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (closes.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const line = closes.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const markerIdx = Math.max(0, closes.length - 1 - Math.min(signalDays, closes.length - 1));
  const invY = invalidation && invalidation > 0 ? y(invalidation) : null;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="최근 가격 흐름과 무효선">
      {invY !== null && (
        <line x1={pad} x2={w - pad} y1={invY} y2={invY} stroke="#8b8f98" strokeDasharray="4 4" strokeWidth="1" />
      )}
      {/* 라인·마커는 무채색 — 화면의 유일한 강조는 ①의 성적 수치다(WO-P5 §2). */}
      <path d={line} fill="none" stroke="#c9c9c4" strokeWidth="1.6" />
      <circle cx={x(markerIdx)} cy={y(closes[markerIdx]!)} r="3.5" fill="#c9c9c4" />
    </svg>
  );
}

/** ⑤ 판단 기록 — 이 종목의 **픽 이력만**(pickType 필터). 없으면 섹션 생략. */
function RecordBlock({ picks }: { picks: ScorecardPick[] }) {
  if (picks.length === 0) return null;
  const fmt = (r: { returnPct: number } | null | undefined) =>
    r && Number.isFinite(r.returnPct) ? `${r.returnPct > 0 ? "+" : ""}${r.returnPct.toFixed(1)}%` : "—";
  return (
    <Section title="이 종목, 우리가 짚었던 기록">
      <ul className="space-y-2">
        {picks.slice(0, 5).map((p) => (
          <li key={`${p.date}-${p.canonical}`} className="rounded-lg border border-hairline-soft bg-white/[0.02] px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-muted">{p.date}</span>
              <span className="text-[12px] text-muted">당시 {p.priceAt.toLocaleString("en-US")}</span>
            </div>
            <div className="mt-1 flex gap-3 text-sm text-whiteout">
              <span>7일 {fmt(p.returns["7"])}</span>
              <span>30일 {fmt(p.returns["30"])}</span>
              <span>90일 {fmt(p.returns["90"])}</span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function QuietPickDepth({ pick, onClose }: { pick: QuietPick; onClose: () => void }) {
  const stock = pick.subject.canonical;
  const [basics, setBasics] = useState<StockBasics | null>(null);
  const [front, setFront] = useState<StockFrontResponse | null>(null);
  const [news, setNews] = useState<{ title: string; source?: string; url?: string }[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [records, setRecords] = useState<ScorecardPick[]>([]);

  useEffect(() => {
    let alive = true;
    setBasics(null);
    setFront(null);
    setNews([]);
    setNewsLoaded(false);
    setRecords([]);

    fetchStockBasics(stock)
      .then((r) => alive && setBasics(r))
      .catch(() => alive && setBasics(null));

    fetchStockFront(stock, {
      ...(pick.subject.naverCode ? { naverCode: pick.subject.naverCode } : {}),
      ...(pick.subject.symbol ? { symbol: pick.subject.symbol } : {}),
    })
      .then((r) => alive && setFront(r))
      .catch(() => alive && setFront(null));

    fetchStockInsight(stock)
      .then((r) => {
        if (!alive) return;
        const items = (r.sources ?? [])
          .filter((s) => s.title?.trim())
          .map((s) => ({
            title: s.title.trim(),
            ...(s.source ? { source: s.source } : {}),
            ...(s.url ? { url: s.url } : {}),
          }));
        setNews(items);
      })
      .catch(() => alive && setNews([]))
      .finally(() => alive && setNewsLoaded(true));

    fetchScorecardPicks()
      .then((r) => {
        if (!alive) return;
        // 이 종목의 **픽** 기록만 — 레거시 30장 기록 혼입 금지(pickType 필터).
        setRecords((r.picks ?? []).filter((p) => p.canonical === stock && p.pickType === "quiet"));
      })
      .catch(() => alive && setRecords([]));

    return () => {
      alive = false;
    };
  }, [stock, pick.subject.naverCode, pick.subject.symbol]);

  const candles = useMemo(() => front?.candles ?? [], [front]);
  const title = displayName(pick);
  const ticker = pick.subject.country === "US" ? pick.subject.symbol : pick.subject.naverCode;

  return (
    // h-[100dvh]: iOS Safari 주소창이 뜨면 100vh 가 실제 보이는 높이보다 커져 하단이 브라우저 UI 뒤로
    // 밀린다(레거시 뎁스의 잘림 원인). dvh 로 실제 뷰포트에 맞춘다.
    <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-black pt-[env(safe-area-inset-top)]">
      {/* 상단 sticky 헤더 — 종목명(말줄임)·티커·가격. 스크롤 영역과 분리. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-5 py-3">
        <StockLogoBadge name={title} naverCode={pick.subject.naverCode} symbol={pick.subject.symbol} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-whiteout">
            {title}
            {ticker && <span className="ml-1.5 font-pixel text-xs text-muted">({ticker})</span>}
          </p>
          <p className="truncate text-[11px] text-muted">
            {pick.price.currentText ?? pick.price.current.toLocaleString("en-US")}
            {typeof pick.price.changePct === "number" &&
              ` · ${pick.price.changePct > 0 ? "+" : ""}${pick.price.changePct.toFixed(1)}%`}
            {pick.subject.identity && ` · ${pick.subject.identity}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 rounded-full border border-hairline px-3 py-1 text-xs text-muted"
        >
          닫기
        </button>
      </header>

      {/* 본문 — 단일 스크롤. 하단은 GNB·safe-area 만큼 비워 마지막 블록이 가리지 않게. */}
      <div className={`scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 pt-1 ${BOTTOM_PAD}`}>
        {/* 카드 훅 이음 — 카드에서 본 그 문장이 뎁스 첫 줄로 이어져 맥락이 끊기지 않는다(WO-P5 §2).
            타이포 3단의 2단(핵심 문장: 크게·흰색). */}
        <p className="mt-4 text-[19px] font-bold leading-7 text-whiteout">{pick.hook}</p>

        {/* ① */}
        <ReadingBlock pick={pick} />

        {/* ② 무슨 회사인가 — 데이터 없으면 두 블록 모두 스스로 null(빈 섹션 없음). */}
        {(basics?.summary || basics?.marketCap || (basics?.metrics?.length ?? 0) > 0) && (
          <Section title="무슨 회사인가">
            <CompanyProfileBlock basics={basics} />
            {/* 수치는 4줄까지 — 위계를 지키기 위해 나열을 제한한다(WO-P5 §1②). */}
            <FinanceGlanceBlock basics={basics} maxLines={4} />
          </Section>
        )}

        {/* ③ */}
        <RecentBlock items={news} loaded={newsLoaded} />

        {/* ④ 차트 — 캔들 있을 때만. 신호 판정 미달이어도 차트는 보여준다(빈 신호 박스 금지). */}
        {candles.length >= 20 && (
          <Section title="차트">
            <div className="rounded-xl border border-hairline-soft bg-white/[0.02] px-2 py-2">
              <PickChart candles={candles} signalDays={pick.signal.days} invalidation={pick.invalidation.level} />
              <p className="mt-1 px-1 text-[11px] leading-5 text-muted">
                ◆ 돈이 들어오기 시작한 자리{pick.invalidation.level ? " · 점선은 무효선" : ""}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-whiteout">{pick.invalidation.text}</p>
          </Section>
        )}

        {/* ⑤ */}
        <RecordBlock picks={records} />
      </div>
    </div>
  );
}

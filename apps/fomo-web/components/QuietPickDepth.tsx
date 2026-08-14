"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyOhlcv, WhereThisIsWrongBlock } from "@fomo/core";
import type { CardSlotPayload, QuietPick, StockBasics } from "@/lib/fomoApi";
import {
  fetchStockBasics,
  fetchStockFront,
  fetchStockInsight,
  type StockFrontResponse,
} from "@/lib/fomoApi";
import { fetchScorecardPicks, type ScorecardPick } from "@/lib/judgmentLedgerClient";
import { fetchCardSlots } from "@/lib/fomoApi";
import { CompanyProfileBlock, FinanceGlanceBlock } from "@/components/KeywordDepthPage";
import { WhereThisIsWrong } from "@/components/WhereThisIsWrong";
import { StockLogoBadge } from "@/components/StockLogoBadge";
import { displayName } from "@/components/QuietPickCard";
import { OverlayPortal } from "@/components/OverlayPortal";
import { recordPickTelemetry, flushPickTelemetry } from "@/lib/pickTelemetry";
import { pickHook, repairPickCopy } from "@/lib/pickCopyRepair";
import { chartTokens } from "@/lib/chartTokens";

/**
 * 픽 전용 뎁스 문서 (WO-P3) — 백지 재작성. 레거시 30장 뎁스(KeywordDepthPage)에 섹션을 끼워 넣지 않는다.
 *
 * ## 순서 재설계 (WO-SUB-HOOK PART 3)
 *
 * 종전 순서는 "이 매수 어떻게 읽나"가 먼저였고, 그 안의 "얼마나 이례적인가"가 **훅 문장과 글자
 * 그대로 같았다.** 헤더의 훅까지 합치면 사용자가 같은 문장을 세 번 읽었다. 그래서
 *  1. 무슨 회사인가 ← 처음 보는 회사다. 이게 먼저다
 *  2. 왜 지금인가   ← 훅에 없는 비교 정보만
 *  3. 최근 무슨 일  4. 값의 위치(재무 + 밴드 캡션 + 유형 경고문)  5. 차트
 *  6. 이게 틀리는 경우  7. 우리가 짚었던 기록
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
  const parts = [repairPickCopy(pick.signal.actors)];
  if (typeof pick.signal.insiderCount === "number" && pick.signal.insiderCount > 0) {
    parts.push(`${pick.signal.insiderCount}명`);
  }
  parts.push(repairPickCopy(pick.signal.scale));
  const days = pick.signal.days;
  if (days > 0) parts.push(pick.signal.kind === "insider_cluster" ? `최근 ${days}일` : `${days}일째`);
  return parts.filter(Boolean).join(" · ");
}

/**
 * "얼마나 드문가" — 이례성 지표(G1-A2) 중 강한 것부터 최대 2개.
 *
 * **훅이 이미 말한 것은 뺀다**(WO-SUB-HOOK 완료 조건 11). 종전에는 이 행이 훅 문장과 글자
 * 그대로 같아서 한 화면에서 같은 말을 세 번 읽게 했다. 남길 게 없으면 undefined → 행 생략.
 */
function howUnusual(pick: QuietPick): string | undefined {
  const hook = pickHook(pick);
  const all = (pick.anomalies ?? [])
    .map((a) => ({ ...a, text: repairPickCopy(a.text) }))
    .filter((a) => a.text)
    // 훅이 이미 말한 것은 뺀다. 옛 payload 는 훅이 이례성 문장 자체였으므로 여기서 많이 걸린다.
    .filter((a) => !hook.includes(a.text) && !a.text.includes(hook))
    .filter((a) => a.kind !== "participants" || !hook.includes(`${pick.signal.insiderCount ?? ""}명`));
  if (all.length === 0) return undefined;
  // 빈도(1년 0건→N명) → 규모(시총 %·거래량 배수) 순으로 최대 2개.
  const rank = (kind: string) => (kind === "frequency" ? 0 : kind === "scale" ? 1 : kind === "participants" ? 2 : 3);
  return [...all]
    .sort((a, b) => rank(a.kind) - rank(b.kind) || b.strength - a.strength)
    .slice(0, 2)
    .map((a) => a.text)
    .join(" · ");
}

/** 왜 지금인가 — 뎁스의 심장. 성적(P2)·드문 정도(A2)를 한 표로. 훅이 말한 것은 반복하지 않는다. */
function ReadingBlock({ pick }: { pick: QuietPick }) {
  const unusual = howUnusual(pick);
  const stats = pick.signalStats;
  return (
    <Section title="왜 지금인가">
      <ul className="rounded-xl border border-hairline-soft bg-white/[0.02] px-3">
        <ReadRow label="누가 샀나" value={whoBought(pick)} />
        {unusual && <ReadRow label="얼마나 드문가" value={unusual} />}
        {stats && (
          <ReadRow
            label="이런 패턴의 성적"
            accent
            value={`${repairPickCopy(stats.headline)} · ${stats.windowDays}일 중앙값 ${stats.medianReturn > 0 ? "+" : ""}${stats.medianReturn}%`}
          />
        )}
        {stats && (
          <ReadRow
            label="단, 이건 알고"
            value={`${repairPickCopy(stats.detail.split("·").pop() ?? "")} — 아래 되돌아보는 선이 그 대비책이에요`}
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

/** 차트 — 종가 선 + 사기 시작한 시점 ◆ + 되돌아보는 선. 캔들 없으면 섹션 생략(빈 신호 박스 금지). */
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
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="최근 가격 흐름과 되돌아보는 선">
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
  /**
   * 아직 채점되지 않은 지평은 **"아직"이라고 쓴다** (WO-SUB-HOOK PART 3-4).
   * `7일 — 30일 — 90일 —` 은 고장으로 읽힌다. 값이 없는 것과 값을 못 만든 것은 다르고,
   * 여기서는 전자다 — 발행한 지 얼마 안 돼 채점 전이다.
   */
  const fmt = (r: { returnPct: number } | null | undefined) =>
    r && Number.isFinite(r.returnPct) ? `${r.returnPct > 0 ? "+" : ""}${r.returnPct.toFixed(1)}%` : "아직";
  const ungraded = picks
    .slice(0, 5)
    .some((p) => !p.returns["7"] || !p.returns["30"] || !p.returns["90"]);
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
      {ungraded && (
        <p className="mt-2 text-[11px] leading-5 text-muted" data-testid="record-ungraded-note">
          발행한 지 얼마 안 돼 아직 채점 전이에요
        </p>
      )}
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
  /**
   * "이게 틀리는 경우" 블록 (WO-SUB-FILL PART 5).
   *
   * **덱 뎁스에 이 섹션이 없었다.** 06 이 만든 `WhereThisIsWrong` 은 `StockInsightView` 에만
   * 붙어 있어서 관심목록·검색·피드로 열 때만 보였다 — 정작 주 화면인 픽 카드의 "자세히" 는
   * `QuietPickDepth`(이 파일)를 열고, 여기엔 없었다. 리스크 배치가 채워져도 주 화면에는
   * 뜨지 않는 구조였다.
   *
   * `card-slots` 는 s-maxage 900 이라 반복 조회 비용이 낮다. 실패하면 이 섹션만 빠지고
   * 나머지 뎁스는 그대로다(선택 슬롯 원칙).
   */
  const [slotPayload, setSlotPayload] = useState<CardSlotPayload | null>(null);

  useEffect(() => {
    let alive = true;
    setSlotPayload(null);
    void fetchCardSlots().then((res) => {
      if (!alive) return;
      setSlotPayload(res.slots[stock] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [stock]);
  const riskBlock: WhereThisIsWrongBlock | null = slotPayload?.risk ?? null;

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

  // WO-SUB-00 §4-2 — 뎁스 스크롤 깊이. 최대 도달 비율만 남기고 닫을 때 1회 보고한다.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const maxRatio = useRef(0);
  useEffect(() => {
    maxRatio.current = 0;
    return () => {
      recordPickTelemetry({ event: "detail_scroll_depth", maxRatio: maxRatio.current });
      flushPickTelemetry();
    };
  }, [stock]);
  const onDepthScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    // 스크롤이 필요 없을 만큼 짧은 문서는 100% 로 본다(짧아서 안 내린 것을 이탈로 세지 않는다).
    const ratio = scrollable <= 8 ? 1 : (el.scrollTop + el.clientHeight) / el.scrollHeight;
    if (ratio > maxRatio.current) maxRatio.current = Math.min(1, ratio);
  };

  const candles = useMemo(() => front?.candles ?? [], [front]);
  const title = displayName(pick);
  const ticker = pick.subject.country === "US" ? pick.subject.symbol : pick.subject.naverCode;

  return (
    // h-[100dvh]: iOS Safari 주소창이 뜨면 100vh 가 실제 보이는 높이보다 커져 하단이 브라우저 UI 뒤로
    // 밀린다(레거시 뎁스의 잘림 원인). dvh 로 실제 뷰포트에 맞춘다.
    // OverlayPortal: 조상 transform 에 갇혀 하단이 잘리지 않도록 body 직속으로 띄운다.
    <OverlayPortal>
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
      <div ref={scrollRef} onScroll={onDepthScroll} className={`scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 pt-1 ${BOTTOM_PAD}`}>
        {/* 카드 훅 이음 — 카드에서 본 그 문장이 뎁스 첫 줄로 이어져 맥락이 끊기지 않는다(WO-P5 §2).
            **이 화면에서 훅이 나오는 유일한 자리다**(완료 조건 11). 아래 표는 훅이 말한 것을 반복하지 않는다. */}
        <p className="mt-4 text-[19px] font-bold leading-7 text-whiteout">{pickHook(pick)}</p>

        {/* ① 무슨 회사인가 — 처음 보는 회사다. 이게 먼저다(PART 3-2). 없으면 섹션 자체가 없다. */}
        {basics?.summary && (
          <Section title="무슨 회사인가">
            <CompanyProfileBlock basics={basics} />
          </Section>
        )}

        {/* ② 왜 지금인가 */}
        <ReadingBlock pick={pick} />

        {/* ③ */}
        <RecentBlock items={news} loaded={newsLoaded} />

        {/* ④ 값의 위치 — 수치 + 밴드 위치 캡션 + 유형 경고문(D8). 수치만 주면 정반대로 읽힌다. */}
        {(basics?.marketCap || (basics?.metrics?.length ?? 0) > 0) && (
          <Section title="값의 위치">
            {/* 수치는 4줄까지 — 위계를 지키기 위해 나열을 제한한다(WO-P5 §1②). */}
            <FinanceGlanceBlock basics={basics} maxLines={4} frame={slotPayload?.valuation_frame ?? null} />
          </Section>
        )}

        {/* ⑤ 차트 — 캔들 있을 때만. 신호 판정 미달이어도 차트는 보여준다(빈 신호 박스 금지). */}
        {candles.length >= 20 && (
          <Section title="차트">
            <div className="rounded-xl border border-hairline-soft bg-white/[0.02] px-2 py-2">
              <PickChart candles={candles} signalDays={pick.signal.days} invalidation={pick.invalidation.level} />
              <p className="mt-1 px-1 text-[11px] leading-5 text-muted">
                ◆ 사기 시작한 시점{pick.invalidation.level ? " · 점선은 되돌아보는 선" : ""}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-whiteout">{repairPickCopy(pick.invalidation.text)}</p>
          </Section>
        )}

        {/* ⑥ 이게 틀리는 경우 — 차트 바로 뒤에 둔다. 되돌아보는 선을 본 직후가 "틀릴 조건" 을
            읽을 자리다. 기록 블록 뒤로 밀면 반론이 결과 뒤에 오게 된다. */}
        {riskBlock && (
          <WhereThisIsWrong
            symbol={{
              items: riskBlock.symbol.items,
              unavailableReason: riskBlock.symbol.unavailable_reason,
              unavailableText: riskBlock.symbol.unavailable_text,
            }}
            archetype={riskBlock.archetype}
            invalidation={{
              // 가격 무효선은 픽의 것이 정본이다 — payload 로 두 번 내보내지 않는다.
              priceText: repairPickCopy(pick.invalidation.text) || null,
              businessText: riskBlock.invalidation.business_text,
              businessAbsentReason: riskBlock.invalidation.business_absent_reason,
              checkAt: riskBlock.invalidation.check_at,
              checkAtStatus: riskBlock.invalidation.check_at_status,
            }}
          />
        )}

        {/* ⑦ */}
        <RecordBlock picks={records} />
      </div>
    </div>
    </OverlayPortal>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyOhlcv } from "@fomo/core";
import { buildWhyNowRows, WHY_NOW_DISCLAIMER } from "@fomo/core";
import type { CardSlotPayload, QuietPick, StockBasics } from "@/lib/fomoApi";
import { fetchCardSlots, fetchStockBasics, fetchStockFront, type StockFrontResponse } from "@/lib/fomoApi";
import { fetchScorecardPicksCached, type ScorecardPick } from "@/lib/judgmentLedgerClient";
import { companyBlurb, depthEvidenceRows } from "@/lib/depthSections";
import { computeOurRecord, type OurRecord } from "@/lib/ourRecord";
import { trustedSector } from "@/lib/sectorTrust";
import { OverlayPortal } from "@/components/OverlayPortal";
import { CardFigure, displayName, priceText } from "@/components/QuietPickCard";
import { displayChangePct } from "@/lib/pickChange";
import { recordPickTelemetry, flushPickTelemetry } from "@/lib/pickTelemetry";
import { pickHook, repairPickCopy } from "@/lib/pickCopyRepair";
import { haptic, hapticMedium } from "@/lib/haptics";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * 상세 페이지 — DS-03(`docs/design/DS-03_DETAIL.md`). 토큰은 DS-00, 카드는 DS-01.
 *
 * ## 순서가 곧 논증이다 (DS-03 §1)
 *
 * 카드를 눌렀다는 건 **"진짜야?"** 라고 물은 것이다. 그 질문에 답하는 순서로만 배치한다.
 *
 * ```
 * ① 결론  → 무엇이 놀라운가 (카드에서 이어짐, 화면에서 1회만)
 * ② 근거  → 진짜 그런가 (숫자 + 스파크라인)
 * ③ 회사  → 뭐 하는 곳인가
 * ④ 값    → 지금 비싼가 (지표 3개 이상일 때만)
 * ⑤ 반론  → 틀리면 어떻게 아나
 * ⑥ 기록  → 이 앱은 믿을 만한가 (**유일한 accent**)
 * ```
 *
 * **6개 섹션. 이보다 늘리지 않는다.** 늘어나면 스캔이 안 되고, 스캔이 안 되면 설득이 안 된다.
 * 그래서 종전의 "최근 무슨 일이 있었나"(뉴스 3건)는 6섹션에 자리가 없어 제거했다 —
 * DS-03 §미해결에 기록해 뒀다.
 *
 * ## 박스와 accent 는 각각 하나
 *
 * 박스는 ⑥ 우리 기록에만 쓴다(②④⑤ 는 라벨-값 나열). 그래야 마지막 블록이 무겁게 읽힌다.
 * accent 도 ⑥ 의 수익률 한 곳뿐이다(DS-00 §2-1).
 *
 * ## 확보 안 된 섹션은 완전히 사라진다
 *
 * 빈 헤더를 남기지 않는다. "밴드를 계산할 수 없습니다" 아래 "밴드와 함께 보세요" 같은
 * 모순 문구도 만들지 않는다 — 밴드가 없으면 밴드 얘기를 아예 안 한다.
 */

/** 하단 여백 — DS-03 §2 (40px) + 세이프 에어리어. */
const BOTTOM_PAD = "pb-[calc(40px+env(safe-area-inset-bottom))]";

/** KST 오늘 `YYYY-MM-DD` — "오늘 첫 발행" 판정용. */
function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

/** 섹션 껍데기 — 제목은 `label` mono 12/0.06em, 아래 12px. 섹션 간 24px + 0.5px 구분선. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-s5 border-t-hair border-ds-border pt-s5">
      <h2 className="font-mono text-ds-label tracking-[0.06em] text-ds-text-2">{title}</h2>
      <div className="mt-s3">{children}</div>
    </section>
  );
}

/** 라벨-값 2열 — 라벨 고정폭 88px. 박스를 쓰지 않는다(DS-03 §5). */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-s3 py-[5px]">
      <span className="w-[88px] shrink-0 font-mono text-ds-label text-ds-text-2">{label}</span>
      <span className="min-w-0 flex-1 font-mono text-ds-data text-ds-text-1">{value}</span>
    </div>
  );
}

/**
 * ④-2 매출 막대 (DS-03 §7-2) — **금액 축을 반드시 표시한다.**
 *
 * ## 실측에서 무엇이 깨졌나 (2026-08-20, 1280px)
 *
 * - 원 단위 원시 숫자를 그대로 찍고 억을 붙여 `-3,605,533,737억` 이 나왔다 → 단위 정규화.
 * - 막대마다 값 라벨을 얹어 8개가 서로 겹쳐 뭉개졌다 → **값 라벨은 축 하나(최대값)만.**
 * - 적자 구간이 섞이면 절대값 높이로 그려 "많이 벌었다" 처럼 보였다 → **양수 3개 미만이면
 *   막대를 그리지 않는다.** 형태가 거짓말을 하는 것보다 없는 게 낫다.
 */
function formatMoney(value: number, currency: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (currency === "USD") {
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
    return `${sign}$${Math.round(abs).toLocaleString()}`;
  }
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
  if (abs >= 1e8) return `${sign}${Math.round(abs / 1e8).toLocaleString()}억`;
  return `${sign}${Math.round(abs).toLocaleString()}원`;
}

function RevenueBars({
  bars,
  label,
  currency,
}: {
  bars: NonNullable<CardSlotPayload["valuation"]>["bars"];
  label: string;
  currency: string;
}) {
  // `value: null` 은 결측이다 — 0 으로 둔갑시키지 않는다. 적자(음수)는 막대로 그리지 않는다.
  const usable = bars
    .map((b) => ({ label: b.label, value: b.value }))
    .filter((b): b is { label: string; value: number } => typeof b.value === "number" && Number.isFinite(b.value) && b.value > 0);
  if (usable.length < 3) return null;
  const max = Math.max(...usable.map((b) => b.value));

  return (
    <div className="mt-s4" data-testid="depth-bars">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-ds-label text-ds-text-2">{label}</span>
        {/* 금액 축 — 최대값 하나. 막대마다 숫자를 얹으면 서로 겹친다. */}
        <span className="font-mono text-ds-caption text-ds-text-3">최대 {formatMoney(max, currency)}</span>
      </div>
      <div className="mt-s2 flex h-16 items-end gap-s2">
        {usable.map((bar) => (
          <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-s1">
            <div className="w-full rounded-sm bg-ds-text-2" style={{ height: `${Math.max(2, (bar.value / max) * 48)}px` }} />
            <span className="truncate font-mono text-ds-caption text-ds-text-3">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 본문 스켈레톤 (DS-05 §5) — **헤더는 즉시 그린다**(카드에서 넘어온 데이터라 기다릴 게 없다).
 * 본문만 블록 4개로 채운다. 스피너를 쓰지 않는다.
 */
function DepthSkeleton() {
  return (
    <div className="mt-s4" data-testid="depth-skeleton" aria-busy>
      <div className="ds-skeleton h-8 w-4/5 rounded-block bg-ds-surface-1" />
      <div className="ds-skeleton mt-s5 h-24 w-full rounded-block bg-ds-surface-1" />
      <div className="ds-skeleton mt-s5 h-16 w-full rounded-block bg-ds-surface-1" />
      <div className="ds-skeleton mt-s5 h-16 w-full rounded-block bg-ds-surface-1" />
    </div>
  );
}

/** ⑥ 우리 기록 (DS-03 §9) — 화면의 **유일한 박스이자 유일한 accent**. */
function OurRecordBlock({ record, currency }: { record: OurRecord; currency: (v: number) => string }) {
  return (
    <Section title="우리 기록">
      <div className="flex gap-[10px] rounded-block bg-ds-surface-2 p-[14px]" data-testid="depth-our-record">
        <span className="w-[2px] shrink-0 self-stretch bg-ds-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-ds-label text-ds-text-2">{record.sinceText}</p>
          <p className="font-mono text-[20px] font-medium leading-tight text-ds-accent">
            {`${record.returnPct > 0 ? "+" : ""}${record.returnPct.toFixed(1)}%`}
          </p>

          {/* 이력 — 발행일과 당시가만. `7일 아직` 류는 채점 상태이지 성적이 아니라 넣지 않는다. */}
          {record.history.length > 0 && (
            <ul className="mt-s3 space-y-s2">
              {record.history.map((h) => (
                <li key={h.date} className="flex gap-s3 font-mono text-ds-caption">
                  <span className="text-ds-text-3">{h.date.slice(5).replace("-", "/")}</span>
                  <span className="text-ds-text-1">{currency(h.priceAt)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 채점이 **도래한** 지평만. 도래 전 지평은 행 자체가 없다. */}
          {record.graded.length > 0 && (
            <ul className="mt-s3 space-y-s2">
              {record.graded.map((g) => (
                <li key={g.horizon} className="flex gap-s3 font-mono text-ds-caption">
                  <span className="text-ds-text-3">{g.horizon}일</span>
                  <span className="text-ds-text-1">{`${g.returnPct > 0 ? "+" : ""}${g.returnPct.toFixed(1)}%`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

/** 이탈 애니메이션 시간 (DS-06 §4) — 진입 300ms 의 역방향 260ms. */
const CLOSE_MS = 260;

export function QuietPickDepth({ pick, onClose }: { pick: QuietPick; onClose: () => void }) {
  const stock = pick.subject.canonical;
  const [basics, setBasics] = useState<StockBasics | null>(null);
  const [front, setFront] = useState<StockFrontResponse | null>(null);
  const [records, setRecords] = useState<ScorecardPick[]>([]);
  const [slotPayload, setSlotPayload] = useState<CardSlotPayload | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  /** 닫히는 중 — 역방향 슬라이드가 끝난 뒤 실제로 언마운트한다. */
  const [closing, setClosing] = useState(false);
  /** 좌측 엣지 스와이프 백 진행량(px). iOS 표준 제스처(§4). */
  const [backDx, setBackDx] = useState(0);
  const backFrom = useRef<number | null>(null);
  /** 본문이 8px 넘게 스크롤됐나 — 헤더 경계선을 켠다(§5). */
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const maxRatio = useRef(0);

  useEffect(() => {
    let alive = true;
    setBasics(null);
    setFront(null);
    setRecords([]);
    setSlotPayload(null);

    fetchStockBasics(stock, {
      ...(pick.subject.naverCode ? { naverCode: pick.subject.naverCode } : {}),
      ...(pick.subject.symbol ? { symbol: pick.subject.symbol } : {}),
    })
      .then((r) => alive && setBasics(r))
      .catch(() => undefined);

    fetchStockFront(stock, {
      ...(pick.subject.naverCode ? { naverCode: pick.subject.naverCode } : {}),
      ...(pick.subject.symbol ? { symbol: pick.subject.symbol } : {}),
    })
      .then((r) => alive && setFront(r))
      .catch(() => undefined);

    // 발행 원장 — ⑥ 우리 기록의 원료. 실패하면 그 섹션만 없다.
    fetchScorecardPicksCached()
      .then((r) => alive && setRecords(r.picks ?? []))
      .catch(() => undefined);

    // 슬롯(값·리스크) — 실패하면 ④⑤ 만 빠지고 나머지는 그대로다.
    fetchCardSlots()
      .then((r) => alive && setSlotPayload(r.slots[stock] ?? null))
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [stock, pick.subject.naverCode, pick.subject.symbol]);

  // 스크롤 깊이 — 설득이 어디까지 읽히는지가 이 화면의 핵심 지표다.
  useEffect(() => {
    maxRatio.current = 0;
    return () => {
      recordPickTelemetry({ event: "detail_scroll_depth", maxRatio: Math.round(maxRatio.current * 100) / 100 });
      flushPickTelemetry();
    };
  }, [stock]);

  const dismiss = () => {
    if (closing) return;
    haptic();
    setClosing(true);
    window.setTimeout(onClose, prefersReducedMotion() ? 0 : CLOSE_MS);
  };

  /** 좌측 엣지 24px 안에서 시작한 드래그만 뒤로가기로 본다 — 본문 스크롤과 충돌하지 않게. */
  const onBackPointerDown = (e: React.PointerEvent) => {
    if (e.clientX <= 24) backFrom.current = e.clientX;
  };
  const onBackPointerMove = (e: React.PointerEvent) => {
    if (backFrom.current === null) return;
    setBackDx(Math.max(0, e.clientX - backFrom.current));
  };
  const onBackPointerUp = () => {
    if (backFrom.current === null) return;
    const traveled = backDx;
    backFrom.current = null;
    setBackDx(0);
    // 화면 폭의 25% 를 넘겨 끌면 닫는다(카드 전환과 같은 임계).
    if (traveled > window.innerWidth * 0.25) dismiss();
  };

  const onDepthScroll = () => {
    const el = scrollRef.current;
    if (el) setScrolled(el.scrollTop > 8);
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    const ratio = scrollable <= 8 ? 1 : (el.scrollTop + el.clientHeight) / el.scrollHeight;
    if (ratio > maxRatio.current) maxRatio.current = Math.min(1, ratio);
  };

  const hook = pickHook(pick);
  const rows = useMemo(() => depthEvidenceRows(pick, hook), [pick, hook]);
  const blurb = useMemo(() => companyBlurb(basics?.summary), [basics?.summary]);
  const candles = useMemo(() => front?.candles ?? [], [front]);
  const record = useMemo(
    () => computeOurRecord(records, stock, pick.price.current, todayKst()),
    [records, stock, pick.price.current]
  );

  /**
   * ④ 값 — 지표가 3개 이상일 때만 섹션이 있다(DS-03 §7). 2개 이하면 "지금 비싼가"에 답할 수
   * 없고, 답할 수 없는 섹션은 만들지 않는다.
   */
  const valueRows = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    if (basics?.marketCap) out.push({ label: "시가총액", value: basics.marketCap });
    /**
     * **화이트리스트로 받는다.** 종전에는 `basics.metrics` 를 순서대로 5개 집어서
     * `EPS -565원 · 최근 1년 최고가 · 최저가` 처럼 "지금 비싼가"에 답하지 않는 값이 올라왔다.
     * 값 섹션은 배수(PER·PBR)와 이익(EPS)까지다. 나머지는 이 화면의 질문이 아니다.
     */
    const WANTED = ["PER", "PBR", "EPS", "배당수익률"] as const;
    for (const term of WANTED) {
      const metric = (basics?.metrics ?? []).find((m) => (m.term ?? m.label) === term && m.value?.trim());
      if (metric) out.push({ label: term, value: metric.value.trim() });
    }
    return out;
  }, [basics]);

  /** 실체 한 줄 — 카드에서 내려온 "어디서 돈을 버는가". ③ 섹션에 합류한다. */
  const substance = slotPayload?.substance?.text ?? null;


  const valuation = slotPayload?.valuation ?? null;
  /** 밴드가 **있을 때만** 밴드 얘기를 한다 — 없다고 말한 뒤 보라고 하지 않는다(§7 결함). */
  const band = valuation?.band ?? null;
  const bandCaptions = band ? (slotPayload?.valuation_frame?.captions ?? valuation?.captions ?? []) : [];
  const archetypeWarning = band ? (slotPayload?.valuation_frame?.warning ?? valuation?.warning ?? null) : null;

  /**
   * ① 왜 지금 사는가 (WO-HOOK-02 §2) — **이 배치의 핵심.** 새 수집이 아니라 재편성이다.
   * 화면 곳곳에 흩어져 있던 재료(밴드·EPS·52주 위치·신호 과거 성적)를 한 질문 아래 모은다.
   * 2축 미만이면 `buildWhyNowRows` 가 빈 배열을 주고, 그러면 섹션 자체를 그리지 않는다.
   */
  const bandLabel = slotPayload?.valuation_frame?.band_label ?? null;
  const whyNowRows = useMemo(() => {
    const eps = (basics?.metrics ?? []).find((m) => (m.term ?? m.label) === "EPS")?.value;
    const epsNumber = eps ? Number.parseFloat(eps.replace(/[^\d.-]/g, "")) : undefined;
    return buildWhyNowRows({
      ...(band && bandLabel
        ? {
            band: {
              label: bandLabel,
              current: band.current,
              percentile: band.current_percentile,
              sufficient: band.sufficient,
            },
          }
        : {}),
      ...(typeof epsNumber === "number" && Number.isFinite(epsNumber) ? { eps: epsNumber } : {}),
      ...(typeof pick.signalFacts?.pctAboveYearLow === "number"
        ? { pctAboveYearLow: pick.signalFacts.pctAboveYearLow }
        : {}),
      ...(pick.signalStats
        ? { signalStats: { n: pick.signalStats.n, up: pick.signalStats.up, winRate: pick.signalStats.winRate } }
        : {}),
    });
  }, [band, bandLabel, basics, pick.signalFacts?.pctAboveYearLow, pick.signalStats]);

  const risk = slotPayload?.risk ?? null;
  const invalidationText = repairPickCopy(pick.invalidation.text) || risk?.invalidation.price_text || null;
  const businessText = risk?.invalidation.business_text ?? null;
  const symbolRisks = risk?.symbol.items ?? [];
  /** 유형 리스크는 최대 2개 — 3개면 종목과 무관한 템플릿 노이즈로 읽힌다(§8). */
  const archetypeRisks = (risk?.archetype.items ?? []).slice(0, 2);
  const hasWrongSection = Boolean(invalidationText || businessText || symbolRisks.length > 0 || archetypeRisks.length > 0);

  // 통화 기호 포맷은 카드와 **같은 함수**를 쓴다 — 한쪽만 고치면 화면이 갈린다(실측: 상세 `4.945`).
  /** 섹터 신뢰 게이트 — 헤더 부제에도 같은 규칙을 쓴다(DS-05 §4). */
  const sector = trustedSector(pick.subject.identity);
  const price = priceText(pick);
  const changePct = displayChangePct(pick.price.changePct);
  const money = (v: number) =>
    pick.subject.country === "US" ? `$${v.toFixed(2)}` : `${Math.round(v).toLocaleString("en-US")}원`;


  return (
    <OverlayPortal>
      {/*
        진입 = 하단에서 위로 300ms, 이탈 = 역방향 260ms, 좌측 엣지 드래그를 따라 밀린다(§4).
        모션 감소면 애니메이션이 0이 된다(globals.css).
      */}
      <div
        className={`fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-ds-bg pt-[env(safe-area-inset-top)] ${closing ? "" : "ds-sheet-up"}`}
        style={{
          transform: closing ? "translateY(100%)" : backDx > 0 ? `translateX(${backDx}px)` : undefined,
          transition: closing
            ? `transform ${CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
            : backFrom.current === null
              ? "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)"
              : "none",
        }}
        onPointerDown={onBackPointerDown}
        onPointerMove={onBackPointerMove}
        onPointerUp={onBackPointerUp}
        onPointerCancel={onBackPointerUp}
      >
        {/* 고정 헤더 (DS-03 §3) — 좌측 뒤로 화살표. `닫기` 텍스트 버튼을 대체한다. */}
        {/*
          헤더·본문 모두 `max-w-xl` 중앙 정렬이다. 이걸 안 걸어 데스크톱에서 라벨과 값이
          화면 양끝으로 벌어졌다(실측 1280px). 모바일 스펙을 그대로 두고 웹은 중앙에 세운다.
        */}
        <header
          className={`ds-header-line shrink-0 border-b-hair ${scrolled ? "border-ds-border" : "border-transparent"}`}
          data-testid="depth-header"
        >
          <div className="mx-auto flex h-14 w-full max-w-[480px] items-center gap-s2 px-gutter">
          <button
            type="button"
            onClick={dismiss}
            aria-label="뒤로"
            className="tap-button -ml-2 flex h-touch w-touch shrink-0 items-center justify-center text-ds-text-2"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M12.5 4L6.5 10l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium leading-tight text-ds-text-1">{displayName(pick)}</p>
            <p className="truncate font-mono text-ds-caption text-ds-text-3">
              {[pick.subject.ticker ?? pick.subject.symbol ?? pick.subject.naverCode, sector]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-ds-data text-ds-text-1">{price}</p>
            {typeof changePct === "number" && (
              <p className={`font-mono text-ds-caption ${changePct < 0 ? "text-ds-down" : "text-ds-text-1"}`}>
                {`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`}
              </p>
            )}
          </div>
          {/*
            관심(별)을 제거했다 — WO-RESET-01 A-3. 「내 기록」 화면이 없어졌으므로 등록해도
            볼 곳이 없다. `watchlist` 모듈은 지우지 않는다(되살릴 수 있게).
          */}
          </div>
        </header>

        <div
          ref={scrollRef}
          onScroll={onDepthScroll}
          className={`scrollbar-none min-h-0 flex-1 overflow-y-auto ${BOTTOM_PAD}`}
        >
          <div className="mx-auto w-full max-w-[480px] px-gutter">
          {/* ① 결론 — 카드와 같은 문장. **이 화면에서 1회만** 나온다(섹션 제목 없음). */}
          <p className="mt-s4 break-keep text-ds-display-sm text-ds-text-1" data-testid="depth-hook">
            {hook}
          </p>

          {/*
            재등장 사유 — 섹션이 아니라 결론에 붙는 한 줄이다(6섹션 규칙을 지키면서 DS-01 §8
            의 이관 판정을 유지한다). 같은 카드를 또 본 사람에게 가장 먼저 답할 질문이다.
          */}
          {pick.signal.reentry?.text && (
            <p className="mt-s2 text-ds-caption text-ds-text-2" data-testid="depth-reentry">
              다시 올라온 이유 — {repairPickCopy(pick.signal.reentry.text)}
            </p>
          )}

          {/*
            본문이 아직 하나도 안 왔다 — 결론만 있고 나머지가 빈 순간을 스켈레톤으로 덮는다.
            근거 행은 픽 페이로드로 즉시 만들 수 있으므로, 그것마저 없을 때만 해당한다.
          */}
          {rows.length === 0 && !basics && !front && !slotPayload && <DepthSkeleton />}

          {/*
            ① 왜 지금 사는가 — **상세의 첫 섹션**(§2-1). 상세가 답해야 하는 질문은 하나다:
            왜 조용히 사고 있는가. 2축 미만이면 `whyNowRows` 가 비고 섹션이 통째로 사라진다.
          */}
          {whyNowRows.length > 0 && (
            <Section title="왜 지금 사는가">
              <div data-testid="depth-why-now">
                {whyNowRows.map((row) => (
                  <div key={row.axis} className="flex gap-s3 py-[6px]">
                    {/* 라벨 고정폭 56px — 값의 왼쪽 끝이 줄마다 흔들리면 표가 아니라 목록이 된다. */}
                    <span className="w-[56px] shrink-0 font-mono text-ds-label text-ds-text-2">{row.axis}</span>
                    <span className="min-w-0 flex-1 break-keep text-ds-body text-ds-text-1">{row.text}</span>
                  </div>
                ))}
              </div>
              {/*
                꼬리표 — 이 섹션이 인과가 아니라 **동시 관측**임을 화면에 적는다(§2-3).
                우리는 매수 주체의 의도를 모른다. 문안은 fomo-core 가 갖는다(화면이 카피를 짓지 않는다).
              */}
              <p className="mt-s3 text-ds-caption text-ds-text-3" data-testid="depth-why-now-note">
                {WHY_NOW_DISCLAIMER}
              </p>
            </Section>
          )}

          {/* ② 근거 — 최대 2줄. 앞면 훅이 말한 것은 여기서 반복하지 않는다(§3). */}
          {rows.length > 0 && (
            <Section title="근거">
              <div data-testid="depth-evidence">
                {rows.map((row) => (
                  <Row key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
              {/*
                카드가 보여준 그림을 **그대로** 다시 그린다(2026-08-24).

                규칙: **상세는 카드보다 증거가 적으면 안 된다.** 종전에는 A형 카드에서
                「주가 / 외국인 매수 누적」 두 선의 갭을 보고 들어온 사용자가 여기서
                회색 주가선 하나만 만났다 — 확인하러 온 자리에서 확인할 대상이 사라졌다.

                같은 컴포넌트를 쓰므로 두 화면이 갈릴 수 없다. 형이 없는 구 페이로드면
                그리지 않는다(지어내지 않는다).
              */}
              {pick.cardType && (
                <div className="mt-s4" data-testid="depth-signal-figure">
                  <CardFigure cardType={pick.cardType} invalidation={pick.invalidation.level} />
                </div>
              )}
            </Section>
          )}

          {/* ③ 무슨 회사 — 첫 문장이 무엇을 파는가. 못 만들면 섹션 전체가 없다. */}
          {(blurb || substance) && (
            <Section title="무슨 회사">
              {/* 벤더 요약이 등기 정보뿐이면 blurb 가 null 이다 — 그때는 실체 한 줄이 이 섹션을 채운다. */}
              <p className="text-ds-body text-ds-text-1" data-testid="depth-company">
                {blurb?.text ?? substance}
              </p>
              {blurb && substance && (
                <p className="mt-s2 text-ds-body text-ds-text-2" data-testid="depth-substance">
                  {substance}
                </p>
              )}
              {blurb?.truncated && basics?.summary && (
                <>
                  <button
                    type="button"
                    onClick={() => setSourceOpen((v) => !v)}
                    className="mt-s2 text-ds-caption text-ds-text-3 underline"
                    data-testid="depth-company-source"
                  >
                    출처 보기
                  </button>
                  {sourceOpen && <p className="mt-s2 text-ds-caption text-ds-text-2">{basics.summary}</p>}
                </>
              )}
            </Section>
          )}

          {/* ④ 값 — 지표 3개 이상일 때만. 밴드가 없으면 밴드 얘기를 하지 않는다. */}
          {valueRows.length >= 3 && (
            <Section title="값">
              <div data-testid="depth-value">
                {valueRows.map((row) => (
                  <Row key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
              {bandCaptions.length > 0 && (
                <p className="mt-s2 text-ds-caption text-ds-text-2" data-testid="depth-band">
                  {bandCaptions[0]}
                </p>
              )}
              {archetypeWarning && (
                <p className="mt-s3 text-ds-caption text-ds-text-2" data-testid="depth-archetype-warning">
                  {archetypeWarning}
                </p>
              )}
              {valuation?.bars && (
                <RevenueBars bars={valuation.bars} label={valuation.bar_label ?? "매출"} currency={valuation.currency} />
              )}
            </Section>
          )}

          {/* ⑤ 틀리는 경우 */}
          {hasWrongSection && (
            <Section title="틀리는 경우">
              <div data-testid="depth-wrong">
                {invalidationText && <Row label="가격" value={invalidationText} />}
                {businessText && <Row label="사업" value={businessText} />}
                {risk?.invalidation.check_at && <Row label="확인 예정" value={risk.invalidation.check_at} />}
              </div>

              {/* 종목 고유 리스크가 있으면 유형 리스크 **위**에 온다(§8). */}
              {symbolRisks.length > 0 && (
                <ul className="mt-s3 space-y-s2" data-testid="depth-symbol-risk">
                  {symbolRisks.slice(0, 2).map((item) => (
                    <li key={item.id} className="text-ds-body text-ds-text-1">
                      · {item.text}
                    </li>
                  ))}
                </ul>
              )}
              {/*
                미확보 문안은 **데이터에서 온다**(`unavailable_text`) — 화면이 카피를 하드코딩하면
                사유별 문안이 하나로 뭉개진다. 값이 없을 때만 DS-03 §8 의 기본 문장을 쓴다.
              */}
              {symbolRisks.length === 0 && risk?.symbol.unavailable_reason && (
                <p className="mt-s3 text-ds-caption text-ds-text-3" data-testid="depth-symbol-risk-unavailable">
                  {risk.symbol.unavailable_text || "이 종목만의 리스크는 아직 못 찾았어요"}
                </p>
              )}

              {archetypeRisks.length > 0 && (
                <>
                  <p className="mt-s4 font-mono text-ds-label tracking-[0.06em] text-ds-text-2">이 유형에 흔한 것</p>
                  <ul className="mt-s2 space-y-s2" data-testid="depth-archetype-risk">
                    {archetypeRisks.map((item) => (
                      <li key={item.id} className="text-ds-body text-ds-text-2">
                        · {item.text}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-s2 text-ds-caption text-ds-text-3">{risk?.archetype.disclaimer}</p>
                </>
              )}
            </Section>
          )}

          {/* ⑥ 우리 기록 — 오늘 첫 발행이면 섹션 자체가 없다. */}
          {record && <OurRecordBlock record={record} currency={money} />}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

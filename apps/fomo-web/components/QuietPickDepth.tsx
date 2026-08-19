"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyOhlcv } from "@fomo/core";
import type { CardSlotPayload, QuietPick, StockBasics } from "@/lib/fomoApi";
import { fetchCardSlots, fetchStockBasics, fetchStockFront, type StockFrontResponse } from "@/lib/fomoApi";
import { fetchScorecardPicks, type ScorecardPick } from "@/lib/judgmentLedgerClient";
import { companyBlurb, evidenceRows } from "@/lib/depthSections";
import { computeOurRecord, type OurRecord } from "@/lib/ourRecord";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { OverlayPortal } from "@/components/OverlayPortal";
import { displayName } from "@/components/QuietPickCard";
import { StarIcon } from "@/components/icons";
import { recordPickTelemetry, flushPickTelemetry } from "@/lib/pickTelemetry";
import { pickHook, repairPickCopy } from "@/lib/pickCopyRepair";

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
    <section className="mt-s5 border-t-hairline border-ds-border pt-s5">
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
 * ②-1 스파크라인 (DS-03 §5-1) — 88px, 회색 선, 신호 시작 4px 원, 무효선 수평 점선.
 * 캔들이 20개 미만이면 그리지 않는다.
 */
function DepthChart({
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
  const h = 88;
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
    <div className="mt-s4" data-testid="depth-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" height={h} role="img" aria-label="최근 가격 흐름과 되돌아보는 선">
        {invY !== null && (
          <line x1={pad} x2={w - pad} y1={invY} y2={invY} stroke="#5A5A57" strokeDasharray="4 4" strokeWidth="0.5" />
        )}
        <path d={line} fill="none" stroke="#9A9A96" strokeWidth="1.5" />
        <circle cx={x(markerIdx)} cy={y(closes[markerIdx]!)} r="4" fill="#FFFFFF" />
      </svg>
      {invY !== null && <p className="mt-s1 text-ds-caption text-ds-text-3">점선은 되돌아보는 선</p>}
    </div>
  );
}

/** ④-2 매출 막대 (DS-03 §7-2) — 3포인트 이상일 때만. **금액 축을 반드시 표시한다.** */
function RevenueBars({
  bars,
  label,
  currency,
}: {
  bars: NonNullable<CardSlotPayload["valuation"]>["bars"];
  label: string;
  currency: string;
}) {
  // `value: null` 은 결측이다 — 0 으로 둔갑시키지 않고 막대를 만들지 않는다.
  const usable = bars
    .map((b) => ({ label: b.label, value: b.value }))
    .filter((b): b is { label: string; value: number } => typeof b.value === "number" && Number.isFinite(b.value));
  if (usable.length < 3) return null;
  const max = Math.max(...usable.map((b) => Math.abs(b.value))) || 1;
  const unit = currency === "USD" ? "$" : "억";
  const fmt = (v: number) => (currency === "USD" ? `${unit}${Math.round(v).toLocaleString()}` : `${Math.round(v).toLocaleString()}${unit}`);

  return (
    <div className="mt-s4" data-testid="depth-bars">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-ds-label text-ds-text-2">{label}</span>
        {/* 금액 축 — 최대값을 밝힌다. 숫자 없는 막대는 아무 의미가 없다(§7-2). */}
        <span className="font-mono text-ds-caption text-ds-text-3">최대 {fmt(max)}</span>
      </div>
      <div className="mt-s2 flex h-16 items-end gap-s2">
        {usable.map((bar) => (
          <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-s1">
            <span className="font-mono text-ds-caption text-ds-text-3">{fmt(bar.value)}</span>
            <div className="w-full rounded-sm bg-ds-text-2" style={{ height: `${Math.max(2, (Math.abs(bar.value) / max) * 40)}px` }} />
            <span className="font-mono text-ds-caption text-ds-text-3">{bar.label}</span>
          </div>
        ))}
      </div>
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

export function QuietPickDepth({ pick, onClose }: { pick: QuietPick; onClose: () => void }) {
  const stock = pick.subject.canonical;
  const [basics, setBasics] = useState<StockBasics | null>(null);
  const [front, setFront] = useState<StockFrontResponse | null>(null);
  const [records, setRecords] = useState<ScorecardPick[]>([]);
  const [slotPayload, setSlotPayload] = useState<CardSlotPayload | null>(null);
  const [watched, setWatched] = useState(() => isWatched(stock));
  const [sourceOpen, setSourceOpen] = useState(false);
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
    fetchScorecardPicks()
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

  const onDepthScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    const ratio = scrollable <= 8 ? 1 : (el.scrollTop + el.clientHeight) / el.scrollHeight;
    if (ratio > maxRatio.current) maxRatio.current = Math.min(1, ratio);
  };

  const hook = pickHook(pick);
  const rows = useMemo(() => evidenceRows(pick), [pick]);
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
    for (const metric of basics?.metrics ?? []) {
      if (!metric.value?.trim()) continue;
      out.push({ label: metric.term ?? metric.label, value: metric.value });
      if (out.length >= 5) break;
    }
    return out;
  }, [basics]);

  /** 실체 한 줄 — 카드에서 내려온 "어디서 돈을 버는가"(DS-01 §4). ③ 섹션에 합류한다. */
  const substance = slotPayload?.substance?.text ?? null;

  const valuation = slotPayload?.valuation ?? null;
  /** 밴드가 **있을 때만** 밴드 얘기를 한다 — 없다고 말한 뒤 보라고 하지 않는다(§7 결함). */
  const band = valuation?.band ?? null;
  const bandCaptions = band ? (slotPayload?.valuation_frame?.captions ?? valuation?.captions ?? []) : [];
  const archetypeWarning = band ? (slotPayload?.valuation_frame?.warning ?? valuation?.warning ?? null) : null;

  const risk = slotPayload?.risk ?? null;
  const invalidationText = repairPickCopy(pick.invalidation.text) || risk?.invalidation.price_text || null;
  const businessText = risk?.invalidation.business_text ?? null;
  const symbolRisks = risk?.symbol.items ?? [];
  /** 유형 리스크는 최대 2개 — 3개면 종목과 무관한 템플릿 노이즈로 읽힌다(§8). */
  const archetypeRisks = (risk?.archetype.items ?? []).slice(0, 2);
  const hasWrongSection = Boolean(invalidationText || businessText || symbolRisks.length > 0 || archetypeRisks.length > 0);

  const priceText = pick.price.currentText ?? pick.price.current.toLocaleString("en-US");
  const changePct = pick.price.changePct;
  const money = (v: number) =>
    pick.subject.country === "US" ? `$${v.toFixed(2)}` : `${Math.round(v).toLocaleString("en-US")}원`;

  const toggle = () => {
    const now = toggleWatch(stock, Date.now(), {
      ...(pick.subject.identity ? { sector: pick.subject.identity } : {}),
      reason: hook,
    });
    setWatched(now);
    if (now) recordPickTelemetry({ event: "card_watchlist_add" });
  };

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-ds-bg pt-[env(safe-area-inset-top)]">
        {/* 고정 헤더 (DS-03 §3) — 좌측 뒤로 화살표. `닫기` 텍스트 버튼을 대체한다. */}
        <header
          className="flex h-14 shrink-0 items-center gap-s2 border-b-hairline border-ds-border px-gutter"
          data-testid="depth-header"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="뒤로"
            className="-ml-2 flex h-touch w-touch shrink-0 items-center justify-center text-ds-text-2"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M12.5 4L6.5 10l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium leading-tight text-ds-text-1">{displayName(pick)}</p>
            <p className="truncate font-mono text-ds-caption text-ds-text-3">
              {[pick.subject.ticker ?? pick.subject.symbol ?? pick.subject.naverCode, pick.subject.identity]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-ds-data text-ds-text-1">{priceText}</p>
            {typeof changePct === "number" && (
              <p className={`font-mono text-ds-caption ${changePct < 0 ? "text-ds-down" : "text-ds-text-1"}`}>
                {`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`}
              </p>
            )}
          </div>
          {/* 관심은 헤더 우측 별 — 상세에 하단 CTA 를 두지 않는다(§10). */}
          <button
            type="button"
            onClick={toggle}
            aria-pressed={watched}
            aria-label={watched ? "관심 해제" : "관심"}
            className="-mr-2 flex h-touch w-touch shrink-0 items-center justify-center"
          >
            <StarIcon size={16} className={watched ? "text-ds-text-1" : "text-ds-text-3"} />
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={onDepthScroll}
          className={`scrollbar-none min-h-0 flex-1 overflow-y-auto px-gutter ${BOTTOM_PAD}`}
        >
          {/* ① 결론 — 카드와 같은 문장. **이 화면에서 1회만** 나온다(섹션 제목 없음). */}
          <p className="mt-s4 text-ds-display-sm text-ds-text-1" data-testid="depth-hook">
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

          {/* ② 근거 */}
          {rows.length > 0 && (
            <Section title="근거">
              <div data-testid="depth-evidence">
                {rows.map((row) => (
                  <Row key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
              <DepthChart candles={candles} signalDays={pick.signal.days} invalidation={pick.invalidation.level} />
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
    </OverlayPortal>
  );
}

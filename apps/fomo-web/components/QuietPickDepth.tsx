"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyOhlcv } from "@fomo/core";
import { whyNowStateEvents, WHY_NOW_TIMELINE_DISCLAIMER } from "@fomo/core";
import type { CardSlotPayload, QuietPick, StockBasics } from "@/lib/fomoApi";
import { fetchCardSlots, fetchStockBasics, fetchStockFront, type StockFrontResponse } from "@/lib/fomoApi";
import { companyBlurb, depthEvidenceRows } from "@/lib/depthSections";
import { trustedSector } from "@/lib/sectorTrust";
import { OverlayPortal } from "@/components/OverlayPortal";
import { CardFigure, displayName, priceText } from "@/components/QuietPickCard";
import { displayChangePct } from "@/lib/pickChange";
import { recordPickTelemetry, flushPickTelemetry } from "@/lib/pickTelemetry";
import { pickHook, repairPickCopy } from "@/lib/pickCopyRepair";
import { haptic, hapticMedium } from "@/lib/haptics";
import { upsertWatch } from "@/lib/watchlist";
import { StepDots, StepNext, CompanyGroupBlock } from "@/components/DepthSteps";

/** 걸음 식별자. 순서가 곧 이야기 순서다 — 놀라움 → 이유 → 실체 → 결정. */
type StepId = "signal" | "why" | "company" | "decide";

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

/** 이탈 애니메이션 시간 (DS-06 §4) — 진입 300ms 의 역방향 260ms. */
const CLOSE_MS = 260;

export function QuietPickDepth({ pick, onClose }: { pick: QuietPick; onClose: () => void }) {
  const stock = pick.subject.canonical;
  const [basics, setBasics] = useState<StockBasics | null>(null);
  const [front, setFront] = useState<StockFrontResponse | null>(null);
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

  /**
   * **카드와 같은 결론을 쓴다.** 카드는 `cardType.hook` 을 먼저 보는데 상세만 `pickHook` 을
   * 보고 있었다 — 그래서 D·E형에서 카드는 「시장은 빠지는데 이것만 버티고 있어요」, 상세는
   * 「가 조용히 4일째 매수 중」이 떴다(2026-08-26 프로덕션, 15장 중 8장). 한 종목의 두 화면이
   * 서로 다른 말을 하면 어느 쪽도 못 믿는다.
   */
  const hook = pick.cardType?.hook ?? pickHook(pick);

  /**
   * WO-RESET-05 §1 — **네 걸음**. 이야기 순서다: 놀라움 → 이유 → 실체 → 결정.
   *
   * ## 빈 걸음을 만들지 않는다 (§6)
   *
   * 2·3걸음은 데이터가 있을 때만 존재한다. 없으면 목록에서 빠지고 **진행 점도 그만큼 줄어든다.**
   * "왜 지금인가" 제목만 있고 아래가 비어 있는 화면은 답하는 시늉이라 아예 만들지 않는다.
   */
  const steps = useMemo<StepId[]>(() => {
    const out: StepId[] = ["signal"];
    if ((pick.whyNow?.length ?? 0) > 0) out.push("why");
    if ((pick.companyRead?.length ?? 0) > 0) out.push("company");
    out.push("decide");
    return out;
  }, [pick.whyNow, pick.companyRead]);

  const [stepIndex, setStepIndex] = useState(0);
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  /** 걸음이 줄어드는 페이로드로 바뀌었을 때 범위를 벗어나지 않게. */
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index]!;

  const goNext = () => {
    if (index >= steps.length - 1) return;
    haptic();
    setOpenMethod(null);
    setStepIndex(index + 1);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const goPrev = () => {
    if (index <= 0) return;
    haptic();
    setOpenMethod(null);
    setStepIndex(index - 1);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const toggleMethod = (title: string) => setOpenMethod((v) => (v === title ? null : title));

  /**
   * 뒤로 — **이전 걸음**이다. 1걸음에서만 카드로 돌아간다(§1-1).
   * 헤더 화살표와 가장자리 스와이프가 같은 것을 한다.
   */
  const back = () => (index > 0 ? goPrev() : dismiss());

  /**
   * 좌우 스와이프로 걸음을 넘긴다(§1-1). 세로 스크롤과 겨루지 않도록 **가로 이동이
   * 세로보다 확실히 클 때만** 걸음으로 친다.
   */
  const stepFrom = useRef<{ x: number; y: number } | null>(null);
  const onStepPointerDown = (e: React.PointerEvent) => {
    stepFrom.current = { x: e.clientX, y: e.clientY };
  };
  const onStepPointerUp = (e: React.PointerEvent) => {
    const from = stepFrom.current;
    stepFrom.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  /** 3걸음 재료 — 굽는 시점에 굳은 세 덩어리. 없으면 걸음 자체가 없다. */
  const companyGroups = pick.companyRead ?? [];

  /**
   * 1걸음이 더하는 **새 정보 한 줄** — 얼마나 이례적인가(§2).
   *
   * 카드가 이미 말한 것을 다시 쓰지 않는다. 이례성 문장 중 훅·칩에 없는 것 하나만 고른다.
   * 없으면 줄이 없다 — 채우려고 아무 말이나 넣지 않는다.
   */
  const rarityLine = useMemo(() => {
    const said = `${hook} ${(pick.chips ?? []).join(" ")}`;
    const fresh = (pick.anomalies ?? []).find((a) => a.text?.trim() && !said.includes(a.text.trim()));
    return fresh?.text?.trim() ?? null;
  }, [pick.anomalies, pick.chips, hook]);

  /**
   * 4걸음 요약 — 앞 걸음들의 **핵심만** 두세 줄(§5).
   *
   * 지어내지 않는다. 각 줄은 앞 걸음이 실제로 보여준 것에서만 온다 —
   * 그 걸음을 건너뛰었으면 그 줄도 없다.
   */
  const summaryLines = useMemo(() => {
    const out: string[] = [hook.replace(/\n/g, " ")];
    const disclosureCount = (pick.whyNow ?? []).filter((e) => e.url).length;
    if (disclosureCount > 0) out.push(`공시가 ${disclosureCount}건 있었어요`);
    else if (pick.whyNowQuietNote) out.push(pick.whyNowQuietNote);
    for (const g of companyGroups) if (g.scoreText) out.push(g.scoreText);
    return out.slice(0, 4);
  }, [hook, pick.whyNow, pick.whyNowQuietNote, companyGroups]);

  /**
   * 즐겨찾기 — **담는 것까지만**이다(WO 하지 말 것: 목록 화면 만들지 않는다).
   * 기준가를 함께 저장한다 — 나중에 "얼마나 움직였는지" 를 재려면 누른 순간의 값이 있어야 한다.
   */
  const onWatch = () => {
    hapticMedium();
    upsertWatch(pick.subject.canonical, Date.now(), {
      sector,
      priceAt: pick.price.current,
      symbol: pick.subject.symbol,
      naverCode: pick.subject.naverCode,
      market: pick.subject.market,
      country: pick.subject.country,
    });
    setWatched(true);
  };

  /** 다음 걸음이 **무엇인지** 말한다 — `다음`이 아니라 그 걸음의 이름이다(§2·§3·§4). */
  const nextLabel = (() => {
    const next = steps[index + 1];
    if (next === "why") return "왜 사는지 보기";
    if (next === "company") return "어떤 회사인지 보기";
    if (next === "decide") return "계속 지켜볼까요";
    return "계속";
  })();
  const rows = useMemo(() => depthEvidenceRows(pick, hook), [pick, hook]);
  const blurb = useMemo(() => companyBlurb(basics?.summary), [basics?.summary]);
  const candles = useMemo(() => front?.candles ?? [], [front]);
  /**
   * 「우리 기록」 블록을 화면에서 뺀 지 오래다(WO-RESET-02 PART D). 여기서 계산도 안 한다 —
   * **원장 적재와 `computeOurRecord` 는 그대로 둔다.** 화면만 뺀 것이라 되살릴 수 있다.
   */

  /**
   * ④ 값 — 지표가 3개 이상일 때만 섹션이 있다(DS-03 §7). 2개 이하면 "지금 비싼가"에 답할 수
   * 없고, 답할 수 없는 섹션은 만들지 않는다.
   */
  /**
   * 종전 「값」 섹션(`시가총액 / PER / PBR / EPS`)을 지웠다 — WO-RESET-05 §4-1.
   * **숫자만 있고 좋은지 나쁜지가 없었다.** 이제 3걸음이 비교 문장과 함께 낸다
   * (`pick.companyRead`, 굽는 시점에 굳는다).
   */

  /** 실체 한 줄 — 카드에서 내려온 "어디서 돈을 버는가". ③ 섹션에 합류한다. */
  const substance = slotPayload?.substance?.text ?? null;


  const valuation = slotPayload?.valuation ?? null;
  /** 밴드가 **있을 때만** 밴드 얘기를 한다 — 없다고 말한 뒤 보라고 하지 않는다(§7 결함). */
  const band = valuation?.band ?? null;

  /**
   * ① 왜 지금 사는가 (WO-RESET-02 PART C) — **날짜와 사건**이다.
   *
   * 날짜 붙은 항목은 **굽는 시점**에 굳어 페이로드로 온다(`pick.whyNow`) — 공시를 화면에서
   * 가져오지 않는다(A-3). 값·가격 상태는 밴드가 이 화면에만 있으므로 여기서 뒤에 붙인다.
   *
   * **날짜 항목이 하나도 없으면 상태 줄도 붙이지 않는다**(§C-3) — `지금 PBR 0.36배` 만 있는
   * 것은 근거가 아니라 답하는 시늉이다. 그때는 섹션 자체가 사라진다.
   */
  const bandLabel = slotPayload?.valuation_frame?.band_label ?? null;
  const whyNowEvents = useMemo(() => {
    const dated = pick.whyNow ?? [];
    if (dated.length === 0) return [];
    const state = whyNowStateEvents({
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
      ...(typeof pick.signalFacts?.pctAboveYearLow === "number"
        ? { pctAboveYearLow: pick.signalFacts.pctAboveYearLow }
        : {}),
    });
    return [...dated, ...state];
  }, [band, bandLabel, pick.whyNow, pick.signalFacts?.pctAboveYearLow]);

  const risk = slotPayload?.risk ?? null;
  /**
   * WO-RESET-05 §0-2 — 「틀리는 경우」를 상세에서 뺐다.
   *
   * `52주 저점 63,000원 이탈 여부가 다음 판단 기준이에요` 가 **모든 종목에 똑같이** 나왔고,
   * 그걸 보고 사용자가 할 수 있는 것이 없었다. 계산도 렌더도 지운다 —
   * **데이터(`/risk` 응답·`pick.invalidation`)는 그대로 둔다.** 화면만 뺀다.
   */

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
            onClick={back}
            aria-label={index > 0 ? "이전 걸음" : "뒤로"}
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
          {/* 진행 점 (§1-1) — 걸음 수는 종목마다 다르다(빈 걸음을 만들지 않으므로). */}
          <StepDots total={steps.length} index={index} />
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
          onPointerDown={onStepPointerDown}
          onPointerUp={onStepPointerUp}
        >
          <div className="mx-auto w-full max-w-[480px] px-gutter" data-testid={`depth-step-${step}`}>

          {/* ── 1걸음 — 누가 쓸어담고 있나 (§2) ── */}
          {step === "signal" && (
            <>
              {/* 카드에서 본 것을 **확인시켜준다.** 같은 결론, 같은 그림. */}
              <p className="mt-s4 break-keep text-ds-display-sm text-ds-text-1" data-testid="depth-hook">
                {hook}
              </p>
              {pick.signal.reentry?.text && (
                <p className="mt-s2 text-ds-caption text-ds-text-2" data-testid="depth-reentry">
                  다시 올라온 이유 — {repairPickCopy(pick.signal.reentry.text)}
                </p>
              )}
              {/* 그림은 카드와 **같은 컴포넌트**다 — 두 화면이 갈릴 수 없다. */}
              {pick.cardType && (
                <div className="mt-s5" data-testid="depth-signal-figure">
                  <CardFigure cardType={pick.cardType} invalidation={pick.invalidation.level} />
                </div>
              )}
              {rows.length > 0 && (
                <div className="mt-s5" data-testid="depth-evidence">
                  {rows.map((row) => (
                    <Row key={row.label} label={row.label} value={row.value} />
                  ))}
                </div>
              )}
              {/* 이 걸음이 더하는 **새 정보 한 줄** — 얼마나 이례적인가(§2). */}
              {rarityLine && (
                <p className="mt-s4 break-keep text-ds-body text-ds-text-2" data-testid="depth-rarity">
                  {rarityLine}
                </p>
              )}
              <StepNext label={nextLabel} onClick={goNext} />
            </>
          )}

          {/* ── 2걸음 — 왜 지금인가 (§3) ── */}
          {step === "why" && (
            <>
              <h2 className="mt-s4 text-ds-display-sm text-ds-text-1">왜 지금 사는가</h2>
              <div className="mt-s5" data-testid="depth-why-now">
                {whyNowEvents.map((event, i) => (
                  <div key={`${event.when}-${i}`} className="flex gap-s3 border-b-hair border-ds-border py-s3 last:border-0">
                    <p className="w-[64px] shrink-0 font-mono text-ds-label text-ds-text-2">{event.when}</p>
                    <p className="min-w-0 flex-1 break-keep text-ds-body text-ds-text-1">
                      {event.text}
                      {event.url && (
                        <>
                          {" "}
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="whitespace-nowrap text-ds-caption text-ds-text-3 underline"
                            data-testid="depth-why-now-source"
                          >
                            원문
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              {/*
                공시가 한 건도 없었다 — **이게 오히려 이 앱이 찾는 것이다**(§3-2).
                그래서 작게 흘리지 않고 본문 크기로 쓴다.
              */}
              {pick.whyNowQuietNote && (
                <p className="mt-s4 break-keep text-ds-body text-ds-text-1" data-testid="depth-why-now-quiet">
                  {pick.whyNowQuietNote}
                </p>
              )}
              <p className="mt-s3 break-keep text-ds-caption text-ds-text-3" data-testid="depth-why-now-note">
                {WHY_NOW_TIMELINE_DISCLAIMER}
              </p>
              <StepNext label={nextLabel} onClick={goNext} />
            </>
          )}

          {/* ── 3걸음 — 어떤 회사인가 (§4) ── */}
          {step === "company" && (
            <>
              <h2 className="mt-s4 text-ds-display-sm text-ds-text-1">어떤 회사인가</h2>
              {/*
                회사 설명 한 줄은 벤더 요약이라 늦게 온다. **헤더와 숫자는 이미 있으므로**
                이 줄만 스켈레톤으로 기다린다 — 화면 전체를 비우지 않는다(DS-06 §4).
              */}
              {!basics && <DepthSkeleton />}
              {/* 무엇을 파는 회사인가 — 이게 없으면 아래 숫자가 누구 것인지 모른다. */}
              {(blurb || substance) && (
                <p className="mt-s4 break-keep text-ds-body text-ds-text-1" data-testid="depth-company">
                  {blurb?.text ?? substance}
                </p>
              )}
              {blurb && substance && (
                <p className="mt-s2 break-keep text-ds-body text-ds-text-2" data-testid="depth-substance">
                  {substance}
                </p>
              )}
              {/*
                줄인 설명이면 **원문을 볼 길**을 남긴다 — 벤더 요약을 그대로 쓰지 않되
                우리가 줄였다는 사실을 숨기지도 않는다(DS-03 §6).
              */}
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
                  {sourceOpen && <p className="mt-s2 break-keep text-ds-caption text-ds-text-2">{basics.summary}</p>}
                </>
              )}
              {companyGroups.map((group) => (
                <CompanyGroupBlock key={group.title} group={group} onMethod={() => toggleMethod(group.title)} />
              ))}
              {openMethod && (
                <p className="mt-s3 break-keep text-ds-caption text-ds-text-2" data-testid="depth-method">
                  {companyGroups.find((g) => g.title === openMethod)?.method}
                </p>
              )}
              <StepNext label={nextLabel} onClick={goNext} />
            </>
          )}

          {/* ── 4걸음 — 계속 지켜볼까요 (§5) ── */}
          {step === "decide" && (
            <>
              <div className="mt-s6" data-testid="depth-summary">
                {summaryLines.map((line) => (
                  <p key={line} className="break-keep text-ds-body text-ds-text-1">
                    {line}
                  </p>
                ))}
              </div>
              <p className="mt-s5 break-keep text-ds-body text-ds-text-2">
                계속 지켜보면 앞으로 얼마나 움직이는지 알려드려요
              </p>
              {watched ? (
                <div className="mt-s6" data-testid="depth-watch-done">
                  <p className="text-ds-display-sm text-ds-text-1">담았어요</p>
                  <p className="mt-s2 break-keep text-ds-body text-ds-text-2">
                    앞으로 이 종목이 얼마나 움직이는지 기록해서 보여드릴게요
                  </p>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="tap-button mt-s5 h-touch text-ds-caption text-ds-text-3 underline"
                  >
                    닫기
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onWatch}
                    data-testid="depth-watch"
                    className="tap-button mt-s6 flex h-touch w-full items-center justify-center gap-s2 rounded-block bg-ds-accent px-gutter text-[15px] font-medium text-ds-bg"
                  >
                    ★ 즐겨찾기에 담기
                  </button>
                  {/* 보조는 **텍스트 링크**다 — 이 화면에서 강조는 하나뿐이다(§5). */}
                  <button
                    type="button"
                    onClick={dismiss}
                    data-testid="depth-leave"
                    className="tap-button mx-auto mt-s3 flex h-touch items-center justify-center text-ds-caption text-ds-text-3 underline"
                  >
                    그냥 나가기
                  </button>
                </>
              )}
            </>
          )}

          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

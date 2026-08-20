"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardSlotPayload, QuietPick, QuietWatchItem } from "@/lib/fomoApi";
import { fetchCardSlots, fetchQuietPicks } from "@/lib/fomoApi";
import { subjectName, subjectTicker } from "@/lib/companyDisplay";
import { staleLabel } from "@/lib/deckStale";
import { computeOurRecord } from "@/lib/ourRecord";
import { fetchScorecardPicksCached, type ScorecardPick } from "@/lib/judgmentLedgerClient";
import { recordPickTelemetry, flushPickTelemetry } from "@/lib/pickTelemetry";
import { QuietPickCard } from "@/components/QuietPickCard";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { QuietPickDepth } from "@/components/QuietPickDepth";

/**
 * 덱 화면 — DS-02(`docs/design/DS-02_DECK.md`). 카드는 DS-01, 토큰은 DS-00.
 *
 * ## 스와이프는 이동이다 (DS-02 §4-1)
 *
 * 좌 = 다음 카드 / 우 = **이전 카드** / 탭 = 상세. 종전에는 우 = 관심(저장 + 취향 적재),
 * 좌 = 넘김이었다. DS-02 가 스와이프를 **탐색 제스처**로 재정의했으므로 관심은 카드의 ★
 * 버튼만 담당한다(취향 신호도 거기서 쌓는다 — `QuietPickCard`).
 *
 * ## 마지막 카드에서 끝 화면을 만들지 않는다 (§4-2)
 *
 * 마지막 장에서 좌 스와이프하면 지켜보는 중 섹션으로 스크롤한다. `idx` 는 마지막 인덱스를
 * 넘지 않으며, 종전의 "오늘 픽을 다 봤어요" 종료 화면은 폐기했다.
 *
 * ## 진행은 점으로 (§5)
 *
 * `N/10`·`N곳 남음` 텍스트를 버리고 점 인디케이터를 쓴다. 12장을 넘으면 점이 오히려 안 읽혀
 * mono 텍스트(`3 / 14`)로 전환한다.
 *
 * iOS(특히 standalone PWA)는 touch-action 이 pan-y 면 가로 드래그를 스크롤·뒤로가기 제스처로
 * 가로채 pointermove 가 오지 않는다 → 카드에 touchAction:"none" 을 준다(스와이프 불능 회귀 방지).
 */

const THRESHOLD = 90;
const EXIT_MS = 300;
/** 점이 안 읽히기 시작하는 장수. 넘으면 `3 / 14` mono 텍스트로 바꾼다(DS-02 §5). */
const DOTS_MAX = 12;
/** 지켜보는 중 기본 표시 개수. 나머지는 `더 보기`(DS-02 §6). */
const WATCH_PREVIEW = 5;

/** KST 오늘 `YYYY-MM-DD` — "오늘 첫 발행" 판정용(성적이라 부를 게 없는 날). */
function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * 오류는 두 종류다 (DS-05 §6) — 사용자가 할 수 있는 일이 다르다.
 * `offline` 은 연결을 확인하면 되고, `server` 는 기다리면 된다. 예외 문자열·상태 코드는
 * 절대 화면에 내지 않는다.
 */
type Status = "loading" | "ready" | "offline" | "server-error";

export function QuietPickDeck() {
  const [picks, setPicks] = useState<QuietPick[]>([]);
  /**
   * WO-SUB-08 3슬롯 — canonical → 상세용 페이로드.
   *
   * **픽 로딩과 분리한다.** 슬롯 조립은 저장 레코드를 읽어 오는 별도 라우트이고, 실패해도
   * 카드는 성립해야 한다. 같은 `then` 에 묶으면 슬롯 실패가 덱을 죽인다.
   */
  const [slots, setSlots] = useState<Record<string, CardSlotPayload>>({});
  /**
   * 슬롯 구성 라벨 (WO-SUB-04 사후 비교 입력).
   *
   * 페이로드가 아직 안 왔으면 라벨을 **넘기지 않는다** — `false` 로 보내면 "③ 없는 카드" 로
   * 잘못 분류된다. 서버가 미부착 이벤트를 `?` 군으로 따로 세므로 분모에서 빠지지 않는다.
   */
  const slotLabel = useCallback(
    (canonical: string): { hasChart?: boolean; hasSubstance?: boolean; hasRisk?: boolean } => {
      const payload = slots[canonical];
      if (!payload) return {};
      return {
        hasChart: payload.valuation !== null,
        hasSubstance: payload.substance !== null,
        hasRisk: payload.risk !== null,
      };
    },
    [slots]
  );
  const [watching, setWatching] = useState<QuietWatchItem[]>([]);
  /**
   * 발행 원장 — 카드 ⑥ 우리 성적의 원료(DS-01 §3-⑥).
   *
   * 성적표 라우트가 **전 종목 발행 이력을 한 번에** 주므로 카드마다 부르지 않는다. 실패하면
   * 빈 배열이라 성적 블록만 없다 — 그때 카드에 accent 가 없는 것이 정상이다.
   */
  const [records, setRecords] = useState<ScorecardPick[]>([]);
  const [asOf, setAsOf] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>("loading");
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<QuietPick | null>(null);
  const [watchSelected, setWatchSelected] = useState<QuietWatchItem | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);
  const watchingRef = useRef<HTMLElement | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    const startedAt = Date.now();
    /** 스켈레톤 최소 표시 300ms — 200ms 만에 끝나면 깜빡임으로 보인다(DS-05 §5). */
    const settle = (next: Status) => {
      const wait = Math.max(0, 300 - (Date.now() - startedAt));
      window.setTimeout(() => setStatus(next), wait);
    };
    fetchQuietPicks()
      .then((res) => {
        setPicks(res.picks ?? []);
        setWatching(res.watching ?? []);
        setAsOf(res.asOf);
        setIdx(0);
        settle("ready");
      })
      .catch(() => {
        // 연결이 끊긴 것과 서버가 답을 못 준 것을 구분한다.
        settle(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "server-error");
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    fetchScorecardPicksCached()
      .then((res) => { if (alive) setRecords(res.picks ?? []); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // 슬롯은 별도로 받는다 — 실패하면 빈 맵이라 상세의 일부만 안 보인다(덱은 그대로).
  useEffect(() => {
    let alive = true;
    fetchCardSlots()
      .then((res) => { if (alive) setSlots(res.slots ?? {}); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // 진행 중 전환 타이머 — 언마운트 후 발화하면 사라진 덱에서 setState 가 돈다.
  const exitTimer = useRef<number | null>(null);
  useEffect(() => () => { if (exitTimer.current) window.clearTimeout(exitTimer.current); }, []);

  const current = picks[idx];

  // WO-SUB-00 §4-2 — 카드 노출·체류시간. 카드가 바뀌는 순간 이전 카드의 체류를 확정한다.
  useEffect(() => {
    if (status !== "ready" || !current) return;
    recordPickTelemetry({ event: "card_view", position: idx + 1, ...slotLabel(current.subject.canonical) });
    const shownAt = Date.now();
    return () => {
      recordPickTelemetry({ event: "card_dwell", durationMs: Date.now() - shownAt, position: idx + 1 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, status, picks.length]);

  // 덱 완주 — 마지막 카드까지 본 시점 1회. 종료 화면은 없으므로 마지막 인덱스 도달로 센다.
  const completedRef = useRef(false);
  useEffect(() => {
    if (status !== "ready" || picks.length === 0) return;
    if (idx >= picks.length - 1 && !completedRef.current) {
      completedRef.current = true;
      recordPickTelemetry({ event: "deck_complete", cardsConsumed: picks.length });
      flushPickTelemetry();
    }
  }, [idx, status, picks.length]);

  /**
   * 카드 이동 — DS-02 §4-1. **관성 없음: 한 번 스와이프 = 한 장.**
   * 마지막 장에서 다음으로 가려 하면 지켜보는 중으로 스크롤한다(§4-2).
   */
  const move = useCallback(
    (dir: "next" | "prev") => {
      if (dir === "prev" && idx === 0) { setDx(0); return; }
      if (dir === "next" && idx >= picks.length - 1) {
        setDx(0);
        recordPickTelemetry({ event: "deck_complete", cardsConsumed: picks.length });
        watchingRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        return;
      }
      recordPickTelemetry({ event: dir === "next" ? "card_skip" : "card_view", position: idx + 1 });
      setExiting(dir === "next" ? "left" : "right");
      const after = () => {
        setExiting(null);
        setDx(0);
        setIdx((i) => (dir === "next" ? i + 1 : i - 1));
      };
      if (prefersReducedMotion()) after();
      else exitTimer.current = window.setTimeout(after, EXIT_MS);
    },
    [idx, picks.length]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = e.clientX - startX.current;
    if (Math.abs(d) > 6) moved.current = true;
    setDx(d);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx < -THRESHOLD) move("next");
    else if (dx > THRESHOLD) move("prev");
    else setDx(0);
  };

  const stale = useMemo(() => staleLabel(asOf, Date.now()), [asOf]);

  /**
   * 카드에 우리 성적을 붙인다 — 서버가 `ourRecord` 를 내려주지 않으므로 원장에서 계산한다.
   * 오늘 첫 발행이거나 기록이 없으면 `undefined` 라 카드가 블록을 그리지 않는다.
   */
  const withRecord = useCallback(
    (target: QuietPick): QuietPick => {
      const record = computeOurRecord(records, target.subject.canonical, target.price.current, todayKst());
      return record
        ? { ...target, ourRecord: { firstPublishedAt: record.firstPublishedAt, sinceText: record.sinceText, returnPct: record.returnPct } }
        : target;
    },
    [records]
  );

  if (status === "loading") return <DeckSkeleton />;

  if (status === "offline" || status === "server-error") {
    return (
      <div className="px-gutter">
        <DeckTitle count={null} stale={null} />
        <div className="rounded-card bg-ds-surface-1 p-s4" data-testid="deck-error">
          <p className="text-ds-body text-ds-text-1">
            {status === "offline" ? "연결이 끊겼어요." : "잠시 후 다시 열어주세요."}
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-s4 h-btn-secondary w-full rounded-pill border-hairline border-ds-border text-[14px] font-medium text-ds-text-1"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 발행 0장 — 픽 기준을 통과한 곳이 없다는 뜻. 신호는 있었다면 '지켜보는 중'으로 보여준다(WO-P4).
  if (picks.length === 0) {
    return (
      <div>
        <div className="px-gutter">
          <DeckTitle count={0} stale={stale} />
          <div className="rounded-card bg-ds-surface-1 p-s4" data-testid="deck-empty">
            <p className="text-ds-display text-ds-text-1">오늘은 기준을 넘은 곳이 없어요</p>
            <p className="mt-s3 text-ds-body text-ds-text-2">
              {watching.length > 0
                ? "기준을 낮춰 채우지 않아요. 신호가 잡힌 곳은 아래에 그대로 뒀어요."
                : "무리해서 고르지 않아요. 뉴스 전에 돈이 먼저 들어간 곳이 없는 날이에요."}
            </p>
            <a
              href="/track-record"
              className="mt-s4 flex h-btn-primary w-full items-center justify-center rounded-pill border-hairline border-ds-border bg-ds-surface-2 text-[14px] font-medium text-ds-text-1"
            >
              성적표 보기
            </a>
          </div>
        </div>
        <WatchShelf items={watching} onOpen={setWatchSelected} sectionRef={watchingRef} />
        {watchSelected && (
          <StockInsightView
            stock={watchSelected.subject.canonical}
            context={subjectContext(watchSelected.subject)}
            onClose={() => setWatchSelected(null)}
          />
        )}
      </div>
    );
  }

  const pick = current!;
  const next = picks[idx + 1];
  /** 카드 CTA — 탭 진입과 같은 상세를 열고 진입점만 다르게 기록한다. */
  const openDetail = () => {
    recordPickTelemetry({ event: "card_detail_open", entryPoint: "button", position: idx + 1, ...slotLabel(pick.subject.canonical) });
    setSelected(pick);
  };
  const rot = dx / 18;
  const exitX = exiting === "right" ? 1000 : exiting === "left" ? -1000 : dx;
  const transform = `translateX(${exitX}px) rotate(${exiting ? (exiting === "right" ? 18 : -18) : rot}deg)`;

  return (
    <div>
      <div className="px-gutter">
        <DeckTitle count={picks.length} stale={stale} />

        {/*
          카드 무대 — 고정 높이 없음(DS-01 §5). 앞 카드가 문서 흐름 안에 있어 무대 높이가 카드를
          따라가고, 뒤 카드는 8px 아래로 살짝 보여 "넘길 수 있다"를 전달한다(§4-1 peek).
        */}
        <div className="relative select-none">
          {/*
            뒤 카드 자리 — 8px 아래로 내민 `surface-2` 시트. **정지 상태에서도 띠가 보인다.**
            다음 카드를 통째로 겹쳐 그리면 같은 `surface-1` 이라 띠가 안 보이고 ★ 같은 조작
            요소가 DOM 에 두 벌 생긴다. 깊이는 배경 밝기 차이로만 만든다(DS-00 §5) — 그림자 없음.
          */}
          {next && (
            <div
              className="pointer-events-none absolute inset-x-1 top-s2 h-full rounded-card bg-ds-surface-2"
              aria-hidden
              data-testid="deck-peek"
            />
          )}
          <div
            className="relative overflow-hidden rounded-card"
            style={{
              transform,
              transition: exiting ? `transform ${EXIT_MS}ms ease-in` : dragging.current ? "none" : "transform 160ms ease-out",
              cursor: "grab",
              touchAction: "none", // iOS PWA 가로 드래그 가로채기 방지(스와이프 불능 회귀)
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => {
              if (moved.current) return;
              recordPickTelemetry({ event: "card_detail_open", entryPoint: "tap", position: idx + 1, ...slotLabel(pick.subject.canonical) });
              setSelected(pick);
            }}
            role="button"
            tabIndex={0}
            aria-label={`${pick.subject.canonical} 자세히 보기`}
          >
            <QuietPickCard pick={withRecord(pick)} onDetail={openDetail} position={idx + 1} />
          </div>
        </div>

        <DeckProgress total={picks.length} index={idx} />
      </div>

      <WatchShelf items={watching} onOpen={setWatchSelected} sectionRef={watchingRef} />

      {watchSelected && (
        <StockInsightView
          stock={watchSelected.subject.canonical}
          context={subjectContext(watchSelected.subject)}
          onClose={() => setWatchSelected(null)}
        />
      )}

      {selected && <QuietPickDepth pick={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/**
 * ② 덱 타이틀 (DS-02 §3) — 개수에 **accent 를 쓰지 않는다.** 그 색은 우리 성적의 것이다.
 * 개수가 매일 달라지는 것은 덱 회전의 결과이므로 숨기지 않는다.
 */
export /** 3장 미만이면 "적었다"고 말한다 — 숨기거나 지속 신호로 채우지 않는다(DS-05 §7). */
const THIN_DECK = 3;

export function DeckTitle({ count, stale }: { count: number | null; stale: string | null }) {
  return (
    <div className="pb-gutter pt-s4">
      <h1 className="text-[20px] font-medium leading-tight tracking-[-0.01em] text-ds-text-1">
        오늘의 조용한 돈{count !== null && <span className="ml-s2 font-mono">{count}곳</span>}
      </h1>
      <p className="mt-s1 text-ds-caption text-ds-text-2">뉴스 나오기 전에 돈이 먼저 들어간 곳</p>
      {count !== null && count > 0 && count < THIN_DECK && (
        <p className="mt-s1 text-ds-caption text-ds-text-3" data-testid="deck-thin">
          오늘은 조용한 곳이 적었어요
        </p>
      )}
      {/* 스테일 서빙 — 카드는 정상 표시하고 기준 시각만 밝힌다(DS-02 §9). */}
      {stale && (
        <p className="mt-s1 font-mono text-ds-caption text-ds-text-3" data-testid="deck-stale">
          {stale}
        </p>
      )}
    </div>
  );
}

/** ④ 진행 인디케이터 (DS-02 §5) — 점. 12장 초과면 mono 텍스트. */
export function DeckProgress({ total, index }: { total: number; index: number }) {
  if (total <= 1) return null;
  if (total > DOTS_MAX) {
    return (
      <p className="mt-s4 text-center font-mono text-ds-label text-ds-text-2" data-testid="deck-progress">
        {`${index + 1} / ${total}`}
      </p>
    );
  }
  return (
    <div className="mt-s4 flex items-center justify-center gap-s2" data-testid="deck-progress" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`rounded-pill ${i === index ? "h-1.5 w-1.5 bg-ds-text-1" : "h-1 w-1 bg-ds-text-3"}`}
        />
      ))}
    </div>
  );
}

/** ③ 로딩 (DS-02 §9) — 카드 형태 스켈레톤 1장. **스피너를 쓰지 않는다**(레이아웃 점프). */
export function DeckSkeleton() {
  return (
    <div className="px-gutter">
      <DeckTitle count={null} stale={null} />
      <div className="rounded-card bg-ds-surface-1 p-s4" data-testid="deck-skeleton" aria-busy>
        {/* 블록 높이 20 / 60 / 40 — 카드의 실제 위계(아이덴티티 · 결론 · 근거)를 닮게(DS-05 §5). */}
        <div className="ds-skeleton h-5 w-1/3 rounded-block bg-ds-surface-2" />
        <div className="ds-skeleton mt-s4 h-[60px] w-4/5 rounded-block bg-ds-surface-2" />
        <div className="ds-skeleton mt-s4 h-10 w-full rounded-block bg-ds-surface-2" />
      </div>
    </div>
  );
}

/** 픽/워치 공용 — 뎁스가 종목을 식별하는 최소 컨텍스트. */
function subjectContext(subject: QuietPick["subject"]) {
  return {
    ...(subject.symbol ? { symbol: subject.symbol } : {}),
    ...(subject.naverCode ? { naverCode: subject.naverCode } : {}),
    ...(subject.market ? { market: subject.market } : {}),
    ...(subject.country ? { country: subject.country } : {}),
  };
}

const WATCH_SIGNAL_LABEL: Record<string, string> = {
  insider_cluster: "임원 매수",
  multi_cluster: "외국인+기관",
  institution_streak: "기관 매수",
  foreign_streak: "외국인 매수",
};

/**
 * ⑤ 지켜보는 중 (DS-02 §6) — 신호는 실재하는데 픽 기준에 못 미친 곳. **픽 승격이 아니다.**
 *
 * 종전에는 10개가 각각 둥근 카드였다. 그러면 시각 무게가 픽 카드와 비슷해져 위계가 무너진다.
 * **구분선으로 나눈 리스트**가 조용하다 — radius 없음, 로고 없음, 하단 0.5px `border`.
 * 기본 5개만 보여주고 나머지는 `더 보기`.
 */
export function WatchShelf({
  items,
  onOpen,
  sectionRef,
}: {
  items: QuietWatchItem[];
  onOpen: (item: QuietWatchItem) => void;
  sectionRef?: React.MutableRefObject<HTMLElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, WATCH_PREVIEW);
  return (
    <section
      ref={sectionRef}
      id="watching"
      className="mt-s5 border-t-hairline border-ds-border px-gutter pt-s5"
      data-testid="watch-shelf"
    >
      <div className="flex items-baseline justify-between gap-s2">
        <h2 className="text-ds-title text-ds-text-1">지켜보는 중</h2>
        <span className="font-mono text-ds-label text-ds-text-2">{items.length}곳</span>
      </div>
      <p className="mt-s1 text-ds-caption text-ds-text-2">신호는 있지만 픽 기준엔 못 미쳤어요</p>

      <ul className="mt-s3">
        {shown.map((item) => (
          <li key={`${item.subject.canonical}-${item.reasonCode}`} className="border-b-hairline border-ds-border">
            <button
              type="button"
              onClick={() => onOpen(item)}
              /* 최소 64px — 내용이 짧아도 행이 눌리지 않는다(DS-02 §6). */
              className="flex min-h-16 w-full flex-col justify-center py-s3 text-left"
              data-testid="watch-row"
            >
              <div className="flex items-baseline justify-between gap-s2">
                <span className="min-w-0 truncate text-[14px] font-medium leading-tight text-ds-text-1">
                  {subjectName(item.subject)}
                </span>
                <span className="shrink-0 font-mono text-ds-label text-ds-text-3">{subjectTicker(item.subject)}</span>
              </div>
              <p className="mt-s1 line-clamp-2 text-ds-caption text-ds-text-2">
                {WATCH_SIGNAL_LABEL[item.signal.kind] ?? "신호"} {item.signal.days}일 · {item.reasonText}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {!expanded && items.length > WATCH_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-s3 h-btn-secondary w-full rounded-pill border-hairline border-ds-border text-[14px] font-medium text-ds-text-2"
          data-testid="watch-more"
        >
          더 보기
        </button>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuietPick, QuietWatchItem } from "@/lib/fomoApi";
import { fetchQuietPicks, recordTaste } from "@/lib/fomoApi";
import { upsertWatch } from "@/lib/watchlist";
import { QuietPickCard } from "@/components/QuietPickCard";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { QuietPickDepth } from "@/components/QuietPickDepth";
import { StockLogoBadge } from "@/components/StockLogoBadge";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";

/**
 * 오늘의 조용한 픽 덱 (WO-G1B 피벗 2호) — 홈의 얼굴.
 * 틴더 스와이프: **좌=넘김 / 우=관심(저장+취향 적재) / 탭=뎁스**(WO-P2 §3 복원).
 * 30장 통합 덱·자산 탭 없음. 픽 0장인 날은 정직 화면(무리해서 고르지 않는다).
 *
 * iOS(특히 standalone PWA)는 touch-action 이 pan-y 면 가로 드래그를 스크롤·뒤로가기 제스처로
 * 가로채 pointermove 가 오지 않는다 → 카드에 touchAction:"none" 을 준다(스와이프 불능 회귀 방지).
 */

const THRESHOLD = 90;
const EXIT_MS = 300;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type Status = "loading" | "ready" | "error";

export function QuietPickDeck() {
  const [picks, setPicks] = useState<QuietPick[]>([]);
  const [watching, setWatching] = useState<QuietWatchItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<QuietPick | null>(null);
  const [watchSelected, setWatchSelected] = useState<QuietWatchItem | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  const load = useCallback(() => {
    setStatus("loading");
    fetchQuietPicks()
      .then((res) => {
        setPicks(res.picks ?? []);
        setWatching(res.watching ?? []);
        setIdx(0);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => { load(); }, [load]);

  // 진행 중 전환 타이머 — 언마운트 후 발화하면 사라진 덱에서 setState 가 돈다.
  const exitTimer = useRef<number | null>(null);
  useEffect(() => () => { if (exitTimer.current) window.clearTimeout(exitTimer.current); }, []);

  const advance = useCallback(
    (dir: "left" | "right", pick?: QuietPick) => {
      // 우스와이프 = 관심: 로컬 관심 목록에 저장 + 취향 신호 적재(넘김도 신호다).
      if (pick) {
        if (dir === "right") {
          upsertWatch(pick.subject.canonical, Date.now(), {
            ...(pick.subject.identity ? { sector: pick.subject.identity } : {}),
            reason: pick.hook,
          });
        }
        recordTaste("stock", pick.subject.canonical, dir === "right" ? "more" : "less");
      }
      setExiting(dir);
      const after = () => {
        setExiting(null);
        setDx(0);
        setIdx((i) => i + 1);
      };
      if (prefersReducedMotion()) after();
      else exitTimer.current = window.setTimeout(after, EXIT_MS);
    },
    []
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
    const pick = picks[idx];
    if (dx > THRESHOLD) advance("right", pick);
    else if (dx < -THRESHOLD) advance("left", pick);
    else setDx(0);
  };

  if (status === "loading") return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;

  if (status === "error") {
    return (
      <HonestScreen
        title="픽을 준비하고 있어요"
        body="조용한 돈을 다시 훑는 중이에요. 잠시 후 다시 볼 수 있어요."
        cta={{ label: "다시 시도", onClick: load }}
      />
    );
  }

  // 발행 0장 — 픽 기준을 통과한 곳이 없다는 뜻. 신호는 있었다면 '지켜보는 중'으로 보여준다(WO-P4).
  if (picks.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col">
        <HonestScreen
          title="오늘 픽 기준을 넘은 곳은 없어요"
          body={
            watching.length > 0
              ? "기준을 낮춰 채우지 않아요. 대신 신호가 잡힌 곳을 아래에 그대로 보여드려요."
              : "무리해서 고르지 않아요. 뉴스 전에 돈이 먼저 들어간 곳이 없는 날이에요."
          }
          cta={{ label: "성적표 보기 →", href: "/track-record" }}
          compact={watching.length > 0}
        />
        <WatchShelf items={watching} onOpen={setWatchSelected} />
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

  const remaining = picks.length - idx;

  if (idx >= picks.length) {
    return (
      <HonestScreen
        title="오늘 픽을 다 봤어요"
        body={`오늘의 조용한 돈 ${picks.length}곳을 모두 봤어요. 우리가 짚은 픽의 성적은 전부 공개돼요.`}
        cta={{ label: "성적표 보기 →", href: "/track-record" }}
        secondary={{ label: "처음부터 다시", onClick: () => setIdx(0) }}
      />
    );
  }

  const current = picks[idx]!;
  const next = picks[idx + 1];
  const rot = dx / 18;
  const exitX = exiting === "right" ? 1000 : exiting === "left" ? -1000 : dx;
  const transform = `translateX(${exitX}px) rotate(${exiting ? (exiting === "right" ? 18 : -18) : rot}deg)`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      {/* 헤더 — 실제 픽 수(희소성이 카피) */}
      <div className="px-1 pb-3 pt-1">
        <h1 className="text-xl font-bold text-whiteout">
          오늘의 조용한 돈 <span style={{ color: "var(--neon,#d8ff3a)" }}>{picks.length}곳</span>
        </h1>
        <p className="mt-0.5 text-xs text-muted">뉴스 나오기 전에 돈이 먼저 들어간 곳만.</p>
      </div>

      <div className="relative h-[540px] select-none">
        {next && (
          <div className="absolute inset-0 scale-[0.97] rounded-3xl border border-hairline bg-[#111319] p-5 opacity-60" aria-hidden>
            <QuietPickCard pick={next} />
          </div>
        )}
        <div
          className="absolute inset-0 rounded-3xl border border-hairline bg-[#14161c] p-5"
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
          onClick={() => { if (!moved.current) setSelected(current); }}
          role="button"
          tabIndex={0}
          aria-label={`${current.subject.canonical} 자세히 보기`}
        >
          {/* 드래그 스탬프 — 어느 쪽으로 놓으면 뭐가 되는지 즉시 보이게(틴더 감각). */}
          <span
            className="pointer-events-none absolute right-5 top-5 z-20 rounded-lg border-2 px-2 py-0.5 text-sm font-bold"
            style={{ color: "var(--neon,#d8ff3a)", borderColor: "var(--neon,#d8ff3a)", opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}
            aria-hidden
          >
            관심 →
          </span>
          <span
            className="pointer-events-none absolute left-5 top-5 z-20 rounded-lg border-2 px-2 py-0.5 text-sm font-bold"
            style={{ color: "#8b8f98", borderColor: "#8b8f98", opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}
            aria-hidden
          >
            ← 넘김
          </span>
          <QuietPickCard pick={current} progress={`${idx + 1}/${picks.length}`} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 pb-2">
        <button type="button" onClick={() => advance("left", current)} className="rounded-full border border-hairline px-5 py-2 text-sm text-muted">넘기기</button>
        <button type="button" onClick={() => setSelected(current)} className="rounded-full px-5 py-2 text-sm font-semibold text-black" style={{ backgroundColor: "var(--neon,#d8ff3a)" }}>자세히</button>
        <span className="ml-1 text-xs text-muted">{remaining}곳 남음</span>
      </div>

      <WatchShelf items={watching} onOpen={setWatchSelected} />

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

function HonestScreen({
  title,
  body,
  cta,
  secondary,
  compact = false,
}: {
  title: string;
  body: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  secondary?: { label: string; onClick: () => void };
  compact?: boolean;
}) {
  return (
    <div className={`mx-auto flex w-full max-w-md flex-col items-center justify-center px-6 text-center ${compact ? "py-10" : "min-h-[60vh]"}`}>
      <h1 className="text-2xl font-bold text-whiteout">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
      {cta && (
        cta.href ? (
          <a href={cta.href} className="mt-6 rounded-full px-6 py-2.5 text-sm font-semibold text-black" style={{ backgroundColor: "var(--neon,#d8ff3a)" }}>{cta.label}</a>
        ) : (
          <button type="button" onClick={cta.onClick} className="mt-6 rounded-full px-6 py-2.5 text-sm font-semibold text-black" style={{ backgroundColor: "var(--neon,#d8ff3a)" }}>{cta.label}</button>
        )
      )}
      {secondary && (
        <button type="button" onClick={secondary.onClick} className="mt-3 text-xs text-muted underline">{secondary.label}</button>
      )}
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
  insider_cluster: "내부자 매수",
  multi_cluster: "외국인+기관",
  institution_streak: "기관 매수",
  foreign_streak: "외국인 매수",
};

/**
 * 지켜보는 중(WO-P4) — 신호는 실재하는데 픽 기준에 못 미친 곳. **픽 승격이 아니다.**
 * 회색 계열 간이 카드로 픽과 시각을 명확히 구분하고, 미달 사유를 유저어로 반드시 보여준다.
 */
function WatchShelf({ items, onOpen }: { items: QuietWatchItem[]; onOpen: (item: QuietWatchItem) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6 border-t border-hairline pt-5">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold text-muted">
          지켜보는 중 <span className="text-whiteout">{items.length}곳</span>
        </h2>
        <span className="text-[10px] text-muted">신호는 있는데 픽 기준엔 못 미쳤어요</span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={`${item.subject.canonical}-${item.reasonCode}`}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="w-full rounded-xl border border-hairline bg-white/[0.02] px-4 py-3 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogoBadge
                    name={item.subject.canonical}
                    naverCode={item.subject.naverCode}
                    symbol={item.subject.symbol}
                    size={24}
                  />
                  <span className="min-w-0 truncate text-sm font-semibold text-[#c9c9c4]">
                    {item.subject.canonical}
                    {item.subject.symbol ? ` (${item.subject.symbol})` : item.subject.naverCode ? ` (${item.subject.naverCode})` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {WATCH_SIGNAL_LABEL[item.signal.kind] ?? "신호"} · {item.signal.days}일
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-muted">→ {item.reasonText}</p>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-[10px] leading-4 text-muted">
        기준을 낮춰 픽에 넣지 않아요. 왜 못 넘었는지까지 그대로 보여드려요.
      </p>
    </section>
  );
}

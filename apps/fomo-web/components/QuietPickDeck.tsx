"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuietPick } from "@/lib/fomoApi";
import { fetchQuietPicks } from "@/lib/fomoApi";
import { QuietPickCard } from "@/components/QuietPickCard";
import { StockInsightView } from "@/components/KeywordDepthPage";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";

/**
 * 오늘의 조용한 픽 덱 (WO-G1B 피벗 2호) — 홈의 얼굴.
 * 틴더 스와이프 유지. 30장 통합 덱·자산 탭 없음. 픽 0장인 날은 정직 화면(무리해서 고르지 않는다).
 */

const THRESHOLD = 90;
const EXIT_MS = 300;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type Status = "loading" | "ready" | "error";

export function QuietPickDeck() {
  const [picks, setPicks] = useState<QuietPick[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [selected, setSelected] = useState<QuietPick | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  const load = useCallback(() => {
    setStatus("loading");
    fetchQuietPicks()
      .then((res) => {
        setPicks(res.picks ?? []);
        setIdx(0);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const advance = useCallback((dir: "left" | "right") => {
    setExiting(dir);
    const after = () => {
      setExiting(null);
      setDx(0);
      setIdx((i) => i + 1);
    };
    if (prefersReducedMotion()) after();
    else window.setTimeout(after, EXIT_MS);
  }, []);

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
    if (dx > THRESHOLD) advance("right");
    else if (dx < -THRESHOLD) advance("left");
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

  // 발행 0장 — 정직의 화면(빈 화면 아님).
  if (picks.length === 0) {
    return (
      <HonestScreen
        title="오늘은 조용한 돈이 없어요"
        body="무리해서 고르지 않아요. 뉴스 전에 돈이 먼저 들어간 곳이 없는 날이에요."
        cta={{ label: "성적표 보기 →", href: "/track-record" }}
      />
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
          className="absolute inset-0 touch-pan-y rounded-3xl border border-hairline bg-[#14161c] p-5"
          style={{ transform, transition: exiting ? `transform ${EXIT_MS}ms ease-in` : dragging.current ? "none" : "transform 160ms ease-out", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => { if (!moved.current) setSelected(current); }}
          role="button"
          tabIndex={0}
          aria-label={`${current.subject.canonical} 자세히 보기`}
        >
          <QuietPickCard pick={current} progress={`${idx + 1}/${picks.length}`} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 pb-2">
        <button type="button" onClick={() => advance("left")} className="rounded-full border border-hairline px-5 py-2 text-sm text-muted">넘기기</button>
        <button type="button" onClick={() => setSelected(current)} className="rounded-full px-5 py-2 text-sm font-semibold text-black" style={{ backgroundColor: "var(--neon,#d8ff3a)" }}>자세히</button>
        <span className="ml-1 text-xs text-muted">{remaining}곳 남음</span>
      </div>

      {selected && (
        <StockInsightView
          stock={selected.subject.canonical}
          context={{
            ...(selected.subject.symbol ? { symbol: selected.subject.symbol } : {}),
            ...(selected.subject.naverCode ? { naverCode: selected.subject.naverCode } : {}),
            ...(selected.subject.market ? { market: selected.subject.market } : {}),
            ...(selected.subject.country ? { country: selected.subject.country } : {}),
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function HonestScreen({
  title,
  body,
  cta,
  secondary,
}: {
  title: string;
  body: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
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

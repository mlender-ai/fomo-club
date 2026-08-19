"use client";

import { useEffect, useState } from "react";
import { type EmotionType } from "@fomo/core";
import { SearchIcon } from "@/components/icons";
import { KeywordHistory } from "@/components/KeywordHistory";
import { QuietPickDeck } from "@/components/QuietPickDeck";
import { SearchOverlay } from "@/components/SearchOverlay";
import { OverlayPortal } from "@/components/OverlayPortal";
import type {
  FomoIndexResponse,
  TallyResponse,
  CalendarResponse,
  BannerItem,
  MarketScore,
  FeedResponse,
  NewsResponse,
  VoiceItem,
} from "@/lib/fomoApi";

/**
 * 메인 = 틴더형 키워드 카드 피드 + 히스토리 탭. KEYWORD_CARD_FEED_DEV_SPEC v3.
 * 열면 바로 카드(스와이프 덱). 큰 마스코트 제거, 지수는 상단 얇은 띠. 본 카드는 히스토리 탭에.
 * (감정 게이트/캘린더/한마디 props는 보존 차원에서 시그니처에 남기되 미사용 — flag로 숨김 유지.)
 */
type Tab = "pick" | "mine";
const NEON = "#D8FF3A";

export function HomeView({
  index,
}: {
  index: FomoIndexResponse | null;
  tally: TallyResponse | null;
  banner: BannerItem[];
  markets: MarketScore[];
  feed: FeedResponse | null;
  news: NewsResponse | null;
  calendar: CalendarResponse | null;
  voices: VoiceItem[] | null;
  mine: EmotionType | null;
  onReopenGate: () => void;
  loggedIn: boolean;
  onLoggedIn: () => void;
}) {
  const [tab, setTab] = useState<Tab>("pick");
  const [searchOpen, setSearchOpen] = useState(false);
  void index;

  /**
   * 스크롤되면 헤더 하단에 0.5px 구분선이 생긴다(DS-02 §2·§8). 블러를 쓰지 않는다 —
   * 불투명 `bg` 다. 헤더·하단 탭은 고정, 그 사이만 스크롤한다.
   */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* ① 헤더 (DS-02 §2) — 56px, 로고 mono 16px/0.12em, 검색 44×44. accent 없음. */}
      <header
        className={`fixed inset-x-0 top-0 z-50 bg-ds-bg pt-[env(safe-area-inset-top)] ${scrolled ? "border-b-hairline border-ds-border" : ""}`}
        data-testid="deck-header"
      >
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-gutter">
          <span className="font-mono text-[16px] tracking-[0.12em] text-ds-text-1">FOMO CLUB</span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="-mr-2 flex h-touch w-touch items-center justify-center text-ds-text-2"
            aria-label="종목 검색"
          >
            <SearchIcon size={20} />
          </button>
        </div>
      </header>

      <main className="fomo-phase-in mx-auto flex min-h-screen max-w-xl flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))]">
        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "pick" ? <QuietPickDeck /> : <KeywordHistory />}
        </div>
      </main>

      {/* ⑥ 하단 탭 (DS-02 §7) — 텍스트만. 3개뿐이고 라벨이 짧아 아이콘이 정보를 더하지 않는다. */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t-hairline border-ds-border bg-ds-bg pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl">
          <TabButton active={tab === "pick"} onClick={() => setTab("pick")} label="픽" />
          <TabLink href="/track-record" label="성적표" />
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")} label="내 기록" />
        </div>
      </nav>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}

function FirstVisitNoticeSheet({
  checked,
  onCheckedChange,
  onAccept,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onAccept: () => void;
}) {
  const notes = [
    "투자 자문·권유·매매 신호가 아닙니다",
    "과거 흐름과 현재 신호가 미래 수익을 보장하지 않습니다",
    "모든 투자 판단과 결과의 책임은 본인에게 있습니다",
    "표시되는 가격·지표는 지연되거나 부정확할 수 있습니다",
  ];

  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="first-visit-title">
      <div className="absolute inset-0 bg-black/72 backdrop-blur-md" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md px-0">
        <section className="fomo-sheet-rise rounded-t-[28px] border border-hairline bg-[#1A1A1A] px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5">
          <div className="mx-auto h-1 w-14 rounded-full bg-white/20" />
          <h1 id="first-visit-title" className="mt-7 text-center text-2xl font-semibold tracking-[-0.01em] text-whiteout">
            시작하기 전에 알려드릴게요
          </h1>
          <p className="mt-5 text-center text-base leading-7 text-muted">
            <strong className="font-semibold text-whiteout">FOMO Club</strong>은 시장 분위기와 과거 흐름을
            담담하게 보여주는 <strong className="font-semibold text-whiteout">정보 제공 서비스</strong>입니다.
          </p>

          <ul className="mt-7 space-y-4">
            {notes.map((note) => (
              <li key={note} className="flex items-start gap-3 text-[15px] leading-6 text-muted">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-whiteout/80">
                  ✓
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>

          <label className="mt-8 flex items-center gap-3 rounded-2xl bg-white/[0.045] px-4 py-4 text-base font-semibold text-whiteout">
            <input
              checked={checked}
              onChange={(event) => onCheckedChange(event.target.checked)}
              className="peer sr-only"
              type="checkbox"
            />
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-lg font-bold transition-colors"
              style={{ backgroundColor: checked ? NEON : "transparent", color: checked ? "#0B0B0C" : "#FAFAFA" }}
              aria-hidden
            >
              {checked ? "✓" : ""}
            </span>
            <span>위 내용을 이해했으며 동의합니다</span>
          </label>

          <button
            className="mt-5 h-14 w-full rounded-2xl text-lg font-semibold text-canvas transition-opacity disabled:opacity-40"
            disabled={!checked}
            onClick={onAccept}
            style={{ backgroundColor: NEON }}
            type="button"
          >
            동의하고 시작하기
          </button>
        </section>
      </div>
    </div>
    </OverlayPortal>
  );
}

/** 하단 탭 버튼 — 활성 표시는 라벨 아래 2px × 16px 바(DS-02 §7). 탭 영역은 1/3 폭 × 56px. */
function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="flex h-14 flex-1 flex-col items-center justify-center gap-s1"
      data-testid="bottom-tab"
    >
      <span className={`font-mono text-ds-label ${active ? "text-ds-text-1" : "text-ds-text-3"}`}>{label}</span>
      <span className={`h-0.5 w-4 ${active ? "bg-ds-text-1" : "bg-transparent"}`} aria-hidden />
    </button>
  );
}

/** 다른 라우트로 가는 탭 — 버튼과 같은 형태를 유지한다(탭이 링크라고 다르게 보이면 안 된다). */
function TabLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="flex h-14 flex-1 flex-col items-center justify-center gap-s1" data-testid="bottom-tab">
      <span className="font-mono text-ds-label text-ds-text-3">{label}</span>
      <span className="h-0.5 w-4 bg-transparent" aria-hidden />
    </a>
  );
}

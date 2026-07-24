"use client";

import { useState } from "react";
import { type EmotionType } from "@fomo/core";
import { SearchIcon } from "@/components/icons";
import { KeywordHistory } from "@/components/KeywordHistory";
import { QuietPickDeck } from "@/components/QuietPickDeck";
import { SearchOverlay } from "@/components/SearchOverlay";
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

  // WO-G1B — 홈 = 오늘의 조용한 픽(모바일·PC 단일 경험). 30장 덱·자산 탭 소멸.
  // 피드는 GNB에서 숨김(FeedView 코드 보존). DesktopDashboard 도 코드 보존(홈 미사용).
  return (
    <>
      <main className="fomo-phase-in mx-auto flex min-h-screen max-w-xl flex-col px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <span className="font-pixel text-base text-whiteout">FOMO CLUB</span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center rounded-full border border-hairline p-1.5 text-muted transition-colors hover:border-whiteout/20"
            aria-label="종목 검색"
          >
            <SearchIcon size={14} />
          </button>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {tab === "pick" ? <QuietPickDeck /> : <KeywordHistory />}
        </div>
      </main>

      {/* GNB: 픽 / 성적표 / 내 기록 (WO-G1B — 피드 숨김) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#1E1E1E] bg-black pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl">
          <TabButton active={tab === "pick"} onClick={() => setTab("pick")} label="픽" />
          <a href="/track-record" className="flex flex-1 flex-col items-center gap-1 py-3">
            <span className="font-pixel text-xs" style={{ color: "#555" }}>성적표</span>
          </a>
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
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button onClick={onClick} className="flex flex-1 flex-col items-center gap-1 py-3 transition-colors">
      <span className="font-pixel text-xs transition-colors" style={{ color: active ? "#FAFAFA" : "#555" }}>
        {label}
      </span>
      {active && <span className="h-0.5 w-4 rounded-full bg-whiteout" />}
    </button>
  );
}

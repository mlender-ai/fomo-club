"use client";

import { useEffect, useState } from "react";
import { type EmotionType } from "@fomo/core";
import { SearchIcon } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { MyRecordTab } from "@/components/MyRecordTab";
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
  /** 면책 고지 — 로컬에 동의 기록이 없으면 1회 띄운다(DS-06 §6-5). */
  const [noticeOpen, setNoticeOpen] = useState(false);
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(NOTICE_KEY)) setNoticeOpen(true);
    } catch {
      /* 저장소를 못 읽으면 고지를 띄우지 않는다 — 매 진입마다 막는 것이 더 나쁘다. */
    }
  }, []);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // 8px 을 넘을 때만 — 손가락이 살짝 닿아 1px 밀린 것으로 선이 켜지면 깜빡인다(DS-06 §5).
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* ① 헤더 (DS-02 §2) — 56px, 로고 mono 16px/0.12em, 검색 44×44. accent 없음. */}
      <header
        className={`ds-header-line fixed inset-x-0 top-0 z-50 border-b-hair bg-ds-bg pt-[env(safe-area-inset-top)] ${scrolled ? "border-ds-border" : "border-transparent"}`}
        data-testid="deck-header"
      >
        <div className="mx-auto flex h-14 max-w-[480px] items-center justify-between px-gutter">
          <span className="font-mono text-[16px] tracking-[0.12em] text-ds-text-1">FOMO CLUB</span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="tap-button -mr-2 flex h-touch w-touch items-center justify-center text-ds-text-2"
            aria-label="종목 검색"
          >
            <SearchIcon size={20} />
          </button>
        </div>
      </header>

      <main className="fomo-phase-in mx-auto flex min-h-screen max-w-[480px] flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))]">
        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "pick" ? <QuietPickDeck /> : <MyRecordTab />}
        </div>
      </main>

      {/* ⑥ 하단 탭 (DS-02 §7) — 텍스트만. 3개뿐이고 라벨이 짧아 아이콘이 정보를 더하지 않는다. */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t-hair border-ds-border bg-ds-bg pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[480px]">
          <TabButton active={tab === "pick"} onClick={() => setTab("pick")} label="픽" />
          <TabLink href="/track-record" label="성적표" />
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")} label="내 기록" />
        </div>
      </nav>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

      {noticeOpen && (
        <FirstVisitNotice
          onAccept={() => {
            try {
              window.localStorage.setItem(NOTICE_KEY, new Date().toISOString());
            } catch {
              /* 저장 실패해도 이번 세션은 넘어간다 */
            }
            setNoticeOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * 최초 실행 면책 고지 (DS-06 §6-5) — **투자 앱 심사 필수 항목이다.**
 *
 * 종전에는 이 시트가 코드에만 있고 아무도 렌더하지 않았다(죽은 코드). DS-06 이 "설정 또는
 * 최초 실행 시 1회" 를 요구하므로 되살리고, DS-00 토큰으로 다시 그렸다 — 체크박스·글리프를
 * 없애고 문장과 CTA 하나만 남긴다.
 *
 * 동의 여부는 로컬에 남긴다. 서버로 보내지 않는다(개인정보를 만들지 않는다).
 */
const NOTICE_KEY = "fomo_notice_ack_v1";

function FirstVisitNotice({ onAccept }: { onAccept: () => void }) {
  const notes = [
    "투자 자문·권유·매매 신호가 아니에요.",
    "과거 흐름과 현재 신호가 미래 수익을 보장하지 않아요.",
    "투자 판단과 책임은 이용자 본인에게 있어요.",
    "가격·지표는 지연되거나 부정확할 수 있어요.",
  ];

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[80] flex items-end bg-ds-bg/80"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-visit-title"
        data-testid="first-visit-notice"
      >
        <section className="ds-sheet-up mx-auto w-full max-w-[480px] rounded-t-card bg-ds-surface-1 px-gutter pb-[calc(24px+env(safe-area-inset-bottom))] pt-s5">
          <h1 id="first-visit-title" className="text-ds-title-lg text-ds-text-1">
            시작하기 전에 알려드릴게요
          </h1>
          <p className="mt-s3 text-ds-body text-ds-text-2">
            FOMO Club 은 돈이 먼저 움직인 곳을 사실로 보여주는 정보 제공 서비스예요.
          </p>
          <ul className="mt-s4 space-y-s2">
            {notes.map((note) => (
              <li key={note} className="text-ds-body text-ds-text-1">
                · {note}
              </li>
            ))}
          </ul>
          <a href="/about" className="mt-s4 block text-ds-caption text-ds-text-3 underline">
            데이터 출처와 개인정보 처리 보기
          </a>
          <button
            type="button"
            onClick={() => {
              haptic();
              onAccept();
            }}
            className="tap-button mt-s5 h-btn-primary w-full rounded-pill bg-ds-accent text-[15px] font-medium text-ds-accent-ink"
          >
            확인했어요
          </button>
        </section>
      </div>
    </OverlayPortal>
  );
}

/** 하단 탭 버튼 — 활성 표시는 라벨 아래 2px × 16px 바(DS-02 §7). 탭 영역은 1/3 폭 × 56px. */
function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={() => {
        haptic();
        onClick();
      }}
      aria-current={active ? "page" : undefined}
      className="tap-button flex h-14 flex-1 flex-col items-center justify-center gap-s1"
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
    <a href={href} className="tap-button flex h-14 flex-1 flex-col items-center justify-center gap-s1" data-testid="bottom-tab">
      <span className="font-mono text-ds-label text-ds-text-3">{label}</span>
      <span className="h-0.5 w-4 bg-transparent" aria-hidden />
    </a>
  );
}

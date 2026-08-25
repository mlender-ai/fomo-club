"use client";

import { useEffect, useState } from "react";
import { type EmotionType } from "@fomo/core";
import { haptic } from "@/lib/haptics";
import { QuietPickDeck } from "@/components/QuietPickDeck";
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
        {/*
          로고만 남긴다(WO-RESET-01 A-4). 검색 버튼은 제거했다 — **검색해서 무엇을 하는지
          정의가 없었다.** `SearchOverlay` 코드는 지우지 않는다(되살릴 수 있게).
        */}
        <div className="mx-auto flex h-14 max-w-[480px] items-center px-gutter">
          <span className="font-mono text-[16px] tracking-[0.12em] text-ds-text-1">FOMO CLUB</span>
        </div>
      </header>

      {/*
        남는 화면은 둘뿐이다 — 카드(덱)와 상세(WO-RESET-01 A-4).
        하단 탭이 없으므로 아래 여백도 없앤다. 빈 자리를 다른 것으로 채우지 않는다.
      */}
      <main className="fomo-phase-in mx-auto flex min-h-screen max-w-[480px] flex-col pb-[env(safe-area-inset-bottom)] pt-[calc(3.5rem+env(safe-area-inset-top))]">
        <div className="flex min-h-0 flex-1 flex-col">
          <QuietPickDeck />
        </div>
      </main>

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



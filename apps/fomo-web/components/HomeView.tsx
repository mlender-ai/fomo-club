"use client";

import { useEffect, useState } from "react";
import { scoreToColor, type EmotionType } from "@fomo/core";
import { KeywordCardFeed } from "@/components/KeywordCardFeed";
import { CaretUpIcon, CaretDownIcon } from "@/components/icons";
import { KeywordHistory } from "@/components/KeywordHistory";
import { LoginPage } from "@/components/LoginPage";
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
type Tab = "card" | "history";
const FIRST_VISIT_NOTICE_KEY = "fomo_first_visit_notice_v1";
const NEON = "#D8FF3A";

export function HomeView({
  index,
  loggedIn,
  onLoggedIn,
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
  const [tab, setTab] = useState<Tab>("card");
  const [authOpen, setAuthOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeChecked, setNoticeChecked] = useState(true);
  const color = index ? scoreToColor(index.score) : undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setNoticeOpen(window.localStorage.getItem(FIRST_VISIT_NOTICE_KEY) !== "accepted");
    } catch {
      setNoticeOpen(true);
    }
  }, []);

  /**
   * 전체 폴백 판정: 4개 Heat가 모두 중립 기본값(market/community/emotion=15, whale=0)이고
   * aiSummary가 비어 있으면, 실제 데이터 없이 산출된 폴백 상태다.
   * 이 상태를 "진짜 숫자처럼" 노출하면 정직한 숫자 원칙(PRODUCT_TRUTH §4) 위반.
   * @author 안티그래비티
   */
  const isFullFallback = index
    ? index.components.market === 15 &&
      index.components.community === 15 &&
      index.components.emotion === 15 &&
      index.components.whale === 0 &&
      !index.aiSummary
    : false;

  return (
    <>
      <main className="fomo-phase-in mx-auto flex min-h-screen max-w-md flex-col px-6 pb-20 pt-4">
        {/* 상단 얇은 띠: 로고 + 로그인(취향 기억) */}
        <div className="flex items-center justify-between">
          <span className="font-pixel text-base text-whiteout">FOMO CLUB</span>
          <button
            onClick={() => setAuthOpen(true)}
            className="text-xs text-muted transition-colors hover:text-whiteout"
          >
            {loggedIn ? "내 계정" : "로그인"}
          </button>
        </div>

        {/* 시장 온도(FOMO Index) — 전체 폴백이면 정직하게 "수집 중" 표시 @author 안티그래비티 */}
        {index && !isFullFallback && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-2.5">
            <span className="text-xs text-muted">오늘의 시장 온도</span>
            <div className="flex items-baseline gap-2">
              <span className="font-pixel text-xl leading-none" style={{ color }}>
                {index.score}
              </span>
              <span className="font-pixel text-[11px] text-muted">{index.state}</span>
              {index.prevDayDelta !== 0 && (
                <span className="inline-flex items-center gap-0.5 font-pixel text-[11px]" style={{ color }}>
                  · 어제보다
                  {index.prevDayDelta > 0 ? <CaretUpIcon size={10} /> : <CaretDownIcon size={10} />}
                  {index.prevDayDelta > 0 ? `+${index.prevDayDelta}` : `${index.prevDayDelta}`}
                </span>
              )}
            </div>
          </div>
        )}
        {index && isFullFallback && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-2.5">
            <span className="text-xs text-muted">오늘의 시장 온도</span>
            <span className="font-pixel text-[11px] text-muted">데이터 수집 중…</span>
          </div>
        )}

        <div className={`mt-3 flex flex-1 flex-col ${tab === "card" ? "justify-center" : ""}`}>
          {tab === "card" ? (
            <KeywordCardFeed loggedIn={loggedIn} onRequireLogin={() => setAuthOpen(true)} />
          ) : (
            <KeywordHistory />
          )}
        </div>
      </main>

      {/* 하단 탭: 카드 / 히스토리 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#1E1E1E] bg-black">
        <div className="mx-auto flex max-w-md">
          <TabButton active={tab === "card"} onClick={() => setTab("card")} label="카드" />
          <TabButton active={tab === "history"} onClick={() => setTab("history")} label="히스토리" />
        </div>
      </nav>

      {authOpen && (
        <LoginPage loggedIn={loggedIn} onClose={() => setAuthOpen(false)} onAuthed={onLoggedIn} />
      )}

      {noticeOpen && (
        <FirstVisitNoticeSheet
          checked={noticeChecked}
          onCheckedChange={setNoticeChecked}
          onAccept={() => {
            if (!noticeChecked) return;
            try {
              window.localStorage.setItem(FIRST_VISIT_NOTICE_KEY, "accepted");
            } catch {
              /* localStorage 실패 시에도 이번 세션 흐름은 막지 않는다. */
            }
            setNoticeOpen(false);
          }}
        />
      )}
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

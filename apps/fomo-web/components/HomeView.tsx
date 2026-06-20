"use client";

import { useState } from "react";
import { scoreToColor, type EmotionType } from "@fomo/core";
import { KeywordCardFeed } from "@/components/KeywordCardFeed";
import { KeywordHistory } from "@/components/KeywordHistory";
import { AuthSheet } from "@/components/AuthSheet";
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
  const color = index ? scoreToColor(index.score) : undefined;

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
                <span className="font-pixel text-[11px]" style={{ color }}>
                  {index.prevDayDelta > 0
                    ? `· 어제보다 ▲+${index.prevDayDelta}`
                    : `· 어제보다 ▼${index.prevDayDelta}`}
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
          {tab === "card" ? <KeywordCardFeed /> : <KeywordHistory />}
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
        <AuthSheet loggedIn={loggedIn} onClose={() => setAuthOpen(false)} onAuthed={onLoggedIn} />
      )}
    </>
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

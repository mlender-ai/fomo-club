"use client";

import { useState } from "react";
import { scoreToColor, type EmotionType } from "@fomo/core";
import { KeywordCardFeed } from "@/components/KeywordCardFeed";
import { CaretUpIcon, CaretDownIcon, XMarkIcon } from "@/components/icons";
import { KeywordHistory } from "@/components/KeywordHistory";
import { DesktopDashboard, useIsDesktop } from "@/components/DesktopDashboard";
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
  const [tab, setTab] = useState<Tab>("card");
  const [indexHelpOpen, setIndexHelpOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const color = index ? scoreToColor(index.score) : undefined;

  /**
   * 전체 폴백 판정: 기본 온도만 있는 상태다.
   * 이 경우에도 "수집 중"으로 고정하지 않고 온도 자체는 보여주되, 어제 대비처럼
   * 실제 비교 데이터가 필요한 디테일만 숨긴다.
   */
  const isFullFallback = index
    ? index.components.market === 15 &&
      index.components.community === 15 &&
      index.components.emotion === 15 &&
      index.components.whale === 0 &&
      !index.aiSummary
    : false;

  // PC(≥1024px) — WO-PC-VERSION 3컬럼 대시보드. lg 미만 모바일 트리는 아래 그대로(틴더 덱 불가침).
  if (isDesktop) {
    return (
      <>
        <main className="fomo-phase-in mx-auto flex h-screen max-w-[1400px] flex-col gap-4 px-6 py-5">
          <div className="flex shrink-0 items-center justify-between">
            <span className="font-pixel text-base text-whiteout">FOMO CLUB</span>
            <button
              type="button"
              onClick={() => setIndexHelpOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-whiteout/20"
              aria-label="오늘의 시장 온도 계산 방식 보기"
            >
              <span>온도</span>
              {index ? (
                <span className="font-number text-sm font-bold leading-none" style={{ color }}>
                  {index.score}
                </span>
              ) : (
                <span>—</span>
              )}
            </button>
          </div>
          <DesktopDashboard />
        </main>
        {indexHelpOpen && <FomoIndexInfoSheet index={index} onClose={() => setIndexHelpOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <main className="fomo-phase-in mx-auto flex min-h-screen max-w-md flex-col px-6 pb-20 pt-4">
        {/* 상단 얇은 띠: 로고 + 시장 온도 축약 배지(WO 1.5 E — 큰 바는 몰입 방해라 접었다. 탭하면 설명 시트). */}
        <div className="flex items-center justify-between">
          <span className="font-pixel text-base text-whiteout">FOMO CLUB</span>
          <button
            type="button"
            onClick={() => setIndexHelpOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-whiteout/20"
            aria-label="오늘의 시장 온도 계산 방식 보기"
          >
            <span>온도</span>
            {index ? (
              <>
                <span className="font-number text-sm font-bold leading-none" style={{ color }}>
                  {index.score}
                </span>
                {!isFullFallback && index.prevDayDelta !== 0 && (
                  <span className="inline-flex items-center" style={{ color }}>
                    {index.prevDayDelta > 0 ? <CaretUpIcon size={9} /> : <CaretDownIcon size={9} />}
                    {Math.abs(index.prevDayDelta)}
                  </span>
                )}
              </>
            ) : (
              <span>—</span>
            )}
          </button>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {tab === "card" ? (
            <KeywordCardFeed loggedIn={true} />
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

      {indexHelpOpen && <FomoIndexInfoSheet index={index} onClose={() => setIndexHelpOpen(false)} />}
    </>
  );
}

function FomoIndexInfoSheet({
  index,
  onClose,
}: {
  index: FomoIndexResponse | null;
  onClose: () => void;
}) {
  const rows = [
    { key: "market" as const, label: "시장 움직임", points: "30점", desc: "주요 지수와 거래 흐름이 뜨거운지 봅니다." },
    { key: "community" as const, label: "뉴스·언급", points: "30점", desc: "공개 뉴스와 글에서 특정 종목·섹터 언급이 늘었는지 봅니다." },
    { key: "emotion" as const, label: "사용자 반응", points: "30점", desc: "앱 안에서 남긴 관심·반응 데이터가 충분할 때 보조로 반영합니다." },
    { key: "whale" as const, label: "외부 보조 신호", points: "10점", desc: "국내장 밖의 큰 흐름은 작게만 참고합니다." },
  ];
  const components = index?.components;

  return (
    <div className="fixed inset-0 z-[85]" role="dialog" aria-modal="true" aria-labelledby="fomo-index-info-title">
      <button className="absolute inset-0 bg-black/72 backdrop-blur-md" onClick={onClose} aria-label="닫기" type="button" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md">
        <section className="fomo-sheet-rise rounded-t-[28px] border border-hairline bg-[#1A1A1A] px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5">
          <div className="mx-auto h-1 w-14 rounded-full bg-white/20" />
          <div className="mt-6 flex items-start justify-between gap-4">
            <div>
              <p className="font-pixel text-[11px] text-muted">FOMO INDEX</p>
              <h1 id="fomo-index-info-title" className="mt-2 text-2xl font-semibold text-whiteout">
                시장 온도는 이렇게 계산해요
              </h1>
            </div>
            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline text-muted transition-colors hover:text-whiteout"
              onClick={onClose}
              type="button"
              aria-label="닫기"
            >
              <XMarkIcon size={20} />
            </button>
          </div>

          <p className="mt-5 text-sm leading-6 text-muted">
            오늘의 시장 온도는 발견 덱 위에 얹는 0~100점 분위기 지표예요. 카드의 개별 포모 점수와는 별도로,
            시장 전체가 얼마나 뜨겁거나 차분한지 빠르게 보여줍니다.
          </p>

          <div className="mt-6 space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="rounded-2xl border border-hairline bg-white/[0.035] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-whiteout">{row.label}</span>
                  <span className="font-number text-sm font-semibold" style={{ color: NEON }}>
                    {components?.[row.key] ?? "—"} / {row.points}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">{row.desc}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs leading-5 text-muted">
            데이터가 부족한 항목은 낮은 신뢰도로 반영돼요. 이 점수는 시장 분위기를 읽기 위한 정보이며,
            투자 자문·매수·매도 신호가 아닙니다.
          </p>
        </section>
      </div>
    </div>
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

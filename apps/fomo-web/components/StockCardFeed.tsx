"use client";

import { useState } from "react";
import { MOCK_STOCK_CARDS, type StockCard } from "@fomo/core";

/**
 * 종목 카드 피드 — 릴스형 세로 스와이프(스크롤 스냅), 탭하면 뎁스 페이지. CARD_FEED_DEV_SPEC v2.
 * 액션 제로: 거래 버튼 없음. "오늘의 카드 N장"으로 끝이 있는 데일리.
 * 색: 상승 빨강 / 하락 파랑 (한국 관습). 데이터는 지금 mock.
 */
const UP = "#FF5A36";
const DOWN = "#38BDF8";
const FLAT = "#8A8A8A";

function changeColor(pct: number): string {
  if (pct >= 0.5) return UP;
  if (pct <= -0.5) return DOWN;
  return FLAT;
}
function changeText(pct: number): string {
  const v = Math.round(pct * 10) / 10;
  const arrow = pct >= 0.5 ? "▲" : pct <= -0.5 ? "▼" : "·";
  return `${arrow} ${v > 0 ? "+" : ""}${v}% (어제보다)`;
}

export function StockCardFeed({ cards = MOCK_STOCK_CARDS }: { cards?: readonly StockCard[] }) {
  const [selected, setSelected] = useState<StockCard | null>(null);

  return (
    <div className="w-full">
      {/* 세로 스냅 피드 — 한 화면 1카드, 슥슥 넘김 */}
      <div className="scrollbar-none h-[calc(100vh-180px)] snap-y snap-mandatory overflow-y-auto">
        {cards.map((card, i) => (
          <StockCardSlide
            key={card.id}
            card={card}
            index={i}
            total={cards.length}
            onOpen={() => setSelected(card)}
          />
        ))}
        {/* 끝 카드 — 부담 없는 데일리 */}
        <div className="flex h-[calc(100vh-180px)] snap-center flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm leading-6 text-whiteout">
            오늘의 카드는 여기까지예요.
            <br />
            내일 또 새로운 카드로 만나요.
          </p>
          <p className="text-[11px] text-muted">매일 가볍게 슥 보고 가는 거예요. 안 급해도 돼요.</p>
        </div>
      </div>

      {selected && <DepthPage card={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StockCardSlide({
  card,
  index,
  total,
  onOpen,
}: {
  card: StockCard;
  index: number;
  total: number;
  onOpen: () => void;
}) {
  const color = changeColor(card.changePct);
  return (
    <div className="flex h-[calc(100vh-180px)] snap-center flex-col justify-center">
      <button
        onClick={onOpen}
        className="flex w-full flex-col rounded-2xl border border-hairline bg-surface px-5 py-6 text-left transition-colors hover:border-muted"
        style={{ borderLeft: `2px solid ${color}` }}
      >
        {/* 로고 + 종목명 + 티커 */}
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full font-pixel text-sm"
            style={{ backgroundColor: `${card.accent}26`, color: card.accent }}
          >
            {card.mono}
          </span>
          <div>
            <p className="text-base font-semibold text-whiteout">{card.name}</p>
            <p className="font-pixel text-[11px] text-muted">{card.ticker}</p>
          </div>
        </div>

        {/* 현재가 + 등락 */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold leading-none text-whiteout">{card.priceText}</span>
        </div>
        <p className="mt-1.5 text-sm" style={{ color }}>
          {changeText(card.changePct)}
        </p>

        {/* 포모 한마디 */}
        <p className="mt-5 text-sm leading-6 text-whiteout">{card.comment}</p>

        {/* 더보기 + 진행 표시 (거래 버튼 없음) */}
        <div className="mt-5 flex items-center justify-between">
          <span className="font-pixel text-[11px] text-muted">더보기 →</span>
          <span className="text-[11px] font-medium text-muted">
            {index + 1} / {total}
          </span>
        </div>
      </button>
      <p className="mt-3 text-center font-pixel text-[10px] text-hairline">↓ 밀어서 다음 종목</p>
    </div>
  );
}

function DepthPage({ card, onClose }: { card: StockCard; onClose: () => void }) {
  const color = changeColor(card.changePct);
  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <div className="mx-auto flex h-full max-w-md flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full font-pixel text-xs"
              style={{ backgroundColor: `${card.accent}26`, color: card.accent }}
            >
              {card.mono}
            </span>
            <div>
              <p className="text-sm font-semibold text-whiteout">{card.name}</p>
              <p className="text-[11px] font-medium" style={{ color }}>
                {card.priceText} · {changeText(card.changePct)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout">
            닫기
          </button>
        </div>

        {/* 뎁스 본문 */}
        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <p className="text-sm leading-6 text-whiteout">{card.comment}</p>

          <section className="mt-7">
            <p className="font-pixel text-sm text-whiteout">{card.depth.whyTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{card.depth.why}</p>
          </section>

          <section className="mt-6">
            <p className="font-pixel text-sm text-whiteout">{card.depth.learnTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{card.depth.learn}</p>
          </section>

          {/* 향후 유료 자리 — 지금은 표시만 (거래 아님) */}
          <div className="mt-8 rounded-xl border border-dashed border-hairline px-4 py-4">
            <p className="font-pixel text-[11px] text-muted">곧 추가될 거예요</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              이 종목 더 깊이 보기 · 관심 종목 모아보기
            </p>
          </div>

          <p className="mt-8 text-center text-[11px] leading-5 text-muted">
            지난 흐름을 친구처럼 풀어준 거예요. 투자 조언이 아니에요.
          </p>
        </div>
      </div>
    </div>
  );
}

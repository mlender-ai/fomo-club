"use client";

import type { QuietWatchItem } from "@/lib/fomoApi";
import { DeckProgress, DeckSkeleton, DeckTitle, WatchShelf } from "@/components/QuietPickDeck";

/**
 * 덱 화면 조각 프리뷰 — DS-02 검증용 픽스처(`e2e/quiet-deck.spec.ts` 가 잰다).
 *
 * ## 왜 조각인가
 *
 * 덱 본체는 발견 API 에 의존한다. 로딩·스테일·12장 초과 같은 상태를 **API 없이** 세워야
 * 게이트가 CI 에서 돈다. 헤더·하단 탭은 `HomeView` 소유이므로 여기서는 그리지 않고,
 * DS-02 §2·§7 은 유닛(소스 스캔)이 지킨다.
 */

const WATCHING: QuietWatchItem[] = [
  {
    subject: { canonical: "빅텍", displayName: "빅텍", naverCode: "065450", market: "KOSDAQ", country: "KR" },
    signal: { kind: "institution_streak", code: "institution_streak", actors: "기관", scale: "74주", days: 27 },
    reasonCode: "aged",
    reasonText: "신호가 시작된 지 27일 지났어요 — 새로 생긴 건 아니에요",
  },
  {
    subject: { canonical: "셀트리온", displayName: "셀트리온", naverCode: "068270", market: "KOSPI", country: "KR" },
    signal: { kind: "foreign_streak", code: "foreign_streak", actors: "외국인", scale: "12만주", days: 9 },
    reasonCode: "crowded",
    reasonText: "코스피 18위라 이미 알려져 있어요",
  },
  {
    subject: { canonical: "저스템", displayName: "저스템", naverCode: "417840", market: "KOSDAQ", country: "KR" },
    signal: { kind: "institution_streak", code: "institution_streak", actors: "기관", scale: "8만주", days: 12 },
    reasonCode: "ran",
    reasonText: "신호 후 이미 57% 올랐어요",
  },
  {
    subject: { canonical: "Gbank Financial", displayName: "Gbank Financial", symbol: "GBFH", market: "NASDAQ", country: "US" },
    signal: { kind: "insider_cluster", code: "insider_cluster", actors: "임원 2명", scale: "$0.4M", days: 14 },
    reasonCode: "duplicate",
    reasonText: "같은 종류 신호가 오늘 덱에 이미 찼어요",
  },
  {
    subject: { canonical: "Apollomics", displayName: "Apollomics", symbol: "APLM", market: "NASDAQ", country: "US" },
    signal: { kind: "insider_cluster", code: "insider_cluster", actors: "임원 3명", scale: "$0.2M", days: 5 },
    reasonCode: "ran",
    reasonText: "신호 후 이미 70% 올랐어요",
  },
  {
    subject: { canonical: "한화에어로스페이스", displayName: "한화에어로스페이스", naverCode: "012450", market: "KOSPI", country: "KR" },
    signal: { kind: "foreign_streak", code: "foreign_streak", actors: "외국인", scale: "3만주", days: 3 },
    reasonCode: "crowded",
    reasonText: "오늘 거래대금 상위권이라 이미 붐볐어요",
  },
];

export default function QuietDeckPreview() {
  return (
    <main className="mx-auto w-full max-w-md bg-ds-bg pb-s6">
      <section data-case="title">
        <div className="px-gutter">
          <DeckTitle count={9} stale={null} />
        </div>
      </section>

      <section data-case="stale">
        <div className="px-gutter">
          <DeckTitle count={9} stale="3시간 전 기준" />
        </div>
      </section>

      <section data-case="dots">
        <p className="px-gutter font-mono text-ds-label text-ds-text-3">점 인디케이터 (9장, 3번째)</p>
        <DeckProgress total={9} index={2} />
      </section>

      <section data-case="counter">
        <p className="mt-s5 px-gutter font-mono text-ds-label text-ds-text-3">12장 초과 → mono 텍스트</p>
        <DeckProgress total={14} index={2} />
      </section>

      <section data-case="skeleton" className="mt-s5">
        <DeckSkeleton />
      </section>

      <section data-case="watching" className="mt-s5">
        <WatchShelf items={WATCHING} onOpen={() => undefined} />
      </section>
    </main>
  );
}

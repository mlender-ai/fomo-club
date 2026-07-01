"use client";

import { useEffect, useState } from "react";
import {
  scoreToColor,
  cleanText,
  cleanQuote,
  communityWordings,
  fomoCardView,
  fomoStateSummary,
  selectFomoHook,
  translateTaFact,
  confidenceGrade,
  sparklinePath,
  seriesIsUp,
  type KeywordCard,
  type FomoTone,
} from "@fomo/core";
import {
  fetchThemeInsight,
  fetchStockInsight,
  fetchStockBasics,
  fetchStockFront,
  recordTaste,
  type CondensedInsight,
  type StockBasics,
  type StockFrontResponse,
} from "@/lib/fomoApi";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { FlickerSpinner } from "@/components/FlickerSpinner";

/**
 * 키워드 뎁스 페이지 — 카드/히스토리에서 공용. KEYWORD_CARD_FEED_DEV_SPEC v3 §3.
 *
 * 데이터 엔진 Track A+B: 카드 탭 시 /api/fomo/theme-insight 를 lazy fetch 해
 * "강세 관점 / 약세 관점 / 사람들 워딩"(원문 grounded 응축)을 보여준다. 출처 링크로 원문 검증 가능.
 * 응축이 아직(로딩)이거나 데이터 부족(insufficient)이면 기존 뉴스 소스(#500)로 정직하게 폴백.
 * 메인 카드·스와이프는 안 건드린다 — 뎁스 콘텐츠만.
 */
export function KeywordDepthPage({ card, onClose }: { card: KeywordCard; onClose: () => void }) {
  const color = scoreToColor(card.fomoScore);
  const [insight, setInsight] = useState<CondensedInsight | null>(null);
  const [loading, setLoading] = useState(true);
  // 숨은 연관주 탭 → 종목 전용 화면(stock-insight 재활용). null 이면 안 띄움.
  const [stockSubject, setStockSubject] = useState<(StockContext & { stock: string }) | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setInsight(null);
    fetchThemeInsight(card.keyword)
      .then((r) => alive && setInsight(r))
      .catch(() => alive && setInsight(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [card.keyword]);

  const hasInsight =
    !!insight && insight.confidence !== "insufficient" && insight.bull.length + insight.bear.length > 0;

  // sourceId → 원문(링크용).
  const srcOf = (id: string) => insight?.sources.find((s) => s.id === id);
  // 출처 종류 정직 표기 — doc.kind 기준(§3-b). kind 가 진실, tier 는 보조.
  const kindLabel = (kind?: string) =>
    kind === "official" ? "공식 데이터" : kind === "community" ? "커뮤니티" : kind === "news" ? "뉴스" : "";

  const evidenceItem = (claim: string, sourceId: string, key: string) => {
    const s = srcOf(sourceId);
    const kl = kindLabel(s?.kind);
    const label = `${s?.source ?? s?.title ?? ""}${kl ? ` · ${kl}` : ""}`;
    return (
      <li key={key} className="rounded-lg border border-hairline bg-surface px-3 py-2">
        <span className="block text-sm leading-5 text-whiteout">{cleanText(claim)}</span>
        {s &&
          (s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-[11px] text-muted hover:text-whiteout"
            >
              ↳ {label} · 원문 보기 →
            </a>
          ) : (
            <span className="mt-1 block text-[11px] text-muted">↳ {label}</span>
          ))}
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <div className="mx-auto flex h-full max-w-md flex-col">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-bold text-whiteout">{card.keyword}</span>
            <span className="text-sm font-semibold" style={{ color }}>
              포모 {card.fomoScore}
            </span>
          </div>
          <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout">
            닫기
          </button>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <p className="text-sm leading-6 text-whiteout">{cleanText(card.comment)}</p>

          {/* 왜 떴나 — LLM insight 를 기다리지 않고 카드 기본 depth 를 먼저 보여준다. */}
          <section className="mt-7">
            <p className="font-pixel text-sm text-whiteout">{card.depth.whyTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{cleanText(card.depth.why)}</p>
          </section>

          {/* 원문 fallback — insight 도착 전에도 먼저 볼 수 있는 카드 소스. */}
          {card.sources.length > 0 && (
            <section className="mt-6">
              <p className="font-pixel text-sm text-whiteout">오늘 이런 뉴스가 돌았어요</p>
              <ul className="mt-2 space-y-2">
                {card.sources.map((s, i) =>
                  s.url ? (
                    <li key={i}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-hairline bg-surface px-3 py-2 transition-colors hover:border-whiteout/30"
                      >
                        <span className="block text-sm leading-5 text-whiteout">{cleanText(s.title)}</span>
                        {s.source && (
                          <span className="mt-0.5 block text-[11px] text-muted">{cleanText(s.source)} · 원문 보기 →</span>
                        )}
                      </a>
                    </li>
                  ) : (
                    <li key={i} className="rounded-lg border border-hairline bg-surface px-3 py-2">
                      <span className="block text-sm leading-5 text-whiteout">{cleanText(s.title)}</span>
                      {s.source && <span className="mt-0.5 block text-[11px] text-muted">{cleanText(s.source)}</span>}
                    </li>
                  )
                )}
              </ul>
            </section>
          )}

          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-pixel text-sm text-whiteout">원문 정리</p>
              {loading ? (
                <span className="text-[11px] text-muted">정리 중</span>
              ) : (
                <span className="text-[11px] text-muted">{hasInsight ? "원문 근거 있음" : "원문 근거 부족"}</span>
              )}
            </div>

            {loading ? (
              <div className="mt-3 flex flex-col items-center gap-2 py-5" aria-busy="true">
                <FlickerSpinner size={32} />
                <p className="text-sm leading-6 text-muted">원문을 정리하는 중이에요…</p>
              </div>
            ) : hasInsight ? (
            <>
              <p className="mt-2 text-sm leading-6 text-muted">{cleanText(insight!.whyHot)}</p>

              {/* 공식 지표(FRED 등) — 강세/약세와 별개의 중립 사실 숫자(C-2). */}
              {insight?.officialFacts && insight.officialFacts.length > 0 && (
                <section className="mt-6">
                  <p className="font-pixel text-sm text-whiteout">공식 지표</p>
                  <ul className="mt-2 space-y-2">
                    {insight.officialFacts.map((f, i) => (
                      <li key={`of-${i}`} className="rounded-lg border border-hairline bg-surface px-3 py-2">
                        <span className="block text-sm leading-5 text-whiteout">{cleanText(f.label)}</span>
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-muted hover:text-whiteout">
                            ↳ {f.source} · 공식 데이터 →
                          </a>
                        ) : (
                          <span className="mt-1 block text-[11px] text-muted">↳ {f.source} · 공식 데이터</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {insight!.lean.bullCount + insight!.lean.bearCount > 0 && (
                <p className="mt-3 text-[11px] leading-5 text-muted">
                  오늘 쏠림 · <span style={{ color: "var(--up, #ff5a5f)" }}>강세 {insight!.lean.bullCount}</span>
                  {" : "}
                  <span style={{ color: "var(--down, #4f8cff)" }}>약세 {insight!.lean.bearCount}</span>
                  {insight!.lean.oneSided ? " · 반대 관점 안 보임" : ""}
                </p>
              )}

              {insight!.singleOutlet && insight!.outlets.length > 0 && (
                <p className="mt-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px] leading-5 text-muted">
                  오늘은 <span className="text-whiteout">{insight!.outlets[0]}</span> 한 곳 기준이에요 — 한 매체 안의 시각일 수 있어요.
                </p>
              )}

              <section className="mt-6">
                <p className="font-pixel text-sm" style={{ color: "var(--up, #ff5a5f)" }}>
                  강세 관점
                </p>
                {insight!.bull.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {insight!.bull.map((p, i) => evidenceItem(p.claim, p.sourceId, `bull-${i}`))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted">원문에서 강세 근거는 안 보였어요.</p>
                )}
              </section>

              <section className="mt-6">
                <p className="font-pixel text-sm" style={{ color: "var(--down, #4f8cff)" }}>
                  약세 관점
                </p>
                {insight!.bear.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {insight!.bear.map((p, i) => evidenceItem(p.claim, p.sourceId, `bear-${i}`))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted">{insight!.stanceNote}</p>
                )}
              </section>

              {communityWordings(insight!).length > 0 && (
                <section className="mt-6">
                  <p className="font-pixel text-sm text-whiteout">사람들 워딩</p>
                  <ul className="mt-2 space-y-2">
                    {communityWordings(insight!).map((w, i) => {
                      const s = srcOf(w.sourceId);
                      return (
                        <li key={`w-${i}`} className="rounded-lg border border-hairline bg-surface px-3 py-2">
                          <span className="block text-sm leading-5 text-whiteout">“{cleanQuote(w.text)}”</span>
                          {s && <span className="mt-1 block text-[11px] text-muted">↳ {cleanText(s.source ?? s.title)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* 숨은 연관주(BM 발굴 엔진) — 대장주 아닌, 이 테마 때문에 같이 움직인 종목.
                  연관 근거(reason)는 원문 grounded claim 그대로. 탭하면 그 종목만 따로 본다(stock-insight 재활용).
                  카피/전환은 임시(광혁 조정 영역). 없으면 섹션 자체를 숨긴다(가짜로 안 채움). */}
              {insight!.relatedStocks.length > 0 && (
                <section className="mt-6">
                  <p className="font-pixel text-sm text-whiteout">같이 움직인 종목</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    대장주 말고, 이 테마 때문에 같이 들썩인 덜 알려진 종목들이에요. 탭하면 그 종목만 따로 볼 수 있어요.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {insight!.relatedStocks.map((r, i) => (
                      <li key={`rel-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            recordTaste("stock", r.stock, "tap_related"); // 트랙 B: 발굴 반응
                            const s = srcOf(r.sourceId); // 연관 근거의 원문(항상 보여줄 맥락)
                            setStockSubject({
                              stock: r.stock,
                              reason: r.reason,
                              fromTheme: card.keyword,
                              ...(s?.source || s?.title ? { sourceLabel: s.source ?? s.title } : {}),
                              ...(s?.url ? { sourceUrl: s.url } : {}),
                            });
                          }}
                          className="block w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-left transition-colors hover:border-whiteout/30"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-pixel text-sm text-whiteout">{cleanText(r.stock)}</span>
                            <span className="shrink-0 text-[11px] text-muted">자세히 →</span>
                          </span>
                          <span className="mt-1 block text-[12px] leading-5 text-muted">{cleanText(r.reason)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <p className="mt-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm leading-6 text-muted">
              원문을 묶어 봤지만 아직 강세·약세로 나눌 만큼 근거가 충분하진 않아요. 위 뉴스와 카드 기본 설명을 먼저 봐주세요.
            </p>
          )}
          </section>

          <section className="mt-6">
            <p className="font-pixel text-sm text-whiteout">{card.depth.rememberTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{card.depth.remember}</p>
          </section>

          <section className="mt-6">
            <p className="text-xs text-muted">다들 이런 것들 봤어요</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {card.related.map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs text-whiteout"
                >
                  {r}
                </span>
              ))}
            </div>
          </section>

          <p className="mt-8 text-center text-[11px] leading-5 text-muted">
            지난 흐름을 친구처럼 풀어드린 거예요. 투자 조언은 아니에요.
          </p>
        </div>
      </div>

      {/* 종목 전용 화면 — 연관주 탭 시 stock-insight(understandStock) 재활용. z-[70] 으로 뎁스 위에 덮는다. */}
      {stockSubject && (
        <StockInsightView stock={stockSubject.stock} context={stockSubject} onClose={() => setStockSubject(null)} />
      )}
    </div>
  );
}

/**
 * 종목 전용 화면 — 숨은 연관주 탭 시. /api/fomo/stock-insight(understandStock #514, 영속 캐시) 를 lazy fetch 해
 * 그 종목의 grounded 강세/약세/워딩/공식지표를 보여준다. 테마 뎁스와 같은 grounding·정직성 규칙을 따른다.
 * (응축 부족이면 정직한 빈 상태 — 가짜로 안 채움.) 카피/전환은 임시, 최종은 광혁.
 */
/** 종목 화면이 "들어온 맥락"(왜 주목 종목으로 떴는지). stock-insight 가 부족해도 이건 항상 보여준다. */
export interface StockContext {
  /** 연관 근거(테마 원문 grounded claim) 또는 합성 사유. */
  reason?: string;
  /** 근거 출처 라벨(매체 등). */
  sourceLabel?: string;
  /** 근거 원문 링크. */
  sourceUrl?: string;
  /** 어느 테마(키워드) 흐름에서 떴는지. */
  fromTheme?: string;
  /** 피드 60장 기준 다축 셀렉터가 고른 카드 헤드라인. 상세에서도 같은 관통선을 유지한다. */
  axisHeadline?: string | undefined;
  /** 발견 덱이 이미 가진 가격·포모·차트 seed. 상세 fetch 실패 시 비어 보이지 않게 한다. */
  frontSeed?: StockFrontResponse | undefined;
  /** 발견 공급 엔진이 가진 네이버 종목 코드. STOCK_VOCAB 미등록 발견주 기본지표 조회용. */
  naverCode?: string | undefined;
  /** US/글로벌 종목 심볼. */
  symbol?: string | undefined;
  market?: string | undefined;
  country?: string | undefined;
}

function hasUsableFront(front: StockFrontResponse | null | undefined): front is StockFrontResponse {
  if (!front) return false;
  return (
    !!front.priceText ||
    !!front.changeText ||
    (front.sparkline?.length ?? 0) >= 2 ||
    Object.keys(front.signals ?? {}).length > 0
  );
}

function mergeFrontSeed(
  seed: StockFrontResponse | null | undefined,
  fresh: StockFrontResponse | null | undefined
): StockFrontResponse | null {
  if (!hasUsableFront(seed)) return fresh ?? null;
  if (!hasUsableFront(fresh)) return seed;
  return {
    signals: { ...seed.signals, ...fresh.signals },
    fomo: fresh.fomo ?? seed.fomo,
    ...(fresh.taFact ?? seed.taFact ? { taFact: fresh.taFact ?? seed.taFact } : {}),
    ...(fresh.ta ?? seed.ta ? { ta: fresh.ta ?? seed.ta } : {}),
    sparkline: fresh.sparkline.length >= 2 ? fresh.sparkline : seed.sparkline,
    ...(fresh.priceText ?? seed.priceText ? { priceText: fresh.priceText ?? seed.priceText } : {}),
    ...(fresh.changeText ?? seed.changeText ? { changeText: fresh.changeText ?? seed.changeText } : {}),
    ...(fresh.changeDir ?? seed.changeDir ? { changeDir: fresh.changeDir ?? seed.changeDir } : {}),
    ...(fresh.feedBull ?? seed.feedBull ? { feedBull: fresh.feedBull ?? seed.feedBull } : {}),
    ...(fresh.feedBear ?? seed.feedBear ? { feedBear: fresh.feedBear ?? seed.feedBear } : {}),
    ...(fresh.axisSignals?.length ? { axisSignals: fresh.axisSignals } : seed.axisSignals?.length ? { axisSignals: seed.axisSignals } : {}),
    ...(fresh.axisHook ?? seed.axisHook ? { axisHook: fresh.axisHook ?? seed.axisHook } : {}),
  };
}

function copyRestates(a: string | undefined, b: string | undefined): boolean {
  const clean = (text: string | undefined) => (text ?? "").replace(/\s+/g, "").replace(/[‘’'".,:·…]/g, "");
  const left = clean(a);
  const right = clean(b);
  return !!left && !!right && (left.includes(right) || right.includes(left));
}

function normalizeChangeText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(/^--+/, "-").replace(/^\+\++/, "+");
}

/**
 * 종목 기본 정보 블록(바닥) — 항상 렌더. 주가·회사개요·시총·핵심지표·연간 재무.
 * "정확한 숫자 + 쉬운 라벨"(EPS→'한 주가 번 돈') 둘 다. 없는 값은 생략(가짜 금지), 추정치·출처 표기.
 */
function StockPriceHeader({ basics, front }: { basics: StockBasics | null; front: StockFrontResponse | null }) {
  const priceText = basics?.priceText ?? front?.priceText;
  const changeText = normalizeChangeText(basics?.changeText ?? front?.changeText);
  const changeDir = basics?.changeDir ?? front?.changeDir;
  if (!basics && !front) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-5 w-2/3 animate-pulse rounded bg-surface" />
        <div className="h-12 w-3/4 animate-pulse rounded bg-surface" />
      </div>
    );
  }
  const up = changeDir === "up";
  const down = changeDir === "down";
  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        {basics?.market && <span>{basics.market}</span>}
        {basics?.sector && <span>{cleanText(basics.sector)}</span>}
        {basics?.marketCap && <span>시총 {basics.marketCap}</span>}
      </div>
      {priceText ? (
        <div className="mt-2">
          <span className="text-[32px] font-bold leading-none text-whiteout">{priceText}</span>
          {changeText && (
            <span className="ml-2 align-baseline text-sm font-medium tabular-nums" style={up || down ? { color: up ? "#ff5a5f" : "#4f8cff" } : undefined}>
              {up ? "▲" : down ? "▼" : ""} {changeText}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted">가격 정보는 아직 연결 중이에요.</p>
      )}
    </section>
  );
}

type BasicMetricView = {
  label: string;
  value: string;
  term?: string;
  note?: string;
};

function formatRatio(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}배`;
}

function frontSignalMetrics(front: StockFrontResponse | null): BasicMetricView[] {
  if (!front) return [];
  const s = front.signals;
  const metrics: BasicMetricView[] = [];
  if (s.marketCapRank) {
    metrics.push({
      label: "시가총액 순위",
      value: `${s.marketCapRank.market ? `${s.marketCapRank.market} ` : ""}${s.marketCapRank.rank}위`,
      term: "시장 내 위치",
    });
  }
  if (typeof s.volumeRatio === "number" && s.volumeRatio > 0) {
    metrics.push({
      label: "거래량",
      value: `평소 ${formatRatio(s.volumeRatio)}`,
      term: "최근 거래",
      note: "최근 거래가 평소보다 얼마나 붙었는지 보는 지표예요.",
    });
  }
  if (typeof s.foreignNetStreak === "number" && s.foreignNetStreak !== 0) {
    metrics.push({
      label: "외국인 수급",
      value: `${Math.abs(s.foreignNetStreak)}일째 ${s.foreignNetStreak > 0 ? "사는 중" : "파는 중"}`,
      term: "KRX",
    });
  }
  if (typeof s.institutionNetStreak === "number" && s.institutionNetStreak !== 0) {
    metrics.push({
      label: "기관 수급",
      value: `${Math.abs(s.institutionNetStreak)}일째 ${s.institutionNetStreak > 0 ? "사는 중" : "파는 중"}`,
      term: "KRX",
    });
  }
  if (typeof s.mentionCount === "number" && s.mentionCount > 0) {
    metrics.push({
      label: "오늘 언급",
      value: `${s.mentionCount.toLocaleString()}건`,
      term: "뉴스·원문",
    });
  }
  if (
    s.themeLabel &&
    typeof s.themeRelativeRank === "number" &&
    typeof s.themePeerCount === "number" &&
    s.themePeerCount > 0
  ) {
    const themeLabel = cleanText(s.themeLabel);
    const themePosition = s.themeRelativeRank <= 1 ? `${themeLabel} 상위 흐름` : `${themeLabel} 동종 흐름`;
    metrics.push({
      label: "테마 안 위치",
      value: themePosition,
      term: "상대 흐름",
      ...(typeof s.themeRelativeChangePct === "number"
        ? { note: `동종 종목 흐름과 비교한 위치예요.` }
        : {}),
    });
  }
  return metrics.slice(0, 6);
}

function StockFundamentalsBlock({ basics, front }: { basics: StockBasics | null; front: StockFrontResponse | null }) {
  const fallbackMetrics = frontSignalMetrics(front);
  const metrics: BasicMetricView[] = basics?.metrics.length ? basics.metrics : fallbackMetrics;
  const hasNaverFundamentals = !!basics?.metrics.length || !!basics?.financials || !!basics?.summary;
  const empty = metrics.length === 0 && !basics?.financials && !basics?.summary;
  return (
    <section>
      <p className="font-pixel text-sm text-whiteout">기본 지표</p>
      {metrics.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {metrics.map((m, i) => (
            <li key={`m-${i}`} className="rounded-lg border border-hairline bg-surface px-3 py-2">
              <span className="block text-[11px] text-muted">
                {m.label}
                {m.term ? <span className="text-muted/70"> · {m.term}</span> : null}
              </span>
              <span className="mt-0.5 block text-sm text-whiteout">{m.value}</span>
              {m.note && <span className="mt-1 block text-[11px] leading-4 text-muted">{m.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {basics?.financials && (
        <div className="mt-5">
          <p className="font-pixel text-sm text-whiteout">실적 흐름</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 text-left font-normal"> </th>
                  {basics.financials.periods.map((p, i) => (
                    <th key={`p-${i}`} className="px-2 py-1 text-right font-normal">
                      {p.title}
                      {p.estimate ? <span className="text-[10px]"> (E)</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {basics.financials.rows.map((r, ri) => (
                  <tr key={`r-${ri}`} className="border-t border-hairline">
                    <td className="py-1.5 text-left text-muted">{r.label}</td>
                    {r.values.map((v, vi) => (
                      <td key={`v-${vi}`} className="px-2 py-1.5 text-right text-whiteout">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {basics.financials.note && (
            <p className="mt-2 text-[12px] leading-5 text-muted">{basics.financials.note}</p>
          )}
          <p className="mt-1 text-[10px] leading-4 text-muted">(E)=컨센서스 추정치 · 출처: 네이버 금융</p>
        </div>
      )}

      {empty && (
        <p className="text-sm leading-6 text-muted">
          이 종목 기본 정보는 아직 연결 전이에요(해외·신규 상장 등). 아래 흐름으로 봐주세요.
        </p>
      )}
    </section>
  );
}

/** 포모 톤 → 색(카드 ②와 동일 매핑, 단일 출처 일관). */
const DETAIL_TONE_COLOR: Record<FomoTone, string> = {
  hot: "#D8FF3A",
  incoming: "#A855F7",
  warming: "#F59E0B",
  calm: "#94A3B8",
  cooling: "#3B82F6",
};

function shortSignalLabel(text: string | undefined, max = 24): string | undefined {
  const cleaned = cleanText(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function stockWatchPoint(front: StockFrontResponse | null): string {
  if (!front) return "";
  const s = front.signals;
  const headline = shortSignalLabel(front.axisHook?.hookText || s.newsEventLabel, 28);
  if (headline && (front.axisHook?.axis === "time" || s.newsEventLabel)) {
    return `‘${headline}’ 이후 거래가 실제로 붙는지 봐요.`;
  }
  const foreign = s.foreignNetStreak ?? 0;
  const institution = s.institutionNetStreak ?? 0;
  const flow = Math.abs(foreign) >= Math.abs(institution)
    ? { actor: "외국인", days: Math.abs(foreign), dir: foreign > 0 ? "매수" : foreign < 0 ? "매도" : "" }
    : { actor: "기관", days: Math.abs(institution), dir: institution > 0 ? "매수" : institution < 0 ? "매도" : "" };
  if (flow.days >= 2 && flow.dir) {
    return `${flow.actor} ${flow.dir}가 하루짜리인지 이어지는지 봐요.`;
  }
  if (typeof s.volumeRatio === "number" && s.volumeRatio >= 1.5) {
    return `평소 ${formatRatio(s.volumeRatio)} 거래가 며칠 이어지는지 봐요.`;
  }
  if (s.themeLabel && typeof s.themeRelativeRank === "number" && typeof s.themePeerCount === "number") {
    return `${cleanText(s.themeLabel)} 종목들 중 달랐던 거래·수급이 이어지는지 봐요.`;
  }
  if (front.changeDir === "up" && front.changeText) {
    return `오늘 오른 가격대에서 거래가 붙는지 봐요.`;
  }
  if (front.changeDir === "down" && front.changeText) {
    return `오늘 하락 뒤에도 수급이 남는지 봐요.`;
  }
  if (front.taFact) {
    return `${translateTaFact(front.taFact)} 흐름이 이어지는지 봐요.`;
  }
  return "새로 확인되는 수급·거래 신호가 있는지 봐요.";
}

/**
 * 포모 상태 히어로(척추 ③ 주인공) — 큰 포모 점수(C) + 라벨 + 근거등급 + 왜(해부).
 * 카드(②)와 *동일 출처*(fetchStockFront 의 FomoScoreResult). 강도 비례 톤, 예측·판정 0.
 */
function FomoHero({ front, rankLabel, headlineOverride }: { front: StockFrontResponse | null; rankLabel?: string; headlineOverride?: string }) {
  if (!front) {
    return <div className="h-24 animate-pulse rounded-xl border border-hairline bg-surface" />;
  }
  const { fomo } = front;
  const hook = selectFomoHook({
    fomo,
    signals: front.signals,
    ...(front.taFact ? { taFact: front.taFact } : {}),
  });
  const view = { ...fomoCardView(fomo), headline: hook.headline };
  view.headline = headlineOverride ?? front.axisHook?.hookText ?? view.headline;
  const tone = DETAIL_TONE_COLOR[view.tone] ?? "#94A3B8";
  const grade = confidenceGrade(fomo.confidence);
  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xs text-muted">포모 상태</span>
        {rankLabel && <span className="font-pixel text-[11px] text-muted">{rankLabel}</span>}
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <span className="font-number text-4xl font-bold leading-none" style={{ color: tone }}>
          {view.scoreText ? fomo.fomoScore : "—"}
        </span>
        <span className="pb-1 text-base font-bold" style={{ color: tone }}>
          {view.emoji && <span aria-hidden>{view.emoji} </span>}
          {view.badge}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-whiteout">{view.headline}</p>
      <span className="mt-3 inline-flex items-center rounded-full border border-hairline px-2.5 py-1 font-pixel text-[11px] text-muted">
        {grade}
      </span>
    </section>
  );
}

/** 상세 미니 차트 — 3개월 종가 + 정직한 상태 한 줄(예측 아님, 현재 상태 묘사). */
function DetailChart({ front }: { front: StockFrontResponse | null }) {
  const series = front?.sparkline ?? [];
  if (series.length < 2) return null;
  const paths = sparklinePath(series, 320, 64);
  if (!paths) return null;
  const up = seriesIsUp(series);
  const stroke = "#D8FF3A"; // 픽셀 차트 단색(브랜드 네온), 등락색 아님
  const lead = (front?.fomo.leadSignal ?? 0) >= 60;
  // 차트가 뒷받침하나 — 현재 상태 묘사만(예측 금지).
  const note = translateTaFact(front?.taFact) ?? (lead && !up
    ? "차트는 아직 안 따라왔어요 — 수급이 가격보다 먼저 움직이는 자리예요."
    : up
      ? "이미 위로 올라온 자리예요(최근 3개월)."
      : "최근 3개월은 차분한 흐름이에요.");
  return (
    <section className="mt-6">
      <p className="font-pixel text-sm text-whiteout">차트 흐름</p>
      <svg viewBox="0 0 320 64" preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-hidden>
        <path d={paths.area} fill={stroke} opacity={0.1} />
        <path d={paths.line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <p className="mt-2 text-sm leading-6 text-muted">{note}</p>
    </section>
  );
}

type ReadPoint = { text: string; source?: string };

const DISCOVERY_REASON_JOINER = " — ";

function splitDiscoveryReason(text: string | undefined): { state?: string; detail?: string } {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || !clean.includes(DISCOVERY_REASON_JOINER)) return {};
  const [rawState, ...rest] = clean.split(DISCOVERY_REASON_JOINER);
  const state = rawState?.trim();
  const detail = rest.join(DISCOVERY_REASON_JOINER).trim();
  if (!state || state.length > 16) return {};
  return {
    state,
    ...(detail ? { detail } : {}),
  };
}

function uniquePoints(points: ReadPoint[]): ReadPoint[] {
  const seen = new Set<string>();
  return points.filter((p) => {
    const key = p.text.replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function signalFromTa(front: StockFrontResponse | null): { side: "bull" | "bear" | "watch"; text: string } | null {
  const fact = front?.taFact;
  if (!fact) return null;
  const text = translateTaFact(fact);
  if (!text) return null;
  if (fact.kind === "ma_bullish" || fact.kind === "macd_bullish" || fact.kind === "near_52w_high") {
    return { side: "bull", text };
  }
  if (
    fact.kind === "ma_bearish" ||
    fact.kind === "macd_bearish" ||
    fact.kind === "rsi_overbought" ||
    fact.kind === "rsi_oversold" ||
    fact.kind === "near_52w_low" ||
    fact.kind === "atr_expanded"
  ) {
    return { side: "bear", text };
  }
  return { side: "watch", text };
}

function buildReadPoints(front: StockFrontResponse | null, insight: CondensedInsight | null) {
  const bull: ReadPoint[] = [];
  const bear: ReadPoint[] = [];
  const watch: ReadPoint[] = [];

  if (insight && insight.confidence !== "insufficient") {
    bull.push(...insight.bull.slice(0, 2).map((p) => ({ text: cleanText(p.claim), source: "원문 근거" })));
    bear.push(...insight.bear.slice(0, 2).map((p) => ({ text: cleanText(p.claim), source: "원문 근거" })));
  }

  if (front) {
    if (front.changeDir === "up" && front.changeText) {
      bull.push({ text: `오늘 가격은 ${normalizeChangeText(front.changeText)} 상승으로 움직였어요.`, source: "가격" });
    }
    if (front.changeDir === "down" && front.changeText) {
      bear.push({ text: `오늘 가격은 ${normalizeChangeText(front.changeText)} 하락으로 움직였어요.`, source: "가격" });
    }
    const ta = signalFromTa(front);
    if (ta?.side === "bull") bull.push({ text: ta.text, source: "차트" });
    if (ta?.side === "bear") bear.push({ text: ta.text, source: "차트" });
    if (ta?.side === "watch") watch.push({ text: ta.text, source: "차트" });

    const { foreignNetStreak, institutionNetStreak } = front.signals;
    if (typeof foreignNetStreak === "number" && foreignNetStreak > 0) {
      bull.push({ text: `외국인이 ${foreignNetStreak}일째 사는 중이에요.`, source: "수급" });
    }
    if (typeof institutionNetStreak === "number" && institutionNetStreak > 0) {
      bull.push({ text: `기관이 ${institutionNetStreak}일째 사는 중이에요.`, source: "수급" });
    }
    if (typeof foreignNetStreak === "number" && foreignNetStreak < 0) {
      bear.push({ text: `외국인이 ${Math.abs(foreignNetStreak)}일째 파는 중이에요.`, source: "수급" });
    }
    if (typeof institutionNetStreak === "number" && institutionNetStreak < 0) {
      bear.push({ text: `기관이 ${Math.abs(institutionNetStreak)}일째 파는 중이에요.`, source: "수급" });
    }
    const dynamicWatchPoint = stockWatchPoint(front);
    if (dynamicWatchPoint) watch.push({ text: dynamicWatchPoint, source: "관전 포인트" });
  }

  return {
    bull: uniquePoints(bull).slice(0, 3),
    bear: uniquePoints(bear).slice(0, 3),
    watch: uniquePoints(watch).slice(0, 2),
  };
}

function readGuideLead(front: StockFrontResponse | null, insight: CondensedInsight | null, context?: StockContext): string {
  const points = buildReadPoints(front, insight);
  if (front?.changeDir === "down" && points.bull.length === 0 && points.bear.length > 0) {
    return "강세로 확정해서 보여주는 카드가 아니에요. 하락 중에도 남아 있는 수급·거래·언급 신호를 확인하는 화면이에요.";
  }
  if (context?.reason) {
    return "카드에서 본 이유를 가격·차트·원문 근거로 나눠 확인해요.";
  }
  if (front && points.bull.length === 0 && points.bear.length === 0) {
    return "아직 강한 근거는 적어요. 확인된 가격·차트·수급만 분리해서 봐요.";
  }
  return front ? fomoStateSummary(front.fomo) : "";
}

function PointList({ title, tone, points, empty }: { title: string; tone: string; points: ReadPoint[]; empty: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-3">
      <p className="font-pixel text-xs" style={{ color: tone }}>
        {title}
      </p>
      {points.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {points.map((p, i) => (
            <li key={`${title}-${i}`} className="text-sm leading-6 text-whiteout">
              <span>{p.text}</span>
              {p.source && <span className="ml-1 text-[11px] text-muted">· {p.source}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted">{empty}</p>
      )}
    </div>
  );
}

function StockReadGuide({
  front,
  insight,
  loading,
  context,
}: {
  front: StockFrontResponse | null;
  insight: CondensedInsight | null;
  loading: boolean;
  context?: StockContext | undefined;
}) {
  const points = buildReadPoints(front, insight);
  const lead = readGuideLead(front, insight, context);
  const hasGrounded = !!insight && insight.confidence !== "insufficient" && insight.bull.length + insight.bear.length > 0;
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-pixel text-sm text-whiteout">오늘 읽는 법</p>
        {loading ? (
          <span className="text-[11px] text-muted">원문 읽는 중…</span>
        ) : (
          <span className="text-[11px] text-muted">{hasGrounded ? "원문 근거 있음" : "원문 근거 부족"}</span>
        )}
      </div>
      {lead && <p className="mt-2 text-sm leading-6 text-muted">{lead}</p>}
      <div className="mt-3 grid gap-2">
        <PointList
          title="강세 쪽 재료"
          tone="var(--up, #ff5a5f)"
          points={points.bull}
          empty="아직 강세 쪽으로 확인된 근거는 적어요."
        />
        <PointList
          title="약세·주의 재료"
          tone="var(--down, #4f8cff)"
          points={points.bear}
          empty="아직 약세·주의 쪽으로 확인된 근거는 적어요."
        />
        {points.watch.length > 0 && (
          <PointList title="다음에 볼 것" tone="#8A8A8A" points={points.watch} empty="" />
        )}
      </div>
    </section>
  );
}

function StockSynthesisBlock({
  front,
  insight,
  contextReason,
  contextSourceLabel,
}: {
  front: StockFrontResponse | null;
  insight: CondensedInsight | null;
  contextReason?: string | undefined;
  contextSourceLabel?: string | undefined;
}) {
  const points = buildReadPoints(front, insight);
  const signalPoints = [...points.bull, ...points.bear, ...points.watch];
  const contextParts = splitDiscoveryReason(contextReason);
  const contextObservation =
    contextParts.detail && !/뒤를 받칠 수급·거래·뉴스는 아직 안 보여요/.test(contextParts.detail)
      ? { text: contextParts.detail, source: "카드 근거" }
      : undefined;
  const observations = uniquePoints([...(contextObservation ? [contextObservation] : []), ...signalPoints]).slice(0, 3);
  if (observations.length === 0 && !contextReason) return null;

  const primary = observations[0];
  const support = primary ? observations.find((p) => !copyRestates(p.text, primary.text)) : undefined;
  const contextSynthesis = contextParts.state
    ? `${contextParts.state} 근거를 먼저 확인하는 화면이에요.`
    : undefined;
  const synthesis =
    contextSynthesis ??
    (support
      ? "서로 다른 확인 신호가 같이 잡혀, 한 가지 숫자만 볼 화면은 아니에요."
      : "확인된 신호를 가격·수급·원문 근거로 나눠 보는 화면이에요.");
  const evidence = uniquePoints(observations)
    .map((p) => p.source)
    .filter((source): source is string => !!source)
    .slice(0, 3);
  const evidenceLines = [
    ...(contextSourceLabel ? [contextSourceLabel] : []),
    ...evidence,
  ].filter((source, index, list) => list.indexOf(source) === index).slice(0, 3);

  return (
    <section className="mt-6 rounded-2xl border border-hairline bg-surface px-4 py-4">
      <p className="font-pixel text-sm text-whiteout">핵심 줄거리</p>
      <div className="mt-3 space-y-3">
        {observations.length > 0 && (
          <div>
            <p className="text-[11px] text-muted">관찰</p>
            <ul className="mt-1 space-y-1">
              {observations.map((p, i) => (
                <li key={`obs-${i}`} className="text-sm leading-6 text-whiteout">
                  {cleanText(p.text)}
                  {p.source && <span className="ml-1 text-[11px] text-muted">· {p.source}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="text-[11px] text-muted">종합</p>
          <p className="mt-1 text-sm leading-6 text-whiteout">{cleanText(synthesis)}</p>
        </div>
        {evidenceLines.length > 0 && (
          <div>
            <p className="text-[11px] text-muted">증명</p>
            <p className="mt-1 text-sm leading-6 text-muted">{cleanText(evidenceLines.join(" / "))}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function StockDepthLoadingBlock() {
  return (
    <section
      className="mt-6 rounded-2xl border border-hairline bg-surface px-4 py-5"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="font-pixel text-sm text-whiteout">페이지 불러오는 중</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        가격·차트·원문 근거를 한 번에 맞춰 불러오고 있어요.
      </p>
      <div className="mt-5 flex justify-center">
        <FlickerSpinner size={36} />
      </div>
    </section>
  );
}

function OfficialFactsBlock({ facts }: { facts: CondensedInsight["officialFacts"] | undefined }) {
  if (!facts || facts.length === 0) return null;
  return (
    <section className="mt-6">
      <p className="font-pixel text-sm text-whiteout">확정 데이터</p>
      <ul className="mt-2 space-y-2">
        {facts.map((f, i) => (
          <li key={`of-${i}`} className="rounded-lg border border-hairline bg-surface px-3 py-2">
            <span className="block text-sm leading-5 text-whiteout">{cleanText(f.label)}</span>
            {f.detail && <span className="mt-1 block text-[11px] leading-4 text-muted">{cleanText(f.detail)}</span>}
            {f.url ? (
              <a href={f.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-muted hover:text-whiteout">
                ↳ {f.source} · 공식 데이터 →
              </a>
            ) : (
              <span className="mt-1 block text-[11px] text-muted">↳ {f.source} · 공식 데이터</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function auditWordings(insight: CondensedInsight | null): string[] {
  if (!insight?.wordingAudit) return [];
  const llm = insight.wordingAudit.filter((w) => w.stage === "llm" && w.kept).map((w) => w.text);
  const rule = insight.wordingAudit.filter((w) => w.stage === "rule" && w.kept).map((w) => w.text);
  const list = llm.length > 0 ? llm : rule;
  return [...new Set(list.map(cleanQuote).filter(Boolean))].slice(0, 3);
}

function CommunityWordingBlock({ insight }: { insight: CondensedInsight | null }) {
  const grounded = insight ? communityWordings(insight).map((w) => cleanQuote(w.text)) : [];
  const words = grounded.length > 0 ? grounded : auditWordings(insight);
  if (words.length === 0) return null;
  return (
    <section className="mt-6">
      <p className="font-pixel text-sm text-whiteout">사람들 워딩</p>
      <ul className="mt-2 space-y-2">
        {words.map((w, i) => (
          <li key={`cw-${i}`} className="rounded-lg border border-hairline bg-surface px-3 py-2">
            <span className="block text-sm leading-6 text-whiteout">“{w}”</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 뎁스 2탭 바 — 왜 움직였나(재료·수급) / 차트분석(TA). 기본 '왜 움직였나'. */
function DepthTabBar({ tab, onChange }: { tab: "why" | "ta"; onChange: (t: "why" | "ta") => void }) {
  const tabs: Array<{ key: "why" | "ta"; label: string }> = [
    { key: "why", label: "왜 움직였나" },
    { key: "ta", label: "차트분석" },
  ];
  return (
    <div className="mt-6 mb-5 flex gap-1 rounded-full border border-hairline bg-surface p-1" role="tablist">
      {tabs.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className="flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: active ? "#D8FF3A" : "transparent",
              color: active ? "#0a0a0a" : "#94a3b8",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const TA_ROLE_GROUPS: Array<{ role: "event" | "balance" | "confirmation"; label: string }> = [
  { role: "event", label: "추세·모멘텀" },
  { role: "balance", label: "균형·경계" },
  { role: "confirmation", label: "보조 확인" },
];

/**
 * 차트분석(TA) 탭 — 엔진(technical-analysis.ts)이 관측한 사실을 role 별로 그대로 노출.
 * 추천·예측성 문구 추가 금지(관측 서술만 노출). facts 0개면 정직한 빈 상태.
 * 데이터 부족 지표(MA120·52주)는 엔진이 이미 스킵하므로 여기선 자연히 안 뜬다.
 */
function ChartAnalysisTab({ ta, basisDays }: { ta?: StockFrontResponse["ta"]; basisDays: number }) {
  const facts = ta?.facts ?? [];
  if (facts.length === 0) {
    return (
      <section className="mt-2">
        {basisDays > 0 && (
          <p className="mb-3 text-[11px] text-muted">최근 {basisDays}거래일 종가·거래량 기준</p>
        )}
        <div className="rounded-lg border border-hairline bg-surface px-3 py-5 text-center">
          <p className="text-sm leading-6 text-muted">차트에서 두드러진 신호는 아직 없어요.</p>
          <p className="mt-1 text-[11px] leading-5 text-muted">데이터가 더 쌓이면 지표가 여기에 붙어요.</p>
        </div>
        <p className="mt-4 text-center text-[11px] leading-5 text-muted">차트에서 관측되는 사실이에요 · 매수·매도 판단은 아니에요.</p>
      </section>
    );
  }
  return (
    <section className="mt-2">
      {basisDays > 0 && (
        <p className="mb-3 text-[11px] text-muted">최근 {basisDays}거래일 종가·거래량 기준</p>
      )}
      <div className="space-y-4">
        {TA_ROLE_GROUPS.map(({ role, label }) => {
          const rows = facts.filter((f) => f.role === role);
          if (rows.length === 0) return null;
          return (
            <div key={role}>
              <p className="font-pixel text-sm text-whiteout">{label}</p>
              <ul className="mt-2 space-y-2">
                {rows.map((f, i) => (
                  <li key={`${role}-${i}`} className="rounded-lg border border-hairline bg-surface px-3 py-2">
                    <span className="block text-sm leading-6 text-whiteout">{f.text}</span>
                    {f.confidence === "low" && (
                      <span className="mt-1 block text-[11px] leading-4 text-muted">참고 신호(신뢰도 낮음)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-center text-[11px] leading-5 text-muted">차트에서 관측되는 사실이에요 · 매수·매도 판단은 아니에요.</p>
    </section>
  );
}

export function StockInsightView({
  stock,
  context,
  onClose,
}: {
  stock: string;
  context?: StockContext;
  onClose: () => void;
}) {
  const [insight, setInsight] = useState<CondensedInsight | null>(null);
  const [loading, setLoading] = useState(true);
  // 기본 정보(바닥) — 원문 무관 객관 사실. 빠른 네이버 fetch라 해석(LLM)과 분리해 먼저 깐다.
  const [basics, setBasics] = useState<StockBasics | null>(null);
  const [basicsLoaded, setBasicsLoaded] = useState(false);
  // 포모 상태(히어로) — 카드(②)와 동일 출처(FomoScoreResult). 단일 출처 보장.
  const [front, setFront] = useState<StockFrontResponse | null>(context?.frontSeed ?? null);
  const [frontLoaded, setFrontLoaded] = useState(!!context?.frontSeed);
  // 뎁스 2탭 — 기본 '왜 움직였나'. 종목 바뀌면 리셋.
  const [depthTab, setDepthTab] = useState<"why" | "ta">("why");
  // 종목 관심(C) — 명시적 취향 입력. 진입 자체도 암묵 신호(view_depth)로 적재됨.
  const [watched, setWatchedState] = useState(false);

  useEffect(() => {
    setWatchedState(isWatched(stock));
    setDepthTab("why");
  }, [stock]);

  const toggleWatched = () => {
    const now = toggleWatch(stock, Date.now(), {
      ...(context?.fromTheme ? { sector: context.fromTheme } : {}),
      ...(context?.reason ? { reason: context.reason } : {}),
    });
    setWatchedState(now);
    recordTaste("stock", stock, now ? "more" : "less"); // 서버 취향 신호(트랙 B 재사용)
  };

  useEffect(() => {
    let alive = true;
    const seed = context?.frontSeed ?? null;
    setLoading(true);
    setInsight(null);
    setBasics(null);
    setFront(seed);
    setBasicsLoaded(false);
    setFrontLoaded(!!seed);
    // 가격 헤더만 먼저 허용하고, 아래 가변 섹션은 세 요청이 모두 끝난 뒤 한 번에 연다.
    fetchStockFront(stock, {
      ...(context?.naverCode ? { naverCode: context.naverCode } : {}),
      ...(context?.symbol ? { symbol: context.symbol } : {}),
    })
      .then((r) => alive && setFront(mergeFrontSeed(seed, r)))
      .catch(() => alive && setFront(seed))
      .finally(() => alive && setFrontLoaded(true));
    fetchStockBasics(stock, context?.naverCode ? { naverCode: context.naverCode } : {})
      .then((r) => alive && setBasics(r))
      .catch(() => alive && setBasics(null))
      .finally(() => alive && setBasicsLoaded(true));
    fetchStockInsight(stock, {
      ...(context?.naverCode ? { naverCode: context.naverCode } : {}),
      ...(context?.symbol ? { symbol: context.symbol } : {}),
      ...(context?.market ? { market: context.market } : {}),
      ...(context?.country ? { country: context.country } : {}),
    })
      .then((r) => alive && setInsight(r))
      .catch(() => alive && setInsight(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [stock, context?.frontSeed, context?.naverCode, context?.symbol, context?.market, context?.country]);

  const hasInsight =
    !!insight && insight.confidence !== "insufficient" && insight.bull.length + insight.bear.length > 0;
  const detailsReady = !loading && basicsLoaded && frontLoaded;
  const contextReason =
    context?.reason && !copyRestates(context.reason, context.axisHeadline)
      ? context.reason
      : undefined;
  const hasVerifiedFloor = !!(
    basics?.marketCap ||
    (basics?.metrics?.length ?? 0) > 0 ||
    front?.priceText ||
    (front?.sparkline?.length ?? 0) >= 2
  );
  const showThinSourceFootnote =
    !hasInsight && !insight?.officialFacts?.length && auditWordings(insight).length === 0;

  return (
    <div className="fixed inset-0 z-[70] bg-black">
      <div className="mx-auto flex h-full max-w-md flex-col">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout" aria-label="뒤로">
              ← 뒤로
            </button>
            <span className="text-lg font-bold text-whiteout">{cleanText(stock)}</span>
          </div>
          <button
            onClick={toggleWatched}
            aria-label={watched ? "관심 해제" : "관심 등록"}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
            style={{
              borderColor: watched ? "#D8FF3A" : "var(--hairline, #2a2a2a)",
              color: watched ? "#D8FF3A" : "#94a3b8",
            }}
          >
            <span aria-hidden>{watched ? "♥" : "♡"}</span>
            {watched ? "관심" : "관심"}
          </button>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          {/* B — "왜 너한테 보여줬나" 상단 한 줄(추천 맥락이 있으면). 납득 먼저. */}
          {contextReason && (
            <div className="mb-5 rounded-lg border border-hairline bg-surface px-3 py-2">
              <span className="block text-[11px] text-muted">
                {context?.fromTheme ? `‘${cleanText(context.fromTheme)}’ 흐름에서 보여주는 이유` : "보여주는 이유"}
              </span>
              <span className="mt-1 block text-sm leading-6 text-whiteout">{cleanText(contextReason)}</span>
              {context?.sourceUrl && (
                <a href={context.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-muted hover:text-whiteout">
                  ↳ {cleanText(context.sourceLabel ?? "원문")} · 원문 보기 →
                </a>
              )}
            </div>
          )}

          {/* 가격 먼저 — 일반 주식 상세 화면의 첫 독해 지점. */}
          <StockPriceHeader basics={basics} front={front} />

          {!detailsReady ? (
            <StockDepthLoadingBlock />
          ) : (
          <>
          <DepthTabBar tab={depthTab} onChange={setDepthTab} />
          {depthTab === "ta" ? (
            <ChartAnalysisTab ta={front?.ta} basisDays={front?.sparkline?.length ?? 0} />
          ) : (
          <>
          {/* 차트 — 가격 다음으로 현재 흐름을 확인. */}
          <DetailChart front={front} />

          <StockSynthesisBlock
            front={front}
            insight={insight}
            contextReason={contextReason}
            contextSourceLabel={context?.sourceLabel}
          />

          {/* 핵심 해석 — 강세/약세 원문이 부족해도 가격·차트·수급으로 읽을 재료를 먼저 보여준다. */}
          <StockReadGuide front={front} insight={insight} loading={false} context={context} />

          {/* 포모 상태 — 카드와 같은 단일 출처지만, 상세의 첫 주인공은 가격/차트가 담당. */}
          <div className="mt-6">
            <FomoHero
              front={front}
              {...(context?.axisHeadline ? { headlineOverride: context.axisHeadline } : {})}
              {...(front?.signals.marketCapRank ? { rankLabel: `시총 ${front.signals.marketCapRank.rank}위` } : {})}
            />
          </div>

          {/* 원문/공식 데이터 — 있으면 보여주고, 없으면 위 '오늘 읽는 법'에서 부족 상태를 이미 설명한다. */}
          {hasInsight && (
            <section className="mt-6">
              <p className="font-pixel text-sm text-whiteout">원문 요약</p>
              <p className="mt-2 text-sm leading-6 text-muted">{cleanText(insight!.whyHot)}</p>
              {insight!.lean.bullCount + insight!.lean.bearCount > 0 && (
                <p className="mt-2 text-[11px] leading-5 text-muted">
                  원문 쏠림 · <span style={{ color: "var(--up, #ff5a5f)" }}>강세 {insight!.lean.bullCount}</span>
                  {" : "}
                  <span style={{ color: "var(--down, #4f8cff)" }}>약세 {insight!.lean.bearCount}</span>
                  {insight!.lean.oneSided ? " · 반대 관점 안 보임" : ""}
                </p>
              )}
              {insight!.singleOutlet && insight!.outlets.length > 0 && (
                <p className="mt-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px] leading-5 text-muted">
                  오늘은 <span className="text-whiteout">{insight!.outlets[0]}</span> 한 곳 기준이에요.
                </p>
              )}
            </section>
          )}

          <OfficialFactsBlock facts={insight?.officialFacts} />
          <CommunityWordingBlock insight={insight} />

          <div className="mt-7">
            <StockFundamentalsBlock basics={basics} front={front} />
          </div>

          {showThinSourceFootnote && (
            <p className="mt-5 text-[12px] leading-5 text-muted">
              {hasVerifiedFloor
                ? "원문 기반 요약은 아직 얇아요."
                : "이 종목으로 모인 원문은 아직 적어요. 확인된 자료가 들어오면 이 화면에 붙어요."}
            </p>
          )}

          {/* 회사가 뭐 하는 곳 — 맨 아래 한 줄로 강등(긴 blurb 폐기). */}
          {basics?.summary && (
            <p className="mt-8 border-t border-hairline pt-4 text-[12px] leading-5 text-muted">
              <span className="text-muted/70">회사 </span>
              {cleanText(basics.summary).split(/[.\n]/)[0]}
            </p>
          )}

          <p className="mt-6 text-center text-[11px] leading-5 text-muted">
            원문을 친구처럼 풀어드린 거예요. 투자 조언은 아니에요.
          </p>
          </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

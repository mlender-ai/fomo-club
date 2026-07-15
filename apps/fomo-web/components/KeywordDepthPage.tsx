"use client";

import { useEffect, useMemo, useState } from "react";
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
  type DailyOhlcv,
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
import { describe52wGap, describeRsi } from "@/lib/depthCopy";
import { discoveryStatus, verdictBalance } from "@/lib/discoveryPresentation";
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
    ...(fresh.candles?.length ? { candles: fresh.candles } : seed.candles?.length ? { candles: seed.candles } : {}),
    sparkline: fresh.sparkline.length >= 2 ? fresh.sparkline : seed.sparkline,
    ...(fresh.priceText ?? seed.priceText ? { priceText: fresh.priceText ?? seed.priceText } : {}),
    ...(fresh.changeText ?? seed.changeText ? { changeText: fresh.changeText ?? seed.changeText } : {}),
    ...(fresh.changeDir ?? seed.changeDir ? { changeDir: fresh.changeDir ?? seed.changeDir } : {}),
    ...(fresh.feedBull ?? seed.feedBull ? { feedBull: fresh.feedBull ?? seed.feedBull } : {}),
    ...(fresh.feedBear ?? seed.feedBear ? { feedBear: fresh.feedBear ?? seed.feedBear } : {}),
    ...(fresh.axisSignals?.length ? { axisSignals: fresh.axisSignals } : seed.axisSignals?.length ? { axisSignals: seed.axisSignals } : {}),
    ...(fresh.axisHook ?? seed.axisHook ? { axisHook: fresh.axisHook ?? seed.axisHook } : {}),
    // 판단 층 단일 진실(WO 1.5 A) — 카드(seed)의 verdict 우선. 카드=뎁스 stance 모순 금지.
    ...(seed.verdict ?? fresh.verdict ? { verdict: seed.verdict ?? fresh.verdict } : {}),
    // 차트 시리즈(WO 1.6 D)는 non-lite 응답(fresh)에만 실린다.
    ...(fresh.chartSeries ?? seed.chartSeries ? { chartSeries: fresh.chartSeries ?? seed.chartSeries } : {}),
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
  if (typeof s.volumeRatio === "number" && s.volumeRatio >= 0.1) {
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

type MovementRange = "1m" | "3m";
type ChartTooltip = { title: string; body: string };

const DETAIL_CHART = {
  W: 320,
  PRICE_H: 170,
  VOL_TOP: 180,
  VOL_H: 42,
  H: 228,
  up: "#22C55E",
  down: "#EF4444",
  wick: "rgba(250,250,250,0.54)",
  grid: "rgba(255,255,255,0.08)",
  muted: "rgba(255,255,255,0.40)",
  ma20: "#F59E0B",
  ma60: "#60A5FA",
  ma120: "#A78BFA",
  invalidation: "#F59E0B",
  flow: "#60A5FA",
} as const;

function finiteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatChartPrice(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString("ko-KR");
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function formatAxisPrice(value: number): string {
  if (value >= 100_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatChartPrice(value);
}

function smaValues(candles: readonly DailyOhlcv[], period: number): Array<number | null> {
  const closes = candles.map((c) => c.close);
  return closes.map((_, i) =>
    i + 1 >= period ? closes.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period : null
  );
}

function seriesPath(values: Array<number | null>, x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((value, i) => {
    if (value === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`;
    pen = true;
  });
  return d;
}

function swingLevels(candles: readonly DailyOhlcv[]): Array<{ kind: "support" | "resistance"; value: number }> {
  if (candles.length < 12) return [];
  const pivots: Array<{ kind: "support" | "resistance"; value: number; index: number; score: number }> = [];
  const window = 2;
  for (let i = window; i < candles.length - window; i += 1) {
    const c = candles[i]!;
    const before = candles.slice(i - window, i);
    const after = candles.slice(i + 1, i + 1 + window);
    const highPivot = [...before, ...after].every((p) => c.high >= p.high);
    const lowPivot = [...before, ...after].every((p) => c.low <= p.low);
    if (highPivot) pivots.push({ kind: "resistance", value: c.high, index: i, score: c.high - Math.min(...before.map((p) => p.low), ...after.map((p) => p.low)) });
    if (lowPivot) pivots.push({ kind: "support", value: c.low, index: i, score: Math.max(...before.map((p) => p.high), ...after.map((p) => p.high)) - c.low });
  }
  const lastClose = candles[candles.length - 1]!.close;
  const picked: Array<{ kind: "support" | "resistance"; value: number }> = [];
  for (const kind of ["support", "resistance"] as const) {
    const candidates = pivots
      .filter((p) => p.kind === kind && (kind === "support" ? p.value <= lastClose * 1.03 : p.value >= lastClose * 0.97))
      .sort((a, b) => b.index - a.index || b.score - a.score);
    for (const p of candidates) {
      if (picked.filter((x) => x.kind === kind).length >= 2) break;
      if (picked.some((x) => Math.abs(x.value / p.value - 1) < 0.015)) continue;
      picked.push({ kind, value: p.value });
    }
  }
  return picked.slice(0, 3);
}

function volumeSignals(candles: readonly DailyOhlcv[]): {
  spikes: Set<number>;
  vacuums: Array<{ start: number; end: number }>;
} {
  const spikes = new Set<number>();
  const vacuums: Array<{ start: number; end: number }> = [];
  let vacuumStart: number | null = null;
  candles.forEach((c, i) => {
    const prev = candles.slice(Math.max(0, i - 20), i).map((p) => p.volume).filter((v) => v > 0);
    const avg = prev.length >= 5 ? prev.reduce((a, b) => a + b, 0) / prev.length : undefined;
    const isSpike = finiteNumber(avg) && c.volume > 0 && c.volume >= avg * 1.8;
    const isVacuum = finiteNumber(avg) && c.volume > 0 && c.volume <= avg * 0.45;
    if (isSpike) spikes.add(i);
    if (isVacuum) {
      if (vacuumStart === null) vacuumStart = i;
    } else if (vacuumStart !== null) {
      if (i - vacuumStart >= 3) vacuums.push({ start: vacuumStart, end: i - 1 });
      vacuumStart = null;
    }
  });
  if (vacuumStart !== null && candles.length - vacuumStart >= 3) vacuums.push({ start: vacuumStart, end: candles.length - 1 });
  return { spikes, vacuums };
}

function markerDateLabel(candle: DailyOhlcv | undefined): string {
  const raw = candle?.date;
  if (!raw) return "최근 거래일";
  if (/^\d{8}$/.test(raw)) return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
  return raw.slice(5, 10) || raw;
}

function movementTrigger(
  front: StockFrontResponse | null,
  insight: CondensedInsight | null,
  context: StockContext | undefined
): string | undefined {
  if (insight && insight.confidence !== "insufficient" && insight.whyHot.trim()) return cleanText(insight.whyHot);
  const material = front?.signals.newsEventLabel ?? (front?.axisHook?.axis === "time" ? front.axisHook.hookText : undefined);
  return cleanText(material ?? context?.reason ?? "") || undefined;
}

function movementFacts(front: StockFrontResponse | null): ChartTooltip[] {
  if (!front) return [];
  const facts: ChartTooltip[] = [];
  if (front.changeText) {
    facts.push({
      title: "가격 반응",
      body: `오늘 ${front.changeDir === "up" ? "상승" : front.changeDir === "down" ? "하락" : "보합"} ${normalizeChangeText(front.changeText)}`,
    });
  }
  if (finiteNumber(front.signals.volumeRatio) && front.signals.volumeRatio >= 0.1) {
    facts.push({
      title: "거래 참여",
      body: `오늘 거래량은 최근 20일 평균의 ${front.signals.volumeRatio.toFixed(1)}배예요.`,
    });
  }
  const flow = [
    { actor: "외국인", days: front.signals.foreignNetStreak ?? 0 },
    { actor: "기관", days: front.signals.institutionNetStreak ?? 0 },
  ].sort((a, b) => Math.abs(b.days) - Math.abs(a.days))[0];
  if (flow && flow.days !== 0) {
    facts.push({
      title: "수급 동행",
      body: `${flow.actor}이 ${Math.abs(flow.days)}거래일 연속 ${flow.days > 0 ? "순매수" : "순매도"}했어요.`,
    });
  }
  return facts.slice(0, 3);
}

/** 발견 이유 — 선택 기간의 가격·거래량을 정직하게 보여준다. 임의의 사건 반응 기간을 만들지 않는다. */
function MovementResponseChart({ front }: { front: StockFrontResponse | null }) {
  const [range, setRange] = useState<MovementRange>("1m");
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const sourceCandles = useMemo(() => {
    return front?.candles?.filter((c) =>
      [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)
    ) ?? [];
  }, [front?.candles]);

  const candles = useMemo(() => sourceCandles.slice(-(range === "1m" ? 22 : 66)), [sourceCandles, range]);
  if (candles.length < 2) return null;

  const W = DETAIL_CHART.W;
  const PLOT_W = 278;
  const PRICE_H = DETAIL_CHART.PRICE_H;
  const VOL_TOP = DETAIL_CHART.VOL_TOP;
  const VOL_H = DETAIL_CHART.VOL_H;
  const H = DETAIL_CHART.H;
  const priceValues = candles.flatMap((c) => [c.high, c.low]);
  const minRaw = Math.min(...priceValues);
  const maxRaw = Math.max(...priceValues);
  const pad = Math.max((maxRaw - minRaw) * 0.08, maxRaw * 0.005);
  const min = minRaw - pad;
  const max = maxRaw + pad;
  const span = max - min || 1;
  const x = (i: number) => (i / (candles.length - 1)) * PLOT_W;
  const y = (v: number) => 6 + (1 - (v - min) / span) * (PRICE_H - 12);
  const step = PLOT_W / Math.max(1, candles.length - 1);
  const bodyW = Math.max(2, Math.min(range === "1m" ? 8 : 4.8, step * 0.58));
  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const latest = candles[candles.length - 1];
  const rangeBase = candles[0]!.open;
  const rangePct = rangeBase > 0 ? ((latest!.close / rangeBase) - 1) * 100 : 0;
  const rangeColor = rangePct >= 0 ? DETAIL_CHART.up : DETAIL_CHART.down;
  const rangeLabel = range === "1m" ? "1개월" : "3개월";
  const priceTicks = [maxRaw, (maxRaw + minRaw) / 2, minRaw];

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-pixel text-sm text-whiteout">가격 흐름</p>
          <p className="mt-1 text-[11px] text-muted">선택한 기간의 가격과 거래 참여를 함께 봐요.</p>
        </div>
        <div className="flex rounded-full border border-hairline bg-surface p-0.5">
          {(["1m", "3m"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setRange(key);
                setTooltip(null);
              }}
              className="rounded-full px-2.5 py-1 font-pixel text-[10px]"
              style={{ backgroundColor: range === key ? "#D8FF3A" : "transparent", color: range === key ? "#0A0A0A" : "#9A9A96" }}
            >
              {key === "1m" ? "1개월" : "3개월"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-3 rounded-lg border border-white/15 bg-[#050706] px-3 py-3 shadow-inner">
        <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
          <span className="font-pixel text-[10px] text-muted">{rangeLabel} · {markerDateLabel(latest)}</span>
          <span className="font-number text-xs font-bold" style={{ color: rangeColor }}>
            {rangePct >= 0 ? "+" : ""}{rangePct.toFixed(1)}%
          </span>
        </div>
        <div className="mb-2 grid grid-cols-4 gap-2 text-[9px] text-muted">
          <span>O <b className="text-whiteout">{formatAxisPrice(latest!.open)}</b></span>
          <span>H <b className="text-whiteout">{formatAxisPrice(latest!.high)}</b></span>
          <span>L <b className="text-whiteout">{formatAxisPrice(latest!.low)}</b></span>
          <span>C <b style={{ color: latest!.close >= latest!.open ? DETAIL_CHART.up : DETAIL_CHART.down }}>{formatAxisPrice(latest!.close)}</b></span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="최근 가격·거래량 반응 차트">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line key={ratio} x1="0" x2={PLOT_W} y1={PRICE_H * ratio} y2={PRICE_H * ratio} stroke={DETAIL_CHART.grid} />
          ))}
          <line x1="0" x2={PLOT_W} y1={PRICE_H} y2={PRICE_H} stroke="rgba(255,255,255,0.16)" />
          <line
            x1="0"
            x2={PLOT_W}
            y1={y(latest!.close)}
            y2={y(latest!.close)}
            stroke={rangeColor}
            strokeWidth="0.8"
            strokeDasharray="2 3"
          />
          {priceTicks.map((price) => (
            <text key={price} x={PLOT_W + 6} y={Math.max(8, Math.min(PRICE_H - 2, y(price) + 3))} fontSize="7.5" fill={DETAIL_CHART.muted}>
              {formatAxisPrice(price)}
            </text>
          ))}
          {candles.map((c, i) => {
            const cx = x(i);
            const h = maxVol > 0 ? (c.volume / maxVol) * VOL_H : 0;
            const isUp = c.close >= c.open;
            const fill = isUp ? "rgba(34,197,94,0.34)" : "rgba(239,68,68,0.28)";
            return (
              <rect
                key={`vol-${i}`}
                x={cx - bodyW / 2}
                y={VOL_TOP + (VOL_H - h)}
                width={bodyW}
                height={Math.max(0.5, h)}
                fill={fill}
              />
            );
          })}
          {candles.map((c, i) => {
            const cx = x(i);
            const isUp = c.close >= c.open;
            const color = isUp ? DETAIL_CHART.up : DETAIL_CHART.down;
            const top = y(Math.max(c.open, c.close));
            const bottom = y(Math.min(c.open, c.close));
            return (
              <g key={`c-${i}`}>
                <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={DETAIL_CHART.wick} strokeWidth="0.9" />
                <rect x={cx - bodyW / 2} y={top} width={bodyW} height={Math.max(1.2, bottom - top)} rx="0.7" fill={color} />
              </g>
            );
          })}
          <rect x={PLOT_W + 1} y={Math.max(1, Math.min(PRICE_H - 16, y(latest!.close) - 8))} width="40" height="16" rx="2" fill={rangeColor} />
          <text x={PLOT_W + 38} y={Math.max(12, Math.min(PRICE_H - 5, y(latest!.close) + 3))} textAnchor="end" fontSize="7.5" fontWeight="700" fill="#050706">
            {formatAxisPrice(latest!.close)}
          </text>
        </svg>
        {tooltip && (
          <button
            type="button"
            onClick={() => setTooltip(null)}
            className="absolute left-3 right-3 top-3 z-10 rounded-xl border border-whiteout/15 bg-black/90 px-3 py-2.5 text-left shadow-2xl backdrop-blur"
          >
            <span className="block text-[11px] font-bold text-whiteout">{tooltip.title}</span>
            <span className="mt-1 block text-[11px] leading-4 text-muted">{tooltip.body}</span>
          </button>
        )}
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted">
          <span>{markerDateLabel(candles[0])}</span>
          <button
            type="button"
            onClick={() => setTooltip({
              title: `${rangeLabel} 가격 변화`,
              body: `${markerDateLabel(candles[0])} 시작가 ${formatChartPrice(rangeBase)}에서 ${markerDateLabel(latest)} 종가 ${formatChartPrice(latest!.close)}까지 ${rangePct >= 0 ? "+" : ""}${rangePct.toFixed(1)}% 차이가 났어요.`,
            })}
            className="rounded-md border border-hairline px-2 py-1 text-whiteout"
          >
            기간 변화 자세히
          </button>
          <span>{markerDateLabel(latest)}</span>
        </div>
      </div>
    </section>
  );
}

function WhyMovementTab({
  front,
  insight,
  context,
}: {
  front: StockFrontResponse | null;
  insight: CondensedInsight | null;
  context?: StockContext | undefined;
}) {
  const trigger = movementTrigger(front, insight, context);
  const facts = movementFacts(front);
  const [selectedFact, setSelectedFact] = useState<ChartTooltip | null>(null);
  const sources = insight?.sources.filter((source) => source.url).slice(0, 2) ?? [];

  return (
    <section className="mt-2">
      <div className="rounded-xl border border-hairline bg-surface px-4 py-4">
        <p className="text-[11px] font-bold text-muted">확인된 계기</p>
        <p className="mt-2 text-sm leading-6 text-whiteout">
          {trigger ?? "가격 움직임과 직접 연결된 뉴스·공시 근거는 아직 확인되지 않았어요."}
        </p>
        {sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-hairline pt-3">
            {sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="text-[11px] text-muted hover:text-whiteout">
                {cleanText(source.source ?? source.title)} 원문 →
              </a>
            ))}
          </div>
        )}
      </div>

      <MovementResponseChart front={front} />

      {facts.length > 0 && (
        <div className="mt-4 rounded-xl border border-hairline bg-surface px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-pixel text-sm text-whiteout">오늘 함께 확인된 신호</p>
            <span className="text-[11px] text-muted">탭해서 수치 보기</span>
          </div>
          <div
            className="mt-3 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}
          >
            {facts.map((fact) => (
              <button
                key={fact.title}
                type="button"
                onClick={() => setSelectedFact(selectedFact?.title === fact.title ? null : fact)}
                className="min-w-0 rounded-lg border border-hairline bg-black/20 px-2 py-2.5 text-left transition-colors hover:border-whiteout/25"
              >
                <span className="block text-[10px] text-muted">{fact.title}</span>
                <span className="mt-1 block truncate text-xs font-bold text-whiteout">{shortSignalLabel(fact.body, 13)}</span>
              </button>
            ))}
          </div>
          {selectedFact && (
            <button
              type="button"
              onClick={() => setSelectedFact(null)}
              className="mt-3 w-full rounded-lg border border-whiteout/15 bg-black/80 px-3 py-2.5 text-left shadow-xl"
            >
              <span className="block text-[11px] font-bold text-whiteout">{selectedFact.title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{selectedFact.body}</span>
            </button>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-5 text-muted">
        확인된 재료와 선택한 기간의 가격 흐름을 나란히 보여줘요. 둘 사이의 인과를 추정해 붙이지 않아요.
      </p>
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

/** 뎁스 2탭 바 — 발견 이유(재료·수급) / 차트 보기(TA). 기본은 발견 이유. */
function DepthTabBar({ tab, onChange }: { tab: "why" | "ta"; onChange: (t: "why" | "ta") => void }) {
  const tabs: Array<{ key: "why" | "ta"; label: string }> = [
    { key: "why", label: "발견 이유" },
    { key: "ta", label: "차트 보기" },
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

function DiscoveryOverview({
  front,
  insight,
  context,
}: {
  front: StockFrontResponse | null;
  insight: CondensedInsight | null;
  context?: StockContext | undefined;
}) {
  const status = discoveryStatus(front?.fomo);
  const balance = verdictBalance(front?.verdict);
  const trigger = movementTrigger(front, insight, context);
  const asOf = front?.fomo.asOf;
  const source = context?.sourceLabel ?? front?.signals.newsEventSource;
  const chips = [
    finiteNumber(front?.signals.volumeRatio) && front.signals.volumeRatio >= 0.1
      ? `거래량 ${front.signals.volumeRatio.toFixed(1)}배`
      : undefined,
    front?.changeText ? `오늘 ${normalizeChangeText(front.changeText)}` : undefined,
    balance?.label,
  ].filter((item): item is string => !!item);

  return (
    <section className="mt-5 border-y border-hairline bg-black/20 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-pixel text-xs text-muted">오늘 발견 포인트</p>
        <span className="rounded-full border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: status.color, color: status.color }}>
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-base font-bold leading-6 text-whiteout">
        {trigger ?? status.summary}
      </p>
      {trigger && <p className="mt-1 text-xs leading-5 text-muted">{status.summary}</p>}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span key={chip} className="rounded-md border border-hairline bg-surface px-2 py-1 text-[10px] text-muted">{chip}</span>
          ))}
        </div>
      )}
      {(source || asOf) && (
        context?.sourceUrl ? (
          <a href={context.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 block text-[10px] text-muted hover:text-whiteout">
            {[source, asOf].filter(Boolean).join(" · ")} · 원문 보기 →
          </a>
        ) : (
          <p className="mt-3 text-[10px] text-muted">{[source, asOf].filter(Boolean).join(" · ")}</p>
        )
      )}
    </section>
  );
}

const TA_ROLE_GROUPS: Array<{ role: "event" | "balance" | "confirmation"; label: string }> = [
  { role: "event", label: "추세·모멘텀" },
  { role: "balance", label: "균형·경계" },
  { role: "confirmation", label: "보조 확인" },
];

const CHART_COLOR = {
  up: "#22C55E",
  down: "#EF4444",
  wick: "rgba(250,250,250,0.52)",
  ma20: "#F59E0B",
  ma60: "#60A5FA",
  ma120: "#A78BFA",
  invalidation: "#F59E0B",
  volumeUp: "rgba(34,197,94,0.32)",
  volumeDown: "rgba(239,68,68,0.24)",
} as const;

/** 캔들+MA20/60/120+거래량+무효화 레벨선(WO 1.6 D-1) — 라인차트 금지, 라이브러리 없음. */
function AnalysisChart({
  series,
  invalidationLevel,
  candles,
}: {
  series: NonNullable<StockFrontResponse["chartSeries"]>;
  invalidationLevel?: number | undefined;
  candles?: DailyOhlcv[] | undefined;
}) {
  const W = 320;
  const PLOT_W = 278;
  const PRICE_H = 166;
  const VOL_TOP = 178;
  const VOL_H = 42;
  const H = VOL_TOP + VOL_H + 12;
  const renderedCandles =
    candles?.filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)).slice(-series.closes.length) ??
    series.closes.map((close, i, arr) => {
      const open = i > 0 ? arr[i - 1]! : close;
      return {
        open,
        close,
        high: Math.max(open, close),
        low: Math.min(open, close),
        volume: series.volumes[i] ?? 0,
      } satisfies DailyOhlcv;
    });
  const n = renderedCandles.length;
  if (n < 2) return null;

  const lineValues = [
    ...renderedCandles.flatMap((c) => [c.high, c.low]),
    ...series.ma20.filter((v): v is number => v !== null),
    ...series.ma60.filter((v): v is number => v !== null),
    ...series.ma120.filter((v): v is number => v !== null),
  ];
  // 무효 레벨이 가격대 근처(±25%)면 스케일에 포함해 화면 안에 그린다.
  const includeLevel =
    typeof invalidationLevel === "number" &&
    invalidationLevel > Math.min(...series.closes) * 0.75 &&
    invalidationLevel < Math.max(...series.closes) * 1.25;
  if (includeLevel) lineValues.push(invalidationLevel!);
  const rawMin = Math.min(...lineValues);
  const rawMax = Math.max(...lineValues);
  const padding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.004);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const span = max - min || 1;
  const x = (i: number) => (i / (n - 1)) * PLOT_W;
  const y = (v: number) => 4 + (1 - (v - min) / span) * (PRICE_H - 8);

  const linePath = (values: Array<number | null>): string => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const maxVol = Math.max(...renderedCandles.map((c) => c.volume), 1);
  const step = PLOT_W / Math.max(1, n - 1);
  const barW = Math.max(1, Math.min(4.5, step * 0.56));
  const latest = renderedCandles[n - 1]!;
  const levelCandidates = swingLevels(renderedCandles);
  const nearestSupport = levelCandidates
    .filter((level) => level.kind === "support" && level.value <= latest.close)
    .sort((a, b) => b.value - a.value)[0];
  const nearestResistance = levelCandidates
    .filter((level) => level.kind === "resistance" && level.value >= latest.close)
    .sort((a, b) => a.value - b.value)[0];
  const levels = [nearestSupport, nearestResistance].filter(
    (level): level is { kind: "support" | "resistance"; value: number } =>
      Boolean(level) && (!includeLevel || Math.abs(level!.value / invalidationLevel! - 1) >= 0.018)
  );
  const priceTicks = [rawMax, (rawMax + rawMin) / 2, rawMin];

  return (
    <div>
      <div className="mb-2 grid grid-cols-4 gap-2 border-b border-white/10 pb-2 text-[9px] text-muted">
        <span>O <b className="text-whiteout">{formatAxisPrice(latest.open)}</b></span>
        <span>H <b className="text-whiteout">{formatAxisPrice(latest.high)}</b></span>
        <span>L <b className="text-whiteout">{formatAxisPrice(latest.low)}</b></span>
        <span>C <b style={{ color: latest.close >= latest.open ? CHART_COLOR.up : CHART_COLOR.down }}>{formatAxisPrice(latest.close)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="캔들·이동평균·거래량 차트">
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line key={ratio} x1="0" x2={PLOT_W} y1={PRICE_H * ratio} y2={PRICE_H * ratio} stroke="rgba(255,255,255,0.09)" />
        ))}
        <line x1="0" x2={PLOT_W} y1={PRICE_H} y2={PRICE_H} stroke="rgba(255,255,255,0.16)" />
        {priceTicks.map((price) => (
          <text key={price} x={PLOT_W + 6} y={Math.max(8, Math.min(PRICE_H - 2, y(price) + 3))} fontSize="7.5" fill="rgba(250,250,250,0.45)">
            {formatAxisPrice(price)}
          </text>
        ))}
        {renderedCandles.map((c, i) => {
          const h = (c.volume / maxVol) * VOL_H;
          const isUp = c.close >= c.open;
          return (
            <rect
              key={`v-${i}`}
              x={x(i) - barW / 2}
              y={VOL_TOP + (VOL_H - h)}
              width={barW}
              height={Math.max(0.5, h)}
              fill={isUp ? CHART_COLOR.volumeUp : CHART_COLOR.volumeDown}
            />
          );
        })}
        <path d={linePath(series.ma120)} fill="none" stroke={CHART_COLOR.ma120} strokeWidth="1.1" />
        <path d={linePath(series.ma60)} fill="none" stroke={CHART_COLOR.ma60} strokeWidth="1.1" />
        <path d={linePath(series.ma20)} fill="none" stroke={CHART_COLOR.ma20} strokeWidth="1.2" />
        {levels.map((level, index) => (
          <g key={`${level.kind}-${index}`}>
            <line
              x1="0"
              x2={PLOT_W}
              y1={y(level.value)}
              y2={y(level.value)}
              stroke="rgba(250,250,250,0.28)"
              strokeWidth="0.8"
              strokeDasharray="3 4"
            />
            <text x="4" y={Math.max(9, y(level.value) - 3)} fontSize="8" fill="rgba(250,250,250,0.48)">
              {level.kind === "support" ? "지지" : "저항"} {formatChartPrice(level.value)}
            </text>
          </g>
        ))}
        {renderedCandles.map((c, i) => {
          const cx = x(i);
          const isUp = c.close >= c.open;
          const color = isUp ? CHART_COLOR.up : CHART_COLOR.down;
          const top = y(Math.max(c.open, c.close));
          const bottom = y(Math.min(c.open, c.close));
          return (
            <g key={`c-${i}`}>
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={CHART_COLOR.wick} strokeWidth="0.9" />
              <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(1.2, bottom - top)} rx="0.7" fill={color} />
            </g>
          );
        })}
        <line
          x1="0"
          x2={PLOT_W}
          y1={y(latest.close)}
          y2={y(latest.close)}
          stroke={latest.close >= latest.open ? CHART_COLOR.up : CHART_COLOR.down}
          strokeWidth="0.8"
          strokeDasharray="2 3"
          opacity="0.72"
        />
        <rect
          x={PLOT_W + 1}
          y={Math.max(1, Math.min(PRICE_H - 17, y(latest.close) - 8))}
          width="40"
          height="16"
          rx="2"
          fill={latest.close >= latest.open ? CHART_COLOR.up : CHART_COLOR.down}
        />
        <text
          x={PLOT_W + 38}
          y={Math.max(12, Math.min(PRICE_H - 5, y(latest.close) + 3))}
          textAnchor="end"
          fontSize="7.5"
          fontWeight="700"
          fill="#050706"
        >
          {formatAxisPrice(latest.close)}
        </text>
        {includeLevel && (
          <>
            <line
              x1="0"
              x2={PLOT_W}
              y1={y(invalidationLevel!)}
              y2={y(invalidationLevel!)}
              stroke={CHART_COLOR.invalidation}
              strokeWidth="1.2"
              strokeDasharray="5 4"
            />
          </>
        )}
        <text x="0" y={H - 1} fontSize="8" fill="rgba(250,250,250,0.42)">{markerDateLabel(renderedCandles[0])}</text>
        <text x={PLOT_W} y={H - 1} textAnchor="end" fontSize="8" fill="rgba(250,250,250,0.42)">{markerDateLabel(latest)}</text>
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        <span><span style={{ color: CHART_COLOR.up }}>■</span> 상승</span>
        <span><span style={{ color: CHART_COLOR.down }}>■</span> 하락</span>
        <span><span style={{ color: CHART_COLOR.ma20 }}>—</span> MA20</span>
        <span><span style={{ color: CHART_COLOR.ma60 }}>—</span> MA60</span>
        <span><span style={{ color: CHART_COLOR.ma120 }}>—</span> MA120</span>
        {includeLevel && <span><span style={{ color: CHART_COLOR.invalidation }}>┄</span> 관점 경계</span>}
      </div>
    </div>
  );
}

/** 관측 문장에 수치(WO 1.6 D-3) — latest 지표값을 fact 종류별로 붙인다. 값 없으면 원문 그대로. */
function taFactValueSuffix(kind: string, latest: NonNullable<StockFrontResponse["ta"]>["latest"]): string | undefined {
  if (!latest) return undefined;
  if ((kind === "rsi_overbought" || kind === "rsi_oversold") && typeof latest.rsi14 === "number") {
    return `RSI ${Math.round(latest.rsi14)} · 기준 ${kind === "rsi_overbought" ? "70 초과" : "30 미만"}`;
  }
  if (kind === "bollinger_squeeze" && typeof latest.bollingerWidthPct === "number") {
    return `밴드 폭 ${latest.bollingerWidthPct}%`;
  }
  if (kind === "atr_expanded" && typeof latest.atrPct === "number") {
    return `하루 변동폭 ${latest.atrPct}%`;
  }
  if (kind === "near_52w_high" && typeof latest.closeTo52WeekHighPct === "number") {
    return `고점 대비 -${(Math.round((100 - latest.closeTo52WeekHighPct) * 10) / 10).toFixed(1)}%`;
  }
  if (kind === "near_52w_low" && typeof latest.closeTo52WeekLowPct === "number") {
    return `저점 대비 +${(Math.round((latest.closeTo52WeekLowPct - 100) * 10) / 10).toFixed(1)}%`;
  }
  return undefined;
}

type StructureMetric = ChartTooltip & { value: string };
type StructureRange = "1m" | "3m" | "6m";

function sliceChartSeries(
  series: NonNullable<StockFrontResponse["chartSeries"]>,
  days: number
): NonNullable<StockFrontResponse["chartSeries"]> {
  const start = Math.max(0, series.closes.length - days);
  return {
    closes: series.closes.slice(start),
    volumes: series.volumes.slice(start),
    ma20: series.ma20.slice(start),
    ma60: series.ma60.slice(start),
    ma120: series.ma120.slice(start),
  };
}

function structureMetrics(front: StockFrontResponse | null): StructureMetric[] {
  const series = front?.chartSeries;
  if (!series || series.closes.length < 2) return [];
  const last = series.closes[series.closes.length - 1]!;
  const lastValue = (values: Array<number | null>) => values[values.length - 1] ?? undefined;
  const ma20 = lastValue(series.ma20);
  const ma60 = lastValue(series.ma60);
  const ma120 = lastValue(series.ma120);
  let structure = "배열 확인 중";
  if (finiteNumber(ma20) && finiteNumber(ma60)) {
    if (last > ma20 && ma20 > ma60) structure = "단기 상승 배열";
    else if (last < ma20 && ma20 < ma60) structure = "단기 하락 배열";
    else structure = "방향 혼조";
  }

  const candles = front?.candles?.filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)) ?? [];
  const levels = swingLevels(candles.slice(-series.closes.length));
  const support = levels.filter((level) => level.kind === "support" && level.value <= last).sort((a, b) => b.value - a.value)[0];
  const resistance = levels.filter((level) => level.kind === "resistance" && level.value >= last).sort((a, b) => a.value - b.value)[0];
  const levelValue = [support ? `지지 ${formatChartPrice(support.value)}` : undefined, resistance ? `저항 ${formatChartPrice(resistance.value)}` : undefined]
    .filter(Boolean)
    .join(" · ") || "레벨 축적 중";
  const latest = front?.ta?.latest;
  const momentumValue = finiteNumber(latest?.rsi14)
    ? `RSI ${Math.round(latest.rsi14)}`
    : finiteNumber(latest?.atrPct)
      ? `변동폭 ${latest.atrPct.toFixed(1)}%`
      : finiteNumber(front?.signals.volumeRatio) && front.signals.volumeRatio >= 0.1
        ? `거래량 ${front.signals.volumeRatio.toFixed(1)}배`
        : "지표 축적 중";

  return [
    {
      title: "추세 구조",
      value: structure,
      body: `현재 종가 ${formatChartPrice(last)}${finiteNumber(ma20) ? ` · MA20 ${formatChartPrice(ma20)}` : ""}${finiteNumber(ma60) ? ` · MA60 ${formatChartPrice(ma60)}` : ""}${finiteNumber(ma120) ? ` · MA120 ${formatChartPrice(ma120)}` : ""}`,
    },
    {
      title: "핵심 가격대",
      value: levelValue,
      body: levelValue === "레벨 축적 중" ? "반복 확인된 최근 피벗이 아직 부족해요." : `최근 고점·저점 피벗에서 계산한 ${levelValue} 구간이에요.`,
    },
    {
      title: "모멘텀",
      value: momentumValue,
      body: finiteNumber(latest?.rsi14)
        ? `RSI 14 기준 ${Math.round(latest.rsi14)}예요.${finiteNumber(latest?.atrPct) ? ` 최근 하루 변동폭은 ${latest.atrPct.toFixed(1)}%예요.` : ""}`
        : "현재 연결된 변동성·모멘텀 관측값을 보여줘요.",
    },
  ];
}

/**
 * 차트분석 탭(WO 1.6 D) — 실제 차트(종가+MA+거래량+무효선) + 와이코프 국면 뱃지 + 수치 붙은 관측.
 * 이 관측들은 판단(verdict)의 근거다 — 제약 잔재 문구 금지.
 */
function ChartAnalysisTab({
  front,
  basisDays,
  insight,
}: {
  front: StockFrontResponse | null;
  basisDays: number;
  insight: CondensedInsight | null;
}) {
  const ta = front?.ta;
  const facts = ta?.facts ?? [];
  const verdict = front?.verdict;
  const phaseText = verdict?.phase ? DEPTH_PHASE_TEXT[verdict.phase] : undefined;
  const series = front?.chartSeries;
  const invalidation = verdict?.invalidation;
  const [factTooltip, setFactTooltip] = useState<ChartTooltip | null>(null);
  const [structureTooltip, setStructureTooltip] = useState<ChartTooltip | null>(null);
  const [range, setRange] = useState<StructureRange>("3m");
  const metrics = structureMetrics(front);
  const rangeDays = range === "1m" ? 22 : range === "3m" ? 66 : 120;
  const visibleSeries = useMemo(() => (series ? sliceChartSeries(series, rangeDays) : undefined), [series, rangeDays]);
  const visibleCandles = useMemo(
    () => front?.candles?.filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)).slice(-rangeDays),
    [front?.candles, rangeDays]
  );

  return (
    <section className="mt-2">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="font-pixel text-sm text-whiteout">가격 구조</p>
          <p className="mt-1 text-[11px] leading-5 text-muted">캔들 배열·추세·핵심 가격대로 다음 확인 지점을 읽어요.</p>
        </div>
        {phaseText && verdict?.phase && (
          <button
            type="button"
            onClick={() => setStructureTooltip({ title: "국면 해석", body: phaseText })}
            className="shrink-0 rounded-md border border-whiteout/20 px-2 py-1 text-[10px] font-bold text-whiteout"
          >
            {verdict.phase === "accumulation" ? "축적" : verdict.phase === "markup" ? "상승" : verdict.phase === "distribution" ? "분산" : "하락"} 국면
          </button>
        )}
      </div>

      {metrics.length > 0 && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {metrics.map((metric) => (
            <button
              key={metric.title}
              type="button"
              onClick={() => setStructureTooltip(structureTooltip?.title === metric.title ? null : metric)}
              className="min-w-0 rounded-lg border border-hairline bg-surface px-2.5 py-2.5 text-left transition-colors hover:border-whiteout/25"
            >
              <span className="block text-[10px] text-muted">{metric.title}</span>
              <span className="mt-1 block break-words text-[11px] font-bold leading-4 text-whiteout">{metric.value}</span>
            </button>
          ))}
        </div>
      )}

      {structureTooltip && (
        <button
          type="button"
          onClick={() => setStructureTooltip(null)}
          className="mb-3 w-full rounded-lg border border-whiteout/15 bg-surface px-3 py-2.5 text-left shadow-xl"
        >
          <span className="block text-[11px] font-bold text-whiteout">{structureTooltip.title}</span>
          <span className="mt-1 block text-xs leading-5 text-muted">{structureTooltip.body}</span>
        </button>
      )}

      {/* 실제 차트 — 뭘 보고 판단하는지 눈에 보이게. */}
      {visibleSeries && visibleSeries.closes.length >= 2 ? (
        <div className="rounded-lg border border-white/15 bg-[#050706] px-3 pb-3 pt-3 shadow-inner">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-pixel text-[10px] text-muted">일봉 · {range === "1m" ? "1개월" : range === "3m" ? "3개월" : "6개월"}</span>
            <div className="flex rounded-md border border-white/10 p-0.5">
              {(["1m", "3m", "6m"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(key)}
                  className="rounded px-2 py-1 text-[9px] font-bold"
                  style={{ backgroundColor: range === key ? "#F4F4EF" : "transparent", color: range === key ? "#050706" : "#8A8A86" }}
                >
                  {key === "1m" ? "1M" : key === "3m" ? "3M" : "6M"}
                </button>
              ))}
            </div>
          </div>
          <AnalysisChart series={visibleSeries} invalidationLevel={verdict?.invalidationLevel} candles={visibleCandles} />
          {invalidation && (
            <button
              type="button"
              onClick={() => setStructureTooltip({ title: "경계 가격", body: invalidation })}
              className="mt-2 w-full rounded-lg border border-hairline bg-black/20 px-2.5 py-2 text-left transition-colors hover:border-whiteout/20"
            >
              <span className="block text-[11px] text-muted">경계 가격</span>
              <span className="mt-0.5 block truncate text-xs text-whiteout">{invalidation}</span>
            </button>
          )}
        </div>
      ) : (
        basisDays > 0 && <p className="mb-3 text-[11px] text-muted">최근 {basisDays}거래일 종가·거래량 기준</p>
      )}

      {facts.length > 0 && (
        <div className="mt-4 rounded-xl border border-hairline bg-surface px-3 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-pixel text-sm text-whiteout">차트에서 보이는 것</p>
            <span className="text-[11px] text-muted">탭해서 근거 보기</span>
          </div>
          <div className="space-y-3">
          {TA_ROLE_GROUPS.map(({ role, label }) => {
            const rows = facts.filter((f) => f.role === role);
            if (rows.length === 0) return null;
            return (
              <div key={role}>
                <p className="text-[11px] font-bold text-muted">{label}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rows.map((f, i) => {
                    const valueSuffix = taFactValueSuffix(f.kind, ta?.latest);
                    return (
                      <button
                        key={`${role}-${i}`}
                        type="button"
                        onClick={() =>
                          setFactTooltip({
                            title: shortSignalLabel(f.text, 24) ?? label,
                            body: [f.text, valueSuffix, f.confidence === "low" ? "참고 신호(신뢰도 낮음)" : undefined].filter(Boolean).join(" · "),
                          })
                        }
                        className="rounded-full border border-hairline px-2.5 py-1.5 text-[11px] text-whiteout transition-colors hover:border-whiteout/25"
                      >
                        {shortSignalLabel(f.text, 18) ?? label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
          {factTooltip && (
            <button
              type="button"
              onClick={() => setFactTooltip(null)}
              className="mt-3 w-full rounded-xl border border-whiteout/15 bg-black/70 px-3 py-2.5 text-left shadow-xl"
            >
              <span className="block text-[11px] font-bold text-whiteout">{factTooltip.title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{factTooltip.body}</span>
            </button>
          )}
        </div>
      )}
      {facts.length === 0 && !series && (
        <div className="rounded-lg border border-hairline bg-surface px-3 py-5 text-center">
          <p className="text-sm leading-6 text-muted">차트에서 두드러진 신호는 아직 없어요.</p>
          <p className="mt-1 text-[11px] leading-5 text-muted">데이터가 더 쌓이면 지표가 여기에 붙어요.</p>
        </div>
      )}
      <ConvictionParagraphs front={front} insight={insight} />
      <p className="mt-4 text-center text-[11px] leading-5 text-muted">차트 신호는 관측값이에요. 가격 예측은 아니에요.</p>
    </section>
  );
}

// 판단 층(WO Phase 1) — 와이코프 국면 표기(뎁스 문단용).
const DEPTH_PHASE_TEXT: Record<string, string> = {
  accumulation: "저점권 횡보에 거래가 수축된 축적형 구조",
  markup: "이동평균 정배열에 거래량이 붙은 상승 국면",
  distribution: "고점권에서 거래는 늘고 가격은 정체된 분산형 구조",
  markdown: "이동평균 역배열에 저점을 갱신 중인 하락 국면",
};

const DEPTH_CONFIDENCE_TEXT: Record<string, string> = {
  high: "여러 신호가 같은 방향을 가리키고 있어요.",
  medium: "근거가 일부 신호에 몰려 있어 무게는 중간이에요.",
  low: "신뢰도는 낮은 편이라 가볍게 봐야 해요.",
};

/** 근거 확장 줄 중복 제거 — 이미 있는 줄과 사실상 같은 내용이면 버린다. */
function pushEvidence(out: string[], line: string | undefined): void {
  const clean = (line ?? "").trim();
  if (!clean) return;
  if (out.some((existing) => copyRestates(existing, clean))) return;
  out.push(clean);
}

/**
 * 뎁스 판단 섹션(WO 1.5 A+B+C) — 카드와 동일한 verdict 를 렌더(단일 진실, 모순 금지).
 * 근거는 카드 근거 + TA 실수치·수급·재료로 확장. 데이터 없는 섹션은 생략(보일러플레이트 금지).
 */
function buildVerdictSections(
  front: StockFrontResponse | null,
  insight: CondensedInsight | null
): { stanceText?: string; confidenceText?: string; evidence: string[]; invalidation?: string } {
  const verdict = front?.verdict;
  const evidence: string[] = [];

  // 1) 카드와 동일한 근거(단일 진실) 먼저.
  for (const line of verdict?.evidence ?? []) pushEvidence(evidence, line);

  // 2) 국면 상세 — 카드 근거에 국면이 없을 때만 추가.
  if (verdict?.phase && DEPTH_PHASE_TEXT[verdict.phase]) {
    pushEvidence(evidence, `차트 구조: ${DEPTH_PHASE_TEXT[verdict.phase]}`);
  }

  // 3) 수급 확장 — 외국인·기관 모두(카드는 1~2줄만 실림).
  const foreignStreak = front?.signals.foreignNetStreak;
  const instStreak = front?.signals.institutionNetStreak;
  if (typeof foreignStreak === "number" && foreignStreak !== 0) {
    pushEvidence(evidence, `외국인 ${Math.abs(foreignStreak)}일 연속 ${foreignStreak > 0 ? "순매수" : "순매도"}`);
  }
  if (typeof instStreak === "number" && instStreak !== 0) {
    pushEvidence(evidence, `기관 ${Math.abs(instStreak)}일 연속 ${instStreak > 0 ? "순매수" : "순매도"}`);
  }

  // 4) TA 실수치 — 있는 지표만(가짜 금지) + 의미 병기(WO-22: "RSI 39" 단독 나열 금지).
  const latest = front?.ta?.latest;
  if (typeof latest?.rsi14 === "number") pushEvidence(evidence, describeRsi(latest.rsi14));
  if (typeof latest?.closeTo52WeekHighPct === "number") {
    const gap = Math.round((100 - latest.closeTo52WeekHighPct) * 10) / 10;
    pushEvidence(evidence, describe52wGap(gap));
  }
  if (typeof front?.signals.volumeRatio === "number" && front.signals.volumeRatio >= 1.2) {
    pushEvidence(evidence, `거래량이 20일 평균의 ${front.signals.volumeRatio.toFixed(1)}배 — 평소보다 눈에 띄게 붙은 상태`);
  }
  const taText = front?.taFact ? translateTaFact(front.taFact) : undefined;
  if (taText) pushEvidence(evidence, taText);

  // 5) 재료 — 원문 grounded 1문장.
  const material =
    insight && insight.confidence !== "insufficient"
      ? cleanText(insight.whyHot).split(/(?<=요\.|다\.)/)[0]?.trim()
      : undefined;
  if (material) pushEvidence(evidence, material);

  const balance = verdictBalance(verdict);

  return {
    ...(balance ? { stanceText: balance.summary } : {}),
    ...(verdict ? { confidenceText: DEPTH_CONFIDENCE_TEXT[verdict.confidence] } : {}),
    evidence: evidence.slice(0, 6),
    ...(verdict?.invalidation ? { invalidation: verdict.invalidation } : {}),
  };
}

const STANCE_BADGE: Record<string, { label: string; color: string }> = {
  enter: { label: "강세 신호 우세", color: "#22C55E" },
  watch: { label: "신호 혼조", color: "#C9C9C4" },
  avoid: { label: "약세 신호 우세", color: "#EF4444" },
};

/**
 * 뎁스 본문(WO 1.5) — 차트 균형 / 근거 / 다음 확인. 카드와 같은 관측값을 쓴다.
 * 데이터 없는 블록은 통째로 생략 — 전 종목 공통 보일러플레이트 금지.
 */
function ConvictionParagraphs({
  front,
  insight,
}: {
  front: StockFrontResponse | null;
  insight: CondensedInsight | null;
}) {
  const s = buildVerdictSections(front, insight);
  const stance = front?.verdict?.stance;
  const badge = stance ? STANCE_BADGE[stance] : undefined;
  if (!s.stanceText && s.evidence.length === 0 && !s.invalidation) return null;

  return (
    <section className="mt-6 space-y-4">
      {s.stanceText && (
        <div className="rounded-2xl border border-hairline bg-surface px-4 py-4">
          <div className="flex items-center gap-2.5">
            <p className="font-pixel text-sm text-whiteout">차트 균형</p>
            {badge && (
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold"
                style={{ borderColor: badge.color, color: badge.color }}
              >
                {badge.label}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-whiteout">{s.stanceText}</p>
          {s.confidenceText && <p className="mt-1 text-[12px] leading-5 text-muted">{s.confidenceText}</p>}
        </div>
      )}

      {s.evidence.length > 0 && (
        <div className="rounded-2xl border border-hairline bg-surface px-4 py-4">
          <p className="font-pixel text-sm text-whiteout">근거</p>
          <ul className="mt-2 space-y-1.5">
            {s.evidence.map((line, i) => (
              <li key={`vd-ev-${i}`} className="text-sm leading-6 text-whiteout">
                · {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.invalidation && (
        <div className="rounded-2xl border border-hairline bg-surface px-4 py-4">
          <p className="font-pixel text-sm text-whiteout">다음 확인</p>
          <p className="mt-2 text-sm leading-6 text-whiteout">{s.invalidation}</p>
        </div>
      )}
    </section>
  );
}

/**
 * 무슨 일이 있었나(WO-22) — 크론 LLM 인사이트의 전체 재료를 뎁스에 복원.
 * whyHot 전문 + 강세/약세 양면(원문 보기 링크) + 공식 지표 + 출처 정직 표기.
 * PRODUCT_VISION §6: 사실·출처·시점·양면. 데이터 없으면 통째로 생략(보일러플레이트 금지).
 */
function StockWhyHappened({ insight }: { insight: CondensedInsight | null }) {
  if (!insight) return null;
  // 공식 지표(수급 마감 확정 등)는 LLM 코퍼스와 무관한 객관 사실 — 원문이 얇아도(insufficient) 보여준다.
  const insufficient = insight.confidence === "insufficient";
  const officialFacts = insight.officialFacts ?? [];
  if (insufficient && officialFacts.length === 0) return null;
  const hasSides = !insufficient && insight.bull.length + insight.bear.length > 0;
  const why = insufficient ? "" : cleanText(insight.whyHot);
  if (!why && !hasSides && officialFacts.length === 0) return null;

  const srcOf = (id: string) => insight.sources.find((s) => s.id === id);
  const kindLabel = (kind?: string) =>
    kind === "official" ? "공식 데이터" : kind === "community" ? "커뮤니티" : kind === "news" ? "뉴스" : "";
  const sideList = (title: string, tone: string, points: CondensedInsight["bull"], empty: string) => (
    <div className="rounded-lg border border-hairline bg-black/20 px-3 py-3">
      <p className="font-pixel text-xs" style={{ color: tone }}>
        {title}
      </p>
      {points.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {points.slice(0, 3).map((p, i) => {
            const s = srcOf(p.sourceId);
            const kl = kindLabel(s?.kind);
            const label = `${s?.source ?? s?.title ?? ""}${kl ? ` · ${kl}` : ""}`;
            return (
              <li key={`${title}-${i}`}>
                <span className="block text-sm leading-6 text-whiteout">{cleanText(p.claim)}</span>
                {s &&
                  (s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[11px] text-muted hover:text-whiteout">
                      ↳ {label} · 원문 보기 →
                    </a>
                  ) : (
                    <span className="mt-0.5 block text-[11px] text-muted">↳ {label}</span>
                  ))}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted">{empty}</p>
      )}
    </div>
  );

  return (
    <section className="mt-4 rounded-2xl border border-hairline bg-surface px-4 py-4">
      <p className="font-pixel text-sm text-whiteout">{why || hasSides ? "무슨 일이 있었나" : "확인된 공식 지표"}</p>
      {why && <p className="mt-2 text-sm leading-6 text-whiteout">{why}</p>}

      {hasSides && (
        <div className="mt-3 grid gap-2">
          {sideList("강세 쪽 근거", "var(--up, #ff5a5f)", insight.bull, "오늘 원문에서 강세 쪽으로 확인된 근거는 없어요.")}
          {sideList("약세·주의 근거", "var(--down, #4f8cff)", insight.bear, "오늘 원문에서 약세 쪽으로 확인된 근거는 없어요.")}
        </div>
      )}

      {officialFacts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {officialFacts.slice(0, 3).map((f, i) => (
            <li key={`swf-of-${i}`} className="rounded-lg border border-hairline bg-black/20 px-3 py-2">
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
      )}

      {insight.lean.bullCount + insight.lean.bearCount > 0 && (
        <p className="mt-3 text-[11px] leading-5 text-muted">
          오늘 쏠림 · <span style={{ color: "var(--up, #ff5a5f)" }}>강세 {insight.lean.bullCount}</span>
          {" : "}
          <span style={{ color: "var(--down, #4f8cff)" }}>약세 {insight.lean.bearCount}</span>
          {insight.lean.oneSided ? " · 반대 관점 안 보임" : ""}
        </p>
      )}

      {insight.singleOutlet && insight.outlets.length > 0 && (
        <p className="mt-2 text-[11px] leading-5 text-muted">
          오늘은 <span className="text-whiteout">{insight.outlets[0]}</span> 한 곳 기준이에요 — 한 매체 안의 시각일 수 있어요.
        </p>
      )}
    </section>
  );
}

/**
 * 재무 한눈에(WO 1.5 F) — "이 회사 돈 잘 버나" 최소셋. 시총·PER·실적 추세를 한 줄씩.
 * KR=네이버 금융, US=Yahoo quoteSummary(이미 연결된 소스). 없는 항목은 생략(가짜 금지).
 */
function FinanceGlanceBlock({ basics }: { basics: StockBasics | null }) {
  if (!basics) return null;
  const lines: Array<{ label: string; value: string; note?: string }> = [];
  if (basics.marketCap) lines.push({ label: "시가총액", value: basics.marketCap });
  for (const m of basics.metrics.slice(0, 4)) {
    lines.push({ label: m.term ? `${m.label} (${m.term})` : m.label, value: m.value });
  }
  const fin = basics.financials;
  if (fin && fin.periods.length >= 2) {
    for (const row of fin.rows.slice(0, 2)) {
      const last = fin.periods.length - 1;
      const prev = last - 1;
      const prevVal = row.values[prev];
      const lastVal = row.values[last];
      if (prevVal && lastVal && prevVal !== "—" && lastVal !== "—") {
        lines.push({
          label: row.label,
          value: `${fin.periods[prev]!.title} ${prevVal} → ${fin.periods[last]!.title} ${lastVal}${fin.periods[last]!.estimate ? " (추정)" : ""}`,
        });
      }
    }
  }
  if (lines.length === 0) return null;
  const source = fin?.note?.includes("Nasdaq") ? "Nasdaq" : "네이버 금융";
  return (
    <section className="mt-4 rounded-2xl border border-hairline bg-surface px-4 py-4">
      <p className="font-pixel text-sm text-whiteout">재무 한눈에</p>
      <ul className="mt-2 space-y-1.5">
        {lines.slice(0, 5).map((line, i) => (
          <li key={`fin-${i}`} className="flex items-baseline justify-between gap-3 text-sm leading-6">
            <span className="shrink-0 text-muted">{line.label}</span>
            <span className="min-w-0 text-right text-whiteout">{line.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-4 text-muted">출처: {source}</p>
    </section>
  );
}

export function StockInsightView({
  stock,
  context,
  onClose,
  inline = false,
  inlineBackLabel,
}: {
  stock: string;
  context?: StockContext;
  onClose: () => void;
  /** PC 대시보드 중앙 컬럼용(WO-PC-VERSION) — 풀스크린 오버레이 대신 부모 컨테이너 안에 렌더. 모바일 기본 불변. */
  inline?: boolean;
  /** 인라인 안에서도 부모 뎁스로 돌아가야 하는 중첩 플로우용. */
  inlineBackLabel?: string;
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
    const isCoin = context?.market === "COIN" || context?.symbol?.toUpperCase().startsWith("KRW-") === true;
    setLoading(!isCoin);
    setInsight(null);
    setBasics(null);
    setFront(seed);
    setBasicsLoaded(isCoin);
    setFrontLoaded(!!seed);
    // 가격 헤더만 먼저 허용하고, 아래 가변 섹션은 세 요청이 모두 끝난 뒤 한 번에 연다.
    fetchStockFront(stock, {
      ...(context?.naverCode ? { naverCode: context.naverCode } : {}),
      ...(context?.symbol ? { symbol: context.symbol } : {}),
    })
      .then((r) => alive && setFront(mergeFrontSeed(seed, r)))
      .catch(() => alive && setFront(seed))
      .finally(() => alive && setFrontLoaded(true));
    if (!isCoin) {
      fetchStockBasics(stock, {
        ...(context?.naverCode ? { naverCode: context.naverCode } : {}),
        ...(context?.symbol ? { symbol: context.symbol } : {}),
      })
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
    }
    return () => {
      alive = false;
    };
  }, [stock, context?.frontSeed, context?.naverCode, context?.symbol, context?.market, context?.country]);

  const hasInsight =
    !!insight && insight.confidence !== "insufficient" && insight.bull.length + insight.bear.length > 0;
  const detailsReady = !loading && basicsLoaded && frontLoaded;
  const hasVerifiedFloor = !!(
    basics?.marketCap ||
    (basics?.metrics?.length ?? 0) > 0 ||
    front?.priceText ||
    (front?.sparkline?.length ?? 0) >= 2
  );
  const showThinSourceFootnote =
    !hasInsight && !insight?.officialFacts?.length && auditWordings(insight).length === 0;

  return (
    <div className={inline ? "flex h-full min-h-0 flex-col" : "fixed inset-0 z-[70] bg-black"}>
      <div className={inline ? "flex h-full min-h-0 flex-col" : "mx-auto flex h-full max-w-md flex-col"}>
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            {(!inline || inlineBackLabel) && (
              <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout" aria-label="뒤로">
                ← {inlineBackLabel ?? "뒤로"}
              </button>
            )}
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
          {/* 가격 먼저 — 일반 주식 상세 화면의 첫 독해 지점. */}
          <StockPriceHeader basics={basics} front={front} />

          {!detailsReady ? (
            <StockDepthLoadingBlock />
          ) : (
          <>
          <DiscoveryOverview front={front} insight={insight} context={context} />
          <DepthTabBar tab={depthTab} onChange={setDepthTab} />
          {depthTab === "ta" ? (
            <ChartAnalysisTab front={front} basisDays={front?.sparkline?.length ?? 0} insight={insight} />
          ) : (
          <>
          {/* 재료와 같은 기간의 가격·거래 반응 — 기술적 구조는 차트분석 탭으로 분리. */}
          <WhyMovementTab front={front} insight={insight} context={context} />

          {/* 무슨 일이 있었나(WO-22) — 원문 인사이트 전체(양면·출처·공식지표). 카드 대비 뎁스의 정보 우위. */}
          <StockWhyHappened insight={insight} />

          {/* 재무 한눈에(WO 1.5 F) — 근거 아래. KR=네이버·US=Yahoo, 없으면 생략. */}
          <FinanceGlanceBlock basics={basics} />

          {showThinSourceFootnote && (
            <p className="mt-5 text-[12px] leading-5 text-muted">
              {hasVerifiedFloor
                ? "원문 기반 요약은 아직 얇아요."
                : "이 종목으로 모인 원문은 아직 적어요. 확인된 자료가 들어오면 이 화면에 붙어요."}
            </p>
          )}

          {/* 포모 점수 — 카드 메인에서 강등된 배지(WO 1.5 E). 주목도 참고용, 판단 아님. */}
          {typeof front?.fomo?.fomoScore === "number" && (
            <p className="mt-6 text-center text-[11px] leading-5 text-muted">
              포모 <span className="font-number font-bold" style={{ color: "#D8FF3A" }}>{front.fomo.fomoScore}</span>
              {` · ${fomoStateSummary(front.fomo)}`}
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

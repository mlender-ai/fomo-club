"use client";

import { useEffect, useState } from "react";
import {
  scoreToColor,
  cleanText,
  cleanQuote,
  communityWordings,
  fomoCardView,
  fomoStateSummary,
  fomoWatchPoint,
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
            <span className="font-pixel text-sm" style={{ color }}>
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
              <div className="mt-3 space-y-2" aria-busy="true">
                <p className="text-sm leading-6 text-muted">원문을 정리하는 중이에요…</p>
                <div className="h-16 animate-pulse rounded-lg border border-hairline bg-surface" />
                <div className="h-16 animate-pulse rounded-lg border border-hairline bg-surface" />
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
}

/**
 * 종목 기본 정보 블록(바닥) — 항상 렌더. 주가·회사개요·시총·핵심지표·연간 재무.
 * "정확한 숫자 + 쉬운 라벨"(EPS→'한 주가 번 돈') 둘 다. 없는 값은 생략(가짜 금지), 추정치·출처 표기.
 */
function StockPriceHeader({ basics, front }: { basics: StockBasics | null; front: StockFrontResponse | null }) {
  const priceText = basics?.priceText ?? front?.priceText;
  const changeText = basics?.changeText ?? front?.changeText;
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
          <span className="font-pixel text-4xl leading-none text-whiteout">{priceText}</span>
          {changeText && (
            <span className="ml-2 align-baseline text-sm" style={up || down ? { color: up ? "#ff5a5f" : "#4f8cff" } : undefined}>
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

function StockFundamentalsBlock({ basics }: { basics: StockBasics | null }) {
  if (!basics) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-5 w-1/3 animate-pulse rounded bg-surface" />
        <div className="h-20 animate-pulse rounded-lg border border-hairline bg-surface" />
      </div>
    );
  }
  const empty = basics.metrics.length === 0 && !basics.financials && !basics.summary;
  return (
    <section>
      <p className="font-pixel text-sm text-whiteout">기본 지표</p>
      {basics.metrics.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {basics.metrics.map((m, i) => (
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

      {basics.financials && (
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

/**
 * 포모 상태 히어로(척추 ③ 주인공) — 큰 포모 점수(C) + 라벨 + 근거등급 + 왜(해부).
 * 카드(②)와 *동일 출처*(fetchStockFront 의 FomoScoreResult). 강도 비례 톤, 예측·판정 0.
 */
function FomoHero({ front, rankLabel }: { front: StockFrontResponse | null; rankLabel?: string }) {
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
  const tone = DETAIL_TONE_COLOR[view.tone] ?? "#94A3B8";
  const grade = confidenceGrade(fomo.confidence);
  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xs text-muted">포모 상태</span>
        {rankLabel && <span className="font-pixel text-[11px] text-muted">{rankLabel}</span>}
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <span className="font-pixel text-4xl leading-none" style={{ color: tone }}>
          {view.scoreText ? fomo.fomoScore : "—"}
        </span>
        <span className="pb-1 text-base font-bold" style={{ color: tone }}>
          {view.emoji && <span aria-hidden>{view.emoji} </span>}
          {view.badge}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-whiteout">{view.headline}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{fomoWatchPoint(fomo)}</p>
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
      bull.push({ text: `오늘 가격은 ${front.changeText} 상승으로 움직였어요.`, source: "가격" });
    }
    if (front.changeDir === "down" && front.changeText) {
      bear.push({ text: `오늘 가격은 ${front.changeText} 하락으로 움직였어요.`, source: "가격" });
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
    watch.push({ text: fomoWatchPoint(front.fomo), source: "관전 포인트" });
  }

  return {
    bull: uniquePoints(bull).slice(0, 3),
    bear: uniquePoints(bear).slice(0, 3),
    watch: uniquePoints(watch).slice(0, 2),
  };
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
}: {
  front: StockFrontResponse | null;
  insight: CondensedInsight | null;
  loading: boolean;
}) {
  const points = buildReadPoints(front, insight);
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
      {front && <p className="mt-2 text-sm leading-6 text-muted">{fomoStateSummary(front.fomo)}</p>}
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
      <div className="mt-4 space-y-2">
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-white/10" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
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
  const [front, setFront] = useState<StockFrontResponse | null>(null);
  const [frontLoaded, setFrontLoaded] = useState(false);
  // 종목 관심(C) — 명시적 취향 입력. 진입 자체도 암묵 신호(view_depth)로 적재됨.
  const [watched, setWatchedState] = useState(false);

  useEffect(() => {
    setWatchedState(isWatched(stock));
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
    setLoading(true);
    setInsight(null);
    setBasics(null);
    setFront(null);
    setBasicsLoaded(false);
    setFrontLoaded(false);
    // 가격 헤더만 먼저 허용하고, 아래 가변 섹션은 세 요청이 모두 끝난 뒤 한 번에 연다.
    fetchStockFront(stock)
      .then((r) => alive && setFront(r))
      .catch(() => alive && setFront(null))
      .finally(() => alive && setFrontLoaded(true));
    fetchStockBasics(stock)
      .then((r) => alive && setBasics(r))
      .catch(() => alive && setBasics(null))
      .finally(() => alive && setBasicsLoaded(true));
    fetchStockInsight(stock)
      .then((r) => alive && setInsight(r))
      .catch(() => alive && setInsight(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [stock]);

  const hasInsight =
    !!insight && insight.confidence !== "insufficient" && insight.bull.length + insight.bear.length > 0;
  const detailsReady = !loading && basicsLoaded && frontLoaded;

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
          {context?.reason && (
            <div className="mb-5 rounded-lg border border-hairline bg-surface px-3 py-2">
              <span className="block text-[11px] text-muted">
                {context.fromTheme ? `‘${cleanText(context.fromTheme)}’ 흐름에서 보여주는 이유` : "보여주는 이유"}
              </span>
              <span className="mt-1 block text-sm leading-6 text-whiteout">{cleanText(context.reason)}</span>
              {context.sourceUrl && (
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
          {/* 차트 — 가격 다음으로 현재 흐름을 확인. */}
          <DetailChart front={front} />

          {/* 핵심 해석 — 강세/약세 원문이 부족해도 가격·차트·수급으로 읽을 재료를 먼저 보여준다. */}
          <StockReadGuide front={front} insight={insight} loading={false} />

          {/* 포모 상태 — 카드와 같은 단일 출처지만, 상세의 첫 주인공은 가격/차트가 담당. */}
          <div className="mt-6">
            <FomoHero
              front={front}
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

          {!hasInsight && !insight?.officialFacts?.length && auditWordings(insight).length === 0 && (
            <p className="mt-6 text-sm leading-6 text-muted">
              이 종목으로 모인 원문은 아직 적어요. 그래서 위에는 가격·차트·수급처럼 확인된 재료만 정리했어요.
            </p>
          )}

          <div className="mt-7">
            <StockFundamentalsBlock basics={basics} />
          </div>

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
        </div>
      </div>
    </div>
  );
}

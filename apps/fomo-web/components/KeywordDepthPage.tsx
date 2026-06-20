"use client";

import { useEffect, useState } from "react";
import { scoreToColor, cleanText, cleanQuote, communityWordings, type KeywordCard } from "@fomo/core";
import {
  fetchThemeInsight,
  fetchStockInsight,
  fetchStockBasics,
  recordTaste,
  type CondensedInsight,
  type StockBasics,
} from "@/lib/fomoApi";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";

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
            <span aria-hidden>{card.emoji}</span>
            <span className="font-pixel text-sm" style={{ color }}>
              포모 {card.fomoScore}
            </span>
          </div>
          <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout">
            닫기
          </button>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <FullPageLoading estimateMs={LOADING_PRESETS.theme.estimateMs} steps={LOADING_PRESETS.theme.steps} />
          ) : (
          <>
          <p className="text-sm leading-6 text-whiteout">{cleanText(card.comment)}</p>

          {/* 왜 떴나 — 응축이 있으면 grounded whyHot, 없으면 기존 키워드 why. */}
          <section className="mt-7">
            <p className="font-pixel text-sm text-whiteout">{card.depth.whyTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {cleanText(hasInsight ? insight!.whyHot : card.depth.why)}
            </p>
          </section>

          {/* 공식 지표(FRED 등) — 강세/약세와 별개의 중립 사실 숫자(C-2). hasInsight 무관. */}
          {insight?.officialFacts && insight.officialFacts.length > 0 && (
            <section className="mt-6">
              <p className="font-pixel text-sm text-whiteout">📊 공식 지표</p>
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

          {hasInsight ? (
            <>
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
                  ⚠️ 오늘은 <span className="text-whiteout">{insight!.outlets[0]}</span> 한 곳 기준이야 — 한 매체 안의 시각일 수 있어.
                </p>
              )}

              <section className="mt-6">
                <p className="font-pixel text-sm" style={{ color: "var(--up, #ff5a5f)" }}>
                  📈 강세 관점
                </p>
                {insight!.bull.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {insight!.bull.map((p, i) => evidenceItem(p.claim, p.sourceId, `bull-${i}`))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted">원문에서 강세 근거는 안 보였어.</p>
                )}
              </section>

              <section className="mt-6">
                <p className="font-pixel text-sm" style={{ color: "var(--down, #4f8cff)" }}>
                  📉 약세 관점
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
                  <p className="font-pixel text-sm text-whiteout">🗣️ 사람들 워딩</p>
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
                  <p className="font-pixel text-sm text-whiteout">🔗 같이 움직인 종목</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    대장주 말고, 이 테마 때문에 같이 들썩인 덜 알려진 종목들. 탭하면 그 종목만 따로 봐.
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
            // 폴백 — 응축 부족(insufficient): 기존 뉴스 소스(#500). 빈 화면 금지.
            // 로딩 중은 상위 FullPageLoading 이 담당하므로 여기는 항상 도착 후 상태다.
            card.sources.length > 0 && (
              <section className="mt-6">
                <p className="font-pixel text-sm text-whiteout">오늘 이런 뉴스가 돌았어</p>
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
            )
          )}

          <section className="mt-6">
            <p className="font-pixel text-sm text-whiteout">{card.depth.rememberTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{card.depth.remember}</p>
          </section>

          <section className="mt-6">
            <p className="text-xs text-muted">다들 이런 것들 봤어</p>
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
            지난 흐름을 친구처럼 풀어준 거야. 투자 조언은 아니야.
          </p>
          </>
          )}
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
function StockBasicsBlock({ basics }: { basics: StockBasics | null }) {
  if (!basics) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-8 w-1/2 animate-pulse rounded bg-surface" />
        <div className="h-14 animate-pulse rounded-lg border border-hairline bg-surface" />
      </div>
    );
  }
  const up = basics.changeDir === "up";
  const down = basics.changeDir === "down";
  const empty = !basics.priceText && basics.metrics.length === 0 && !basics.financials && !basics.summary;
  return (
    <section>
      {basics.priceText && (
        <div className="flex items-baseline gap-2">
          <span className="font-pixel text-3xl text-whiteout">{basics.priceText}</span>
          {basics.changeText && (
            <span className="text-sm" style={up || down ? { color: up ? "#ff5a5f" : "#4f8cff" } : undefined}>
              {up ? "▲" : down ? "▼" : ""} {basics.changeText}
            </span>
          )}
        </div>
      )}
      {(basics.market || basics.marketCap || basics.sector) && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
          {basics.market && <span>{basics.market}</span>}
          {basics.marketCap && <span>시총 {basics.marketCap}</span>}
          {basics.sector && <span>{cleanText(basics.sector)}</span>}
        </div>
      )}
      {basics.summary && <p className="mt-3 text-sm leading-6 text-muted">{cleanText(basics.summary)}</p>}

      {basics.metrics.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {basics.metrics.map((m, i) => (
            <li key={`m-${i}`} className="rounded-lg border border-hairline bg-surface px-3 py-2">
              <span className="block text-[11px] text-muted">
                {m.label}
                {m.term ? <span className="text-muted/70"> · {m.term}</span> : null}
              </span>
              <span className="mt-0.5 block text-sm text-whiteout">{m.value}</span>
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
          <p className="mt-1 text-[10px] leading-4 text-muted">(E)=컨센서스 추정치 · 출처: 네이버 금융</p>
        </div>
      )}

      {empty && (
        <p className="text-sm leading-6 text-muted">
          이 종목 기본 정보는 아직 연결 전이야(해외·신규 상장 등). 아래 흐름으로 봐줘.
        </p>
      )}
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setInsight(null);
    setBasics(null);
    // 기본 정보(빠름) + 이해 레이어(느림 LLM) 병렬 — 각자 도착하는 대로 표시(빈 화면 박멸).
    fetchStockBasics(stock)
      .then((r) => alive && setBasics(r))
      .catch(() => alive && setBasics(null));
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

  const srcOf = (id: string) => insight?.sources.find((s) => s.id === id);
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
            <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-muted hover:text-whiteout">
              ↳ {label} · 원문 보기 →
            </a>
          ) : (
            <span className="mt-1 block text-[11px] text-muted">↳ {label}</span>
          ))}
      </li>
    );
  };

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
          <span className="font-pixel text-xs text-muted">종목</span>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          {/* 바닥 — 기본 정보는 원문 무관 객관 사실이라 항상 먼저 깐다(빈 화면 박멸). */}
          <StockBasicsBlock basics={basics} />

          {/* 그 위 — 강세/약세 해석(원문 grounded, 있을 때만). LLM 이라 따로 로딩. */}
          {loading ? (
            <p className="mt-7 text-sm leading-6 text-muted">강세·약세 관점을 읽고 있어…</p>
          ) : (
          <>
          <section className="mt-7">
            <p className="font-pixel text-sm text-whiteout">왜 같이 움직였나</p>
            {/* 들어온 맥락(연관 근거) — stock-insight 가 부족해도 항상 보여준다(빈 화면 금지). */}
            {context?.reason && (
              <div className="mt-2 rounded-lg border border-hairline bg-surface px-3 py-2">
                {context.fromTheme && (
                  <span className="mb-1 block text-[11px] text-muted">‘{cleanText(context.fromTheme)}’ 흐름에서</span>
                )}
                <span className="block text-sm leading-6 text-whiteout">{cleanText(context.reason)}</span>
                {context.sourceUrl ? (
                  <a href={context.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-muted hover:text-whiteout">
                    ↳ {cleanText(context.sourceLabel ?? "원문")} · 원문 보기 →
                  </a>
                ) : (
                  context.sourceLabel && <span className="mt-1 block text-[11px] text-muted">↳ {cleanText(context.sourceLabel)}</span>
                )}
              </div>
            )}
            {/* 종목 단독 응축(understandStock)이 되면 그걸 덧붙임. 안 되면 위 맥락이 근거. */}
            {hasInsight ? (
              <p className="mt-2 text-sm leading-6 text-muted">{cleanText(insight!.whyHot)}</p>
            ) : (
              !context?.reason && (
                <p className="mt-2 text-sm leading-6 text-muted">이 종목만으로는 응축할 원문이 아직 부족해. 그것도 정상이야.</p>
              )
            )}
          </section>

          {insight?.officialFacts && insight.officialFacts.length > 0 && (
            <section className="mt-6">
              <p className="font-pixel text-sm text-whiteout">📊 공식 지표</p>
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

          {hasInsight ? (
            <>
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
                  ⚠️ 오늘은 <span className="text-whiteout">{insight!.outlets[0]}</span> 한 곳 기준이야 — 한 매체 안의 시각일 수 있어.
                </p>
              )}

              <section className="mt-6">
                <p className="font-pixel text-sm" style={{ color: "var(--up, #ff5a5f)" }}>
                  📈 강세 관점
                </p>
                {insight!.bull.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {insight!.bull.map((p, i) => evidenceItem(p.claim, p.sourceId, `bull-${i}`))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted">원문에서 강세 근거는 안 보였어.</p>
                )}
              </section>

              <section className="mt-6">
                <p className="font-pixel text-sm" style={{ color: "var(--down, #4f8cff)" }}>
                  📉 약세 관점
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
                  <p className="font-pixel text-sm text-whiteout">🗣️ 사람들 워딩</p>
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
            </>
          ) : (
            <p className="mt-6 text-sm leading-6 text-muted">
              {context?.reason
                ? "이 종목 단독 원문은 아직 모이는 중이야 — 위 연결이 지금까지의 근거야. 더 쌓이면 강세·약세로 풀어줄게."
                : "이 종목으로 모인 원문이 아직 적어. 더 쌓이면 강세·약세로 풀어줄게."}
            </p>
          )}

          <p className="mt-8 text-center text-[11px] leading-5 text-muted">
            원문을 친구처럼 풀어준 거야. 투자 조언은 아니야.
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

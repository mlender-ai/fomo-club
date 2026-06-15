"use client";

import { useEffect, useState } from "react";
import { scoreToColor, cleanText, cleanQuote, type KeywordCard } from "@fomo/core";
import { fetchThemeInsight, type CondensedInsight } from "@/lib/fomoApi";

/** 응축(강세/약세/워딩) 로딩 중 표시 — "강세/약세 없는 중간 상태"가 노출되지 않게(핸드오프 §1).
 *  카피는 임시(정중한 반말), 최종본은 광혁 조정. */
function DepthBodySkeleton() {
  return (
    <section className="mt-6" aria-busy="true">
      <p className="text-sm leading-6 text-muted">원문 읽고 강세·약세 정리하는 중…</p>
      <div className="mt-3 space-y-2">
        <div className="h-12 animate-pulse rounded-lg border border-hairline bg-surface" />
        <div className="h-12 animate-pulse rounded-lg border border-hairline bg-surface" />
        <div className="h-12 w-2/3 animate-pulse rounded-lg border border-hairline bg-surface" />
      </div>
    </section>
  );
}

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
  // tier → 신뢰도 정직 표기(§4.5).
  const tierLabel = (tier?: string) =>
    tier === "official-high"
      ? "공식 데이터"
      : tier === "news-mid"
        ? "뉴스"
        : tier === "community-mid" || tier === "community-low"
          ? "커뮤니티"
          : "";

  const evidenceItem = (claim: string, sourceId: string, key: string) => {
    const s = srcOf(sourceId);
    const tl = tierLabel(s?.tier);
    const label = `${s?.source ?? s?.title ?? ""}${tl ? ` · ${tl}` : ""}`;
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
          <p className="text-sm leading-6 text-whiteout">{cleanText(card.comment)}</p>

          {/* 왜 떴나 — 응축이 있으면 grounded whyHot, 없으면 기존 키워드 why.
              로딩 중엔 grounded 본문을 기다린다(중간 상태 노출 방지). */}
          <section className="mt-7">
            <p className="font-pixel text-sm text-whiteout">{card.depth.whyTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {loading ? "원문 읽는 중…" : cleanText(hasInsight ? insight!.whyHot : card.depth.why)}
            </p>
          </section>

          {/* 공식 지표(FRED 등) — 강세/약세와 별개의 중립 사실 숫자(C-2). hasInsight 무관.
              로딩 중이면 표시하지 않는다(도착 후 노출 — 깜빡임 방지). */}
          {!loading && insight?.officialFacts && insight.officialFacts.length > 0 && (
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

          {loading ? (
            <DepthBodySkeleton />
          ) : hasInsight ? (
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

              {insight!.wordings.length > 0 && (
                <section className="mt-6">
                  <p className="font-pixel text-sm text-whiteout">🗣️ 사람들 워딩</p>
                  <ul className="mt-2 space-y-2">
                    {insight!.wordings.map((w, i) => {
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
            // 폴백 — 응축 부족(insufficient): 기존 뉴스 소스(#500). 빈 화면 금지.
            // 로딩 중은 위 DepthBodySkeleton 이 담당하므로 여기는 항상 도착 후 상태다.
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
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeCompanyName } from "@fomo/core";
import { fetchDiscoveryPerformancePrices, type DiscoveryPerformancePriceRequestItem } from "@/lib/fomoApi";
import { fetchJudgmentHistory, type JudgmentHistoryItem } from "@/lib/judgmentLedgerClient";
import { getWatchlist, type WatchItem } from "@/lib/watchlist";
import { seenByDate, shortDate, watchRows } from "@/lib/myRecord";
import { formatSignedPct, koreanDate } from "@/lib/scorecard";

/**
 * 내 기록 탭 — DS-04 §2(`docs/design/DS-04_RECORDS.md`).
 *
 * **두 섹션만 있다**: 관심 종목(누른 뒤 얼마나 움직였나)과 본 카드(며칠에 몇 장).
 * 종전 `KeywordHistory` 는 mock 키워드 카드·요청함·후회 영수증·점수대 분해까지 한 화면에
 * 쌓아 무엇을 보는 화면인지 알 수 없었다. DS-04 가 이 탭의 정본이므로 그 컴포넌트를 대체한다.
 *
 * accent 는 한 곳 — **수익이 가장 높은 관심 종목 하나**. 전부 음수면 accent 가 없다.
 * 일러스트·아이콘을 쓰지 않는다(§2-3).
 */

function Section({ title, count, children }: { title: string; count?: string; children: React.ReactNode }) {
  return (
    <section className="mt-s5 border-t-hair border-ds-border pt-s5">
      <div className="flex items-baseline justify-between gap-s2">
        <h2 className="text-ds-title text-ds-text-1">{title}</h2>
        {count && <span className="font-mono text-ds-label text-ds-text-2">{count}</span>}
      </div>
      <div className="mt-s3">{children}</div>
    </section>
  );
}

export function MyRecordTab() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [seen, setSeen] = useState<JudgmentHistoryItem[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    setWatchlist(getWatchlist());
    let alive = true;
    void fetchJudgmentHistory()
      .then((res) => {
        if (alive) setSeen(res.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /** 관심 종목의 현재가 — 벌크 라우트 1회. 실패하면 변동만 빈다(등록일은 남는다). */
  useEffect(() => {
    if (watchlist.length === 0) return;
    const items: DiscoveryPerformancePriceRequestItem[] = [];
    for (const item of watchlist.slice(0, 40)) {
      const row: DiscoveryPerformancePriceRequestItem = { stock: item.stock };
      if (item.symbol) row.symbol = item.symbol;
      if (item.naverCode) row.naverCode = item.naverCode;
      const market = item.market as NonNullable<DiscoveryPerformancePriceRequestItem["market"]> | undefined;
      const country = item.country as NonNullable<DiscoveryPerformancePriceRequestItem["country"]> | undefined;
      if (market) row.market = market;
      if (country) row.country = country;
      items.push(row);
    }
    let alive = true;
    void fetchDiscoveryPerformancePrices(items)
      .then((res) => {
        if (!alive) return;
        const next: Record<string, number> = {};
        for (const [stock, price] of Object.entries(res.prices)) {
          if (typeof price?.currentPrice === "number") next[stock] = price.currentPrice;
        }
        setPrices(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [watchlist]);

  const rows = useMemo(() => watchRows(watchlist, (stock) => prices[stock]), [watchlist, prices]);
  const days = useMemo(() => seenByDate(seen), [seen]);

  // 빈 상태 — 일러스트 없이 문장과 CTA 하나(§2-3).
  if (rows.length === 0 && days.length === 0) {
    return (
      <div className="px-gutter pt-s6" data-testid="my-record-empty">
        <h1 className="text-ds-title-lg text-ds-text-1">아직 관심 종목이 없어요</h1>
        <p className="mt-s3 text-ds-body text-ds-text-2">
          카드 오른쪽 위 별을 누르면 그 뒤로 얼마나 움직였는지 기록돼요.
        </p>
        <a
          href="/"
          className="tap-button mt-s5 flex h-btn-primary w-full items-center justify-center rounded-pill bg-ds-accent text-[15px] font-medium text-ds-accent-ink"
        >
          오늘의 픽 보기
        </a>
      </div>
    );
  }

  return (
    <div className="px-gutter">
      {rows.length > 0 && (
        <Section title="관심 종목" count={`${rows.length}곳`}>
          <ul data-testid="my-record-watchlist">
            {rows.map((row) => (
              <li key={row.stock} className="border-b-hair border-ds-border">
                <div className="flex min-h-16 flex-col justify-center py-s3">
                  <div className="flex items-baseline justify-between gap-s2">
                    <span className="min-w-0 truncate text-[14px] font-medium leading-tight text-ds-text-1">
                      {normalizeCompanyName(row.stock)}
                    </span>
                    {row.code && <span className="shrink-0 font-mono text-ds-label text-ds-text-3">{row.code}</span>}
                  </div>
                  <p className="mt-s1 font-mono text-ds-caption text-ds-text-2">
                    등록 {shortDate(row.addedAt)}
                    {typeof row.returnPct === "number" && (
                      <>
                        {" · "}
                        <span className={row.best ? "text-ds-accent" : "text-ds-text-1"} data-testid="my-record-return">
                          {formatSignedPct(row.returnPct)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {rows.every((row) => typeof row.returnPct !== "number") && (
            <p className="mt-s3 text-ds-caption text-ds-text-3">
              지금부터 누른 종목은 등록 시점 가격을 남겨 변동을 보여줘요.
            </p>
          )}
        </Section>
      )}

      {days.length > 0 && (
        <Section title="본 카드" count={`${seen.length}장`}>
          <ul data-testid="my-record-seen">
            {days.slice(0, 14).map((day) => (
              <li key={day.date} className="flex items-baseline justify-between gap-s3 border-b-hair border-ds-border py-s3">
                <span className="font-mono text-ds-data text-ds-text-1">{koreanDate(day.date)}</span>
                <span className="font-mono text-ds-label text-ds-text-2">{day.count}장</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

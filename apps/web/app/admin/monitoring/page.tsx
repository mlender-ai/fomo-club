import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

async function getMonitoringData() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    draws24h,
    draws7d,
    drawsBySource24h,
    creditsByReason,
    feedbackStats,
    reportsPending,
    recentErrors,
  ] = await Promise.all([
    prisma.tarotDrawHistory.count({
      where: { createdAt: { gte: last24h } },
    }),
    prisma.tarotDrawHistory.count({
      where: { createdAt: { gte: last7d } },
    }),
    prisma.tarotDrawHistory.groupBy({
      by: ["source"],
      _count: true,
      where: { createdAt: { gte: last24h } },
    }),
    prisma.tarotCreditLedger.groupBy({
      by: ["reason"],
      _sum: { amount: true },
      _count: true,
      where: { createdAt: { gte: last7d } },
    }),
    prisma.tarotFeedback.groupBy({
      by: ["rating"],
      _count: true,
    }),
    prisma.tarotReport.count({
      where: { status: "PENDING" },
    }),
    prisma.tarotDrawHistory.findMany({
      where: {
        source: "FALLBACK",
        createdAt: { gte: last24h },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ticker: true,
        createdAt: true,
      },
    }),
  ]);

  // 캐시 적중률 계산 (24시간)
  const total24h = drawsBySource24h.reduce((s, d) => s + d._count, 0);
  const cacheHits = drawsBySource24h.find((d) => d.source === "CACHE")?._count ?? 0;
  const cacheHitRate = total24h > 0 ? ((cacheHits / total24h) * 100).toFixed(1) : "0.0";

  // LLM 호출 수
  const llmCalls = drawsBySource24h.find((d) => d.source === "LLM")?._count ?? 0;
  const fallbackCalls = drawsBySource24h.find((d) => d.source === "FALLBACK")?._count ?? 0;

  return {
    draws24h,
    draws7d,
    llmCalls,
    cacheHits,
    fallbackCalls,
    cacheHitRate,
    creditsByReason: creditsByReason.map((c) => ({
      reason: c.reason,
      total: c._sum.amount ?? 0,
      count: c._count,
    })),
    feedbackStats: feedbackStats.map((f) => ({
      rating: f.rating,
      count: f._count,
    })),
    reportsPending,
    recentErrors,
  };
}

export default async function MonitoringPage() {
  const data = await getMonitoringData();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>모니터링</h1>
        <p className="admin-page-desc">시스템 상태, 호출량, 비용 추정</p>
      </header>

      <div className="admin-metrics-grid">
        <div className="admin-metric-card">
          <span className="admin-metric-label">뽑기 (24h)</span>
          <span className="admin-metric-value">{data.draws24h.toLocaleString()}</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">뽑기 (7일)</span>
          <span className="admin-metric-value">{data.draws7d.toLocaleString()}</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">캐시 적중률</span>
          <span className="admin-metric-value admin-metric-accent">{data.cacheHitRate}%</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">미처리 신고</span>
          <span className={`admin-metric-value ${data.reportsPending > 0 ? "admin-metric-warn" : ""}`}>
            {data.reportsPending}
          </span>
        </div>
      </div>

      <div className="admin-grid-2col">
        <section className="admin-section-card">
          <h2>AI 호출 분포 (24h)</h2>
          <div className="admin-source-breakdown">
            {[
              { label: "LLM 실시간", count: data.llmCalls, cls: "llm" },
              { label: "캐시", count: data.cacheHits, cls: "cache" },
              { label: "폴백", count: data.fallbackCalls, cls: "fallback" },
            ].map((s) => (
              <div key={s.cls} className="admin-source-row">
                <span className={`admin-source-badge admin-source-${s.cls}`}>{s.label}</span>
                <span className="admin-source-count">{s.count}건</span>
                <div className="admin-source-bar">
                  <div
                    className="admin-source-bar-fill"
                    style={{
                      width: `${data.draws24h > 0 ? (s.count / data.draws24h) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="admin-cost-estimate">
            <span className="admin-cost-label">예상 LLM 비용 (24h)</span>
            <span className="admin-cost-value">
              ~${((data.llmCalls * 0.003)).toFixed(2)}
            </span>
            <span className="admin-cost-note">Claude Sonnet 기준, 건당 ~$0.003</span>
          </div>
        </section>

        <section className="admin-section-card">
          <h2>크레딧 흐름 (7일)</h2>
          {data.creditsByReason.length === 0 ? (
            <p className="admin-empty">아직 크레딧 거래 없음</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>사유</th>
                  <th>건수</th>
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                {data.creditsByReason.map((c) => (
                  <tr key={c.reason}>
                    <td>
                      <span className="admin-reason-label">{formatReason(c.reason)}</span>
                    </td>
                    <td>{c.count}</td>
                    <td className={c.total >= 0 ? "admin-positive" : "admin-negative"}>
                      {c.total >= 0 ? "+" : ""}{c.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="admin-grid-2col">
        <section className="admin-section-card">
          <h2>사용자 만족도</h2>
          {data.feedbackStats.length === 0 ? (
            <p className="admin-empty">아직 피드백 없음</p>
          ) : (
            <div className="admin-rating-bars">
              {["FIVE", "FOUR", "THREE", "TWO", "ONE"].map((rating) => {
                const stat = data.feedbackStats.find((f) => f.rating === rating);
                const count = stat?.count ?? 0;
                const total = data.feedbackStats.reduce((s, f) => s + f.count, 0);
                return (
                  <div key={rating} className="admin-rating-row">
                    <span className="admin-rating-label">{ratingToStars(rating)}</span>
                    <div className="admin-rating-bar">
                      <div
                        className="admin-rating-bar-fill"
                        style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="admin-rating-count">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-section-card">
          <h2>최근 폴백 발동 (24h)</h2>
          {data.recentErrors.length === 0 ? (
            <p className="admin-empty admin-empty-good">✓ 폴백 없음 — 정상 운영 중</p>
          ) : (
            <ul className="admin-error-list">
              {data.recentErrors.map((e) => (
                <li key={e.id} className="admin-error-item">
                  <span className="admin-ticker">{e.ticker}</span>
                  <span className="admin-time">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function formatReason(reason: string): string {
  const map: Record<string, string> = {
    SIGNUP_BONUS: "가입 보너스",
    PURCHASE: "구매",
    REWARD_AD: "리워드 광고",
    DRAW_SINGLE: "1장 뽑기",
    DRAW_THREE: "3장 뽑기",
    REFUND: "환불",
  };
  return map[reason] ?? reason;
}

function ratingToStars(rating: string): string {
  const map: Record<string, string> = {
    FIVE: "★★★★★",
    FOUR: "★★★★☆",
    THREE: "★★★☆☆",
    TWO: "★★☆☆☆",
    ONE: "★☆☆☆☆",
  };
  return map[rating] ?? rating;
}

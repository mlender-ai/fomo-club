import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

async function getStats() {
  const [
    totalCards,
    activeCards,
    totalDraws,
    totalUsers,
    activePrompt,
    recentDraws,
    creditStats,
  ] = await Promise.all([
    prisma.tarotCard.count(),
    prisma.tarotCard.count({ where: { status: "ACTIVE" } }),
    prisma.tarotDrawHistory.count(),
    prisma.user.count({ where: { authProvider: { not: null } } }),
    prisma.tarotPromptVersion.findFirst({ where: { isActive: true } }),
    prisma.tarotDrawHistory.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ticker: true,
        market: true,
        spread: true,
        headline: true,
        source: true,
        creditCost: true,
        createdAt: true,
      },
    }),
    prisma.tarotCreditLedger.aggregate({
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const sourceBreakdown = await prisma.tarotDrawHistory.groupBy({
    by: ["source"],
    _count: true,
  });

  return {
    totalCards,
    activeCards,
    totalDraws,
    totalUsers,
    activePromptVersion: activePrompt?.version ?? "없음",
    recentDraws,
    totalCreditsIssued: creditStats._sum.amount ?? 0,
    totalTransactions: creditStats._count,
    sourceBreakdown: sourceBreakdown.map((s) => ({
      source: s.source,
      count: s._count,
    })),
  };
}

export default async function AdminDashboardPage() {
  const stats = await getStats();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>대시보드</h1>
        <p className="admin-page-desc">Trading Taro 운영 현황</p>
      </header>

      <div className="admin-metrics-grid">
        <div className="admin-metric-card">
          <span className="admin-metric-label">전체 카드</span>
          <span className="admin-metric-value">{stats.totalCards}</span>
          <span className="admin-metric-sub">활성 {stats.activeCards}장</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">총 뽑기 수</span>
          <span className="admin-metric-value">{stats.totalDraws.toLocaleString()}</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">사용자</span>
          <span className="admin-metric-value">{stats.totalUsers.toLocaleString()}</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">활성 프롬프트</span>
          <span className="admin-metric-value admin-metric-mono">v{stats.activePromptVersion}</span>
        </div>
      </div>

      <div className="admin-grid-2col">
        <section className="admin-section-card">
          <h2>해석 소스 분포</h2>
          <div className="admin-source-breakdown">
            {stats.sourceBreakdown.length === 0 ? (
              <p className="admin-empty">아직 데이터 없음</p>
            ) : (
              stats.sourceBreakdown.map((s) => (
                <div key={s.source} className="admin-source-row">
                  <span className={`admin-source-badge admin-source-${s.source.toLowerCase()}`}>
                    {s.source === "LLM" ? "AI 실시간" : s.source === "CACHE" ? "캐시" : "폴백"}
                  </span>
                  <span className="admin-source-count">{s.count.toLocaleString()}건</span>
                  <div className="admin-source-bar">
                    <div
                      className="admin-source-bar-fill"
                      style={{
                        width: `${stats.totalDraws > 0 ? (s.count / stats.totalDraws) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-section-card">
          <h2>최근 뽑기</h2>
          {stats.recentDraws.length === 0 ? (
            <p className="admin-empty">아직 뽑기 기록 없음</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th>스프레드</th>
                  <th>소스</th>
                  <th>비용</th>
                  <th>시간</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDraws.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="admin-ticker">{d.ticker}</span>
                      <span className="admin-market-badge">{d.market}</span>
                    </td>
                    <td>{d.spread === "SINGLE" ? "1장" : "3장"}</td>
                    <td>
                      <span className={`admin-source-badge admin-source-${d.source.toLowerCase()}`}>
                        {d.source === "LLM" ? "AI" : d.source === "CACHE" ? "캐시" : "폴백"}
                      </span>
                    </td>
                    <td>{d.creditCost}</td>
                    <td className="admin-time">{new Date(d.createdAt).toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

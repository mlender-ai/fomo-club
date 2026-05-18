import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

async function getAnalyticsData() {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [eventCounts24h, eventCounts7d, totalEvents] = await Promise.all([
      prisma.tarotAnalyticsEvent.groupBy({
        by: ["event"],
        _count: true,
        where: { createdAt: { gte: last24h } },
        orderBy: { _count: { event: "desc" } },
      }),
      prisma.tarotAnalyticsEvent.groupBy({
        by: ["event"],
        _count: true,
        where: { createdAt: { gte: last7d } },
        orderBy: { _count: { event: "desc" } },
      }),
      prisma.tarotAnalyticsEvent.count(),
    ]);

    // 일별 이벤트 수 (7일)
    const dailyEvents = await prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT DATE("createdAt") as day, COUNT(*)::bigint as count
      FROM "TarotAnalyticsEvent"
      WHERE "createdAt" >= ${last7d}
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `.catch(() => [] as Array<{ day: string; count: bigint }>);

    // 유니크 유저 수 (7일)
    const uniqueUsers7d = await prisma.tarotAnalyticsEvent.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: last7d } },
    }).then((r: Array<{ userId: string }>) => r.length).catch(() => 0);

    return {
      eventCounts24h: eventCounts24h.map((e: { event: string; _count: number }) => ({ event: e.event, count: e._count })),
      eventCounts7d: eventCounts7d.map((e: { event: string; _count: number }) => ({ event: e.event, count: e._count })),
      totalEvents,
      uniqueUsers7d,
      dailyEvents: dailyEvents.map((d) => ({ day: String(d.day).slice(0, 10), count: Number(d.count) })),
    };
  } catch (e) {
    console.error("DB Error (Analytics):", e);
    return {
      eventCounts24h: [],
      eventCounts7d: [],
      totalEvents: 0,
      uniqueUsers7d: 0,
      dailyEvents: [],
    };
  }
}

const EVENT_LABELS: Record<string, string> = {
  app_open: "앱 실행",
  draw_start: "뽑기 시작",
  draw_complete: "뽑기 완료",
  draw_error: "뽑기 에러",
  feedback_submit: "피드백 제출",
  report_submit: "신고 제출",
  ad_loaded: "광고 로드",
  ad_shown: "광고 시청",
  ad_earned: "광고 리워드",
  ad_error: "광고 에러",
  iap_start: "결제 시작",
  iap_complete: "결제 완료",
  iap_error: "결제 에러",
  favorite_add: "즐겨찾기 추가",
  favorite_remove: "즐겨찾기 삭제",
  share_result: "결과 공유",
};

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>분석</h1>
        <p className="admin-page-desc">모바일 앱 이벤트 트래킹</p>
      </header>

      <div className="admin-metrics-grid">
        <div className="admin-metric-card">
          <span className="admin-metric-label">전체 이벤트</span>
          <span className="admin-metric-value">{data.totalEvents.toLocaleString()}</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">이벤트 (24h)</span>
          <span className="admin-metric-value">{data.eventCounts24h.reduce((s, e) => s + e.count, 0).toLocaleString()}</span>
        </div>
        <div className="admin-metric-card">
          <span className="admin-metric-label">활성 유저 (7일)</span>
          <span className="admin-metric-value admin-metric-accent">{data.uniqueUsers7d}</span>
        </div>
      </div>

      {/* 일별 이벤트 차트 */}
      <section className="admin-section-card" style={{ marginBottom: 24 }}>
        <h2>일별 이벤트 추이 (7일)</h2>
        {data.dailyEvents.length === 0 ? (
          <p className="admin-empty">데이터 없음</p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
            {data.dailyEvents.map((d) => {
              const maxCount = Math.max(...data.dailyEvents.map((dd) => dd.count), 1);
              const heightPct = (d.count / maxCount) * 100;
              return (
                <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#f4f5f7" }}>{d.count}</span>
                  <div style={{ width: "100%", height: `${heightPct}%`, minHeight: 2, background: "#6c63ff", borderRadius: 4 }} />
                  <span style={{ fontSize: 10, color: "#999" }}>{d.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="admin-grid-2col">
        <section className="admin-section-card">
          <h2>이벤트 분포 (24h)</h2>
          {data.eventCounts24h.length === 0 ? (
            <p className="admin-empty">이벤트 없음</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>이벤트</th><th>건수</th></tr>
              </thead>
              <tbody>
                {data.eventCounts24h.map((e) => (
                  <tr key={e.event}>
                    <td>{EVENT_LABELS[e.event] ?? e.event}</td>
                    <td><strong>{e.count}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin-section-card">
          <h2>이벤트 분포 (7일)</h2>
          {data.eventCounts7d.length === 0 ? (
            <p className="admin-empty">이벤트 없음</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>이벤트</th><th>건수</th></tr>
              </thead>
              <tbody>
                {data.eventCounts7d.map((e) => (
                  <tr key={e.event}>
                    <td>{EVENT_LABELS[e.event] ?? e.event}</td>
                    <td><strong>{e.count}</strong></td>
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

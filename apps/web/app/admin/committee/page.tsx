import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readCommitteeRunReports, readPublishedCommitteeSnapshot } from "../../../lib/expert-review-store";

const gradeColor = (grade: string) => grade === "A" ? "#d8ff3a" : grade === "B" ? "#f4f5f7" : "#8a8f98";

export default async function CommitteeAuditPage() {
  const password = process.env.DASHBOARD_PASSWORD;
  const session = (await cookies()).get("dashboard_session")?.value;
  if (!password || session !== password) redirect("/login");

  const [active, runs] = await Promise.all([
    readPublishedCommitteeSnapshot(),
    readCommitteeRunReports(14),
  ]);
  const latest = runs[0];

  return (
    <main style={{ minHeight: "100vh", padding: "28px clamp(18px, 4vw, 56px)", background: "#050506", color: "#f4f5f7" }}>
      <header style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 24, borderBottom: "1px solid #25262a", paddingBottom: 18 }}>
        <div>
          <p className="eyebrow">FOMO CLUB / DAILY REVIEW</p>
          <h1 style={{ marginTop: 8, fontSize: 28 }}>전문가 위원회 감사</h1>
        </div>
        <div style={{ textAlign: "right", color: "#a6acb6", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          <div>{active ? `ACTIVE ${active.runId}` : "NO ACTIVE RUN"}</div>
          <div style={{ marginTop: 5 }}>{active?.reviewedAt ?? "-"}</div>
        </div>
      </header>

      {latest && (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", borderBottom: "1px solid #25262a" }}>
          {[
            ["상태", latest.status],
            ["후보", latest.candidateCount],
            ["승인", latest.selectedCount],
            ["AI 호출", latest.callCount],
            ["모델", latest.model],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: "18px 16px", borderRight: "1px solid #25262a" }}>
              <div className="eyebrow">{label}</div>
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 18 }}>{String(value)}</div>
            </div>
          ))}
        </section>
      )}

      <section style={{ padding: "24px 0", borderBottom: "1px solid #25262a" }}>
        <p className="eyebrow">RUN HISTORY</p>
        <div style={{ marginTop: 12, display: "grid", gap: 1, background: "#25262a" }}>
          {runs.map((run) => (
            <div key={run.runId} style={{ display: "grid", gridTemplateColumns: "140px minmax(180px, 1fr) 90px 90px 90px", gap: 12, padding: "12px 14px", background: "#0c0d10", fontSize: 13 }}>
              <span>{run.date}</span><span style={{ fontFamily: "var(--font-mono)", color: "#a6acb6" }}>{run.runId}</span>
              <span style={{ color: run.status === "published" ? "#d8ff3a" : "#e16a5a" }}>{run.status}</span>
              <span>{run.selectedCount}/{run.candidateCount}</span><span>{run.callCount} calls</span>
            </div>
          ))}
          {runs.length === 0 && <div style={{ padding: 18, background: "#0c0d10", color: "#8a8f98" }}>실행 이력이 없습니다.</div>}
        </div>
      </section>

      {latest && (
        <section style={{ padding: "24px 0" }}>
          <p className="eyebrow">LATEST DECISIONS</p>
          <p style={{ marginTop: 10, color: "#a6acb6", lineHeight: 1.7 }}>{latest.compositionSummary}</p>
          <div style={{ marginTop: 18, borderTop: "1px solid #25262a" }}>
            {latest.reviews.map((review) => (
              <article key={review.candidateId} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.6fr) minmax(260px, 1.7fr) minmax(260px, 1.7fr)", gap: 24, padding: "18px 0", borderBottom: "1px solid #25262a" }}>
                <div>
                  <strong>{review.canonical}</strong>
                  <div style={{ marginTop: 8, color: review.approved ? "#d8ff3a" : "#8a8f98", fontSize: 12 }}>{review.approved ? "APPROVED" : "REJECTED"}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: gradeColor(review.timingGrade) }}>T {review.timingGrade}</span>
                    <span style={{ color: gradeColor(review.valuationGrade) }}>F {review.valuationGrade}</span>
                  </div>
                </div>
                <div><p className="eyebrow">TRADING VIEW</p><p style={{ marginTop: 8, lineHeight: 1.65, color: "#d5d7dc" }}>{review.tradingView}</p></div>
                <div><p className="eyebrow">FUNDAMENTAL VIEW</p><p style={{ marginTop: 8, lineHeight: 1.65, color: "#d5d7dc" }}>{review.fundamentalView}</p>
                  {!review.approved && <p style={{ marginTop: 10, color: "#e16a5a", fontSize: 12 }}>{review.rejectionReasons.join(" · ")}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

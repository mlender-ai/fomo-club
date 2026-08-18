import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buildDeckRotationReport,
  TOP1_STAGNATION_ALERT_DAYS,
  type DeckRotationReport,
} from "../../../lib/deck-rotation-report";

/**
 * WO-DECK-01 PHASE 5 — 덱 회전율 대시보드.
 *
 * 완료조건 8("회전율 지표가 대시보드에 노출된다")과 5-1 의 알림("1위가 3일 이상 고착되면")을
 * 한 화면에서 본다. 저장된 스냅샷만 읽으므로 열어도 외부 쿼터를 쓰지 않는다.
 *
 * ★ 1위 연속일만 보지 않는다. PHASE 1 실측에서 최장 연속 1위는 5일이었는데 빅텍의 **1페이지
 *   누적 점유는 12일**이었다 — 1위 자리만 잠깐 내주고 2·3위로 내려앉는 고착은 연속일 지표에
 *   잡히지 않는다. 그래서 점유일 표를 나란히 둔다.
 */

const PASS = "#d8ff3a";
const FAIL = "#f07a6a";
const MUTED = "#8a8f98";
const HAIRLINE = "#25262a";

function Cell({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: "18px 16px", borderRight: `1px solid ${HAIRLINE}` }}>
      <div className="eyebrow">{label}</div>
      <div style={{ marginTop: 8, color: color ?? "inherit", fontFamily: "var(--font-mono)", fontSize: 16 }}>{String(value)}</div>
    </div>
  );
}

export default async function DeckRotationPage() {
  const password = process.env.DASHBOARD_PASSWORD;
  const session = (await cookies()).get("dashboard_session")?.value;
  if (!password || session !== password) redirect("/login");

  const report: DeckRotationReport = await buildDeckRotationReport(30).catch(() => ({
    generatedAt: new Date().toISOString(),
    days: [],
    top1ConsecutiveDays: 0,
    top1: null,
    stagnationAlert: false,
    page1Occupancy: [],
    page1ChangedDays: 0,
    comparableDays: 0,
  }));
  const desc = [...report.days].reverse();
  const latest = desc[0];

  return (
    <main style={{ minHeight: "100vh", padding: "28px clamp(18px, 4vw, 56px)", background: "#050506", color: "#f4f5f7" }}>
      <header style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 24, borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 18 }}>
        <div>
          <p className="eyebrow">FOMO CLUB / DECK ROTATION</p>
          <h1 style={{ marginTop: 8, fontSize: 28 }}>덱 회전율</h1>
        </div>
        <nav style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <Link href="/admin/committee" style={{ color: MUTED }}>위원회</Link>
          <Link href="/admin/quality" style={{ color: MUTED }}>품질 SLO</Link>
          <Link href="/admin/deck-rotation" style={{ color: PASS }}>덱 회전율</Link>
        </nav>
      </header>

      {report.stagnationAlert && (
        <section style={{ marginTop: 18, padding: "14px 16px", border: `1px solid ${FAIL}`, color: FAIL, fontSize: 13 }}>
          🚨 고착 알림 — <strong>{report.top1}</strong> 이(가) {report.top1ConsecutiveDays}일 연속 1위다
          (목표 {TOP1_STAGNATION_ALERT_DAYS}일 이하). 신규성 감쇠·쿨다운이 작동하는지 확인할 것.
        </section>
      )}

      <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}` }}>
        <Cell label="최신 날짜" value={latest?.date ?? "-"} />
        <Cell
          label="1위 연속일"
          value={report.top1ConsecutiveDays}
          color={report.stagnationAlert ? FAIL : PASS}
        />
        <Cell
          label="1페이지 변경일"
          value={report.comparableDays === 0 ? "-" : `${report.page1ChangedDays}/${report.comparableDays}`}
          color={report.comparableDays > 0 && report.page1ChangedDays === report.comparableDays ? PASS : FAIL}
        />
        <Cell label="덱 장수" value={latest?.deckSize ?? "-"} />
        <Cell label="신규 / 지속" value={latest ? `${latest.freshCount} / ${latest.persistentCount}` : "-"} />
        <Cell label="구성 버전" value={latest?.compositionVersion ?? "구 페이로드"} />
      </section>

      <section style={{ padding: "24px 0" }}>
        <p className="eyebrow">1페이지 누적 점유 — 연속일 지표가 놓치는 고착</p>
        <div style={{ marginTop: 12, overflowX: "auto", borderTop: `1px solid ${HAIRLINE}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr>{["종목", `1페이지 점유일 (최근 ${report.days.length}일)`, "점유율"].map((label) => (
                <th key={label} style={{ padding: 10, textAlign: "left", color: MUTED, fontSize: 10 }}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {report.page1Occupancy.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 12, color: MUTED, fontSize: 12 }}>관측치 없음 — 스냅샷이 아직 없다.</td></tr>
              )}
              {report.page1Occupancy.map((row) => {
                const share = report.days.length === 0 ? 0 : row.days / report.days.length;
                return (
                  <tr key={row.canonical} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                    <td style={{ padding: 10, fontSize: 13 }}>{row.canonical}</td>
                    <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 13, color: share > 0.5 ? FAIL : "inherit" }}>{row.days}</td>
                    <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 13 }}>{Math.round(share * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ padding: "8px 0 40px" }}>
        <p className="eyebrow">일별 회전율</p>
        <div style={{ marginTop: 12, overflowX: "auto", borderTop: `1px solid ${HAIRLINE}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
            <thead>
              <tr>{["날짜", "1페이지", "교체", "신규 진입", "신규/지속", "쿨다운", "상한 초과", "재등장", "줄인 장수", "경과일 중앙"].map((label) => (
                <th key={label} style={{ padding: 10, textAlign: "left", color: MUTED, fontSize: 10 }}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {desc.map((day) => (
                <tr key={day.date} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.date}</td>
                  <td style={{ padding: 10, fontSize: 12 }}>{day.page1.join(", ") || "-"}</td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12, color: day.page1Swapped === 0 ? FAIL : "inherit" }}>
                    {day.page1Swapped === null ? "-" : `${day.page1Swapped}/${day.page1.length}`}
                  </td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.newEntries ?? "-"}</td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.freshCount}/{day.persistentCount}</td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.cooldownApplied}</td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.agedOut}</td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.reentryCount}</td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.shrunkBy}</td>
                  <td style={{ padding: 10, fontFamily: "var(--font-mono)", fontSize: 12 }}>{day.ageDaysMedian ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 14, color: MUTED, fontSize: 11, lineHeight: 1.7 }}>
          쿨다운·상한 초과·재등장·줄인 장수는 <code>rotation</code> 이 실린 스냅샷(WO-DECK-01 배포 이후)만 값이 있다.
          그 이전 날짜는 0 으로 보이며, 구성 버전이 <code>구 페이로드</code> 인 행이 그 구간이다 — 0 을 성과로 읽지 말 것.
        </p>
      </section>
    </main>
  );
}

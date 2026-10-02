/**
 * `/me/rules` 본문 (TRADER-03 PART E) — TRADER-02 산출물. 항목마다 말한 것 / 데이터 펼쳐보기 · 불일치는 주황.
 */
import type { RulesView } from "../../lib/me/rules-view";
import { Card } from "../ui";

function kst(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

const TONE: Record<string, string> = { 일치: "is-up", 부분: "is-mute", 불일치: "is-warn" };

export function RulesBody({ view }: { view: RulesView }) {
  if (!view.ready) {
    return (
      <div className="me-page">
        <h1 className="me-display">광혁 매매법 — 준비 중</h1>
        <p className="me-netline">TRADER-02 를 맥에서 돌리면(진술 → 분석 → 규칙) 업로더가 여기에 올린다.</p>
      </div>
    );
  }
  return (
    <div className="me-page">
      <header className="me-head">
        <div className="me-head-row">
          <p className="me-eyebrow">말한 것 vs 데이터</p>
          {view.asOf ? <p className="me-asof">{kst(view.asOf)} KST</p> : null}
        </div>
        <h1 className="me-display">{view.title}</h1>
        {view.verdict ? <p className="me-netline">뒤 30% 검증: 광혁-데이터가 실계좌를 <b>{view.verdict}</b></p> : null}
      </header>
      {view.warnings.length ? (
        <ul className="me-warn">
          {view.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}
      <Card flush>
        <ul className="me-rules">
          {view.lines.map((l) => (
            <li key={l.key}>
              <details>
                <summary>
                  <span className="me-rule-label">{l.label}</span>
                  <span className="me-rule-data">{l.data}</span>
                  <span className={`me-rule-match ${TONE[l.match] ?? ""}`}>{l.match === "불일치" ? "불일치" : l.match === "부분" ? "부분 일치" : l.match}</span>
                </summary>
                <dl className="me-rule-detail">
                  <dt>말한 것(규칙)</dt>
                  <dd>{l.said}</dd>
                  {l.details.map((d) => (
                    <div key={d.item} className="me-rule-row">
                      <dt>{d.item}</dt>
                      <dd>
                        <span className="me-said">말: {d.said}</span>
                        <span className="me-data">데이터: {d.data}</span>
                        <span className={`me-rule-match ${TONE[d.match] ?? ""}`}>{d.match}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          ))}
          <li className="me-rules-disc">
            <span className="me-rule-label">재량 거래</span>
            <span className="me-rule-data">
              {view.discretionary
                ? `${view.discretionary.n}건 / ${view.discretionary.of}건 · 이익의 ${view.discretionary.shareOfGross === null ? "—" : `${Math.round(view.discretionary.shareOfGross * 100)}%`}`
                : "검증 전"}
            </span>
          </li>
        </ul>
      </Card>
      <Card title="버전" flush>
        {view.versions.length ? (
          <ul className="me-versions">
            {view.versions.map((v) => (
              <li key={v.version}>
                <b>{v.version}</b> {kst(v.at)} · 데이터 {v.data ?? "—"} · 말 {v.said ?? "—"}
                {v.afterValidation ? <span className="me-rule-match is-warn"> 검증 뒤 수정</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="me-empty">아직 동결 전</p>
        )}
      </Card>
    </div>
  );
}

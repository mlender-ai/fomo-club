/**
 * `/whale` — 고래 화면 (LAB-BRIDGE PART C-3).
 *
 * ## 이 화면이 절대 하지 않는 것: 두 승률을 빼는 것
 *
 * `고래 65.8%` 와 `우리 32.4%` 를 나란히 놓고 `33.4%p 갭` 이라고 쓰면 화면이
 * 거짓말한다. **두 수는 다른 거래 목록이다** — 거래 집합·진입 시점·가격·사이징·
 * 청산·레버리지·승패 판정이 전부 다르다. FCE 문서가 ★ 까지 붙여 적어둔 사실이다.
 *
 * 그래서 여기서는 둘을 **따로** 보여주고, 무엇을 재는 숫자인지 옆에 적고,
 * 빼지 않는다. 조사 전문은 `docs/lab/WHALE_GAP.md`.
 */
import { readFceBoard } from "../../../lib/lab/fce-board";

export const dynamic = "force-dynamic";

/** FCE `funnel.rejected` 의 키 → 사람이 읽는 말. */
const REJECT_LABEL: Record<string, string> = {
  excluded_type: "유형 제외 (MM·캐리)",
  sample_below_min: "표본 미달",
  win_rate_below_min: "승률 미달",
};

function stat(box: Record<string, unknown> | null, key: string): string {
  const value = box?.[key];
  return typeof value === "number" ? String(Math.round(value * 100) / 100) : "—";
}

export default async function WhalePage() {
  const board = await readFceBoard();
  const w = board.whale;

  if (!w) {
    return (
      <>
        <h1 className="lab-title">고래 추종</h1>
        <div className="lab-empty">
          <p className="lab-empty-brand">STRATEGY LAB</p>
          <p className="lab-empty-msg">고래 스냅샷이 아직 올라오지 않았습니다.</p>
          <p className="lab-empty-note">npm run lab:fce-upload</p>
        </div>
      </>
    );
  }

  const rejected = Object.entries(w.rejected).filter(([, n]) => n > 0);

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title">고래 추종</h1>
      </div>
      <p className="lab-summary">
        <span>FCE 거울 · {w.asOf.toISOString().slice(0, 16).replace("T", " ")} 기준</span>
      </p>

      <section>
        <p className="section-kicker">지갑 자격</p>
        <dl className="lab-stats">
          <div>
            <dt>추적 지갑</dt>
            <dd className="num">{w.walletsTotal}</dd>
          </div>
          <div>
            <dt>자격 통과</dt>
            <dd className="num">{w.eligible}</dd>
          </div>
          {rejected.slice(0, 6).map(([key, n]) => (
            <div key={key}>
              <dt>{REJECT_LABEL[key] ?? key}</dt>
              <dd className="num">{n}</dd>
            </div>
          ))}
        </dl>
        {w.passers.length > 0 ? (
          <p className="lab-note-line">
            통과:{" "}
            {w.passers.map((address) => (
              <code key={address} className="addr">
                {address.slice(0, 6)}…{address.slice(-4)}
              </code>
            ))}
          </p>
        ) : null}
      </section>

      {/* ── 이 화면의 주인공 ────────────────────────────────────────────── */}
      <section>
        <p className="section-kicker">두 승률 — 빼지 않는다</p>
        <div className="lab-two">
          <div className="lab-two-item">
            <p className="lab-two-value num">65.8%</p>
            <p className="lab-two-label">고래 자신의 승률</p>
            <p className="lab-two-note">그 지갑의 온체인 체결 전부. 고래의 자본·판단·출구.</p>
          </div>
          <div className="lab-two-item">
            <p className="lab-two-value num">
              {w.followWinPct === null ? "—" : `${w.followWinPct.toFixed(1)}%`}
            </p>
            <p className="lab-two-label">우리 추종 승률</p>
            <p className="lab-two-note">
              우리가 따라 들어간 {w.followTrades ?? "—"}건. 우리 사이징·우리 출구.
            </p>
          </div>
        </div>
        <p className="lab-warning is-loud">
          <strong>두 수를 빼면 안 된다.</strong> 거래 목록·진입 시점·진입 가격·사이징·청산·
          레버리지·승패 판정이 전부 다른 모집단이다. 33.4%p 는 갭이 아니라{" "}
          <strong>서로 다른 질문의 답 두 개</strong>다.
        </p>
      </section>

      <section>
        <p className="section-kicker">그래서 무엇이 원인인가</p>
        <div className="lab-board-scroll">
          <table className="lab-board">
            <thead>
              <tr>
                <th className="l">축</th>
                <th className="l">실측</th>
                <th className="l">판정</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="name">청산 규칙</td>
                <td>고래 청산을 그대로 따랐다면 −49.58 (75건)</td>
                <td className="state ok">원인 아님 — 따라가면 더 나빴다</td>
              </tr>
              <tr>
                <td className="name">진입 지연</td>
                <td className="num">
                  중앙값 {stat(w.latency, "median")}분 · p90 {stat(w.latency, "p90")}분 · 최대{" "}
                  {stat(w.latency, "max")}분
                </td>
                <td className="state">중앙값이 1분 안 — 약한 후보</td>
              </tr>
              <tr>
                <td className="name">진입 가격 드리프트</td>
                <td className="num">
                  중앙값 {stat(w.drift, "median")}% · p90 {stat(w.drift, "p90")}% · 최대{" "}
                  {stat(w.drift, "max")}%
                </td>
                <td className="state">손절폭 대비. p90 구간을 따로 볼 것</td>
              </tr>
              <tr className="is-stopped">
                <td className="name">사이징</td>
                <td>—</td>
                <td className="state off">미측정</td>
              </tr>
              <tr className="is-stopped">
                <td className="name">지갑 선정</td>
                <td>통과 {w.eligible}개의 사후 성적</td>
                <td className="state off">미측정 — 리더보드에 재료 있음</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="lab-note-line">
          옳은 비교는 <strong>같은 거래 목록 위에서 한 축만 바꾸는 것</strong>이다. 반사실
          −49.58 이 그렇게 잰 값이다. 조사 전문은 <code>docs/lab/WHALE_GAP.md</code>.
        </p>
      </section>

      <section>
        <p className="section-kicker">추종 트랙 성적</p>
        <dl className="lab-stats">
          <div>
            <dt>거래</dt>
            <dd className="num">{w.followTrades ?? "—"}</dd>
          </div>
          <div>
            <dt>승률</dt>
            <dd className="num">
              {w.followWinPct === null ? "—" : `${w.followWinPct.toFixed(1)}%`}
            </dd>
          </div>
          <div>
            <dt>손익비</dt>
            <dd className="num">{w.followPf === null ? "—" : w.followPf.toFixed(3)}</dd>
          </div>
          <div>
            <dt>실현</dt>
            <dd className={`num ${(w.followNetUsdt ?? 0) < 0 ? "down" : "up"}`}>
              {w.followNetUsdt === null ? "—" : `${w.followNetUsdt.toFixed(2)} USDT`}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

import { describeAge } from "@fomo/lab";

import { readDataStatus } from "../../../lib/lab/data-status";

/**
 * 데이터 상태 화면 — LAB-03 PART B-2 "화면에 표시".
 *
 * 표 하나다(LAB-00 §4-4). **끊김과 구멍을 숨기지 않는 것**이 이 화면의 전부다.
 */
export const dynamic = "force-dynamic";

function Dot({ ok }: { ok: boolean }) {
  return <span className={ok ? "up" : "down"}>●</span>;
}

export default async function DataPage() {
  const status = await readDataStatus();

  return (
    <>
      <h1 className="lab-title">데이터</h1>

      <section style={{ marginBottom: 28 }}>
        <p className="section-kicker" style={{ marginBottom: 8 }}>
          실시간 시세 {status.feed.ok ? "" : "— 신규 진입 중지"}
        </p>
        {status.feed.symbols.length === 0 ? (
          <p className="lab-empty-msg">수신 없음</p>
        ) : (
          <div className="lab-scroll">
            <table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>상태</th>
                  <th>마지막 수신</th>
                </tr>
              </thead>
              <tbody>
                {status.feed.symbols.map((s) => (
                  <tr key={s.symbol}>
                    <td className="num">{s.symbol}</td>
                    <td className={s.status === "fresh" ? "up" : "down"}>
                      {s.status === "fresh"
                        ? "정상"
                        : s.status === "stale"
                          ? "끊김"
                          : "없음"}
                    </td>
                    <td className="num">{describeAge(s.ageMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!status.feed.ok ? (
          <p className="lab-empty-note">
            끊긴 채로 매매하면 성과가 거짓이 된다 — 페이퍼 실행기가 신규 진입을
            멈춘다.
          </p>
        ) : null}
      </section>

      <section style={{ marginBottom: 28 }}>
        <p className="section-kicker" style={{ marginBottom: 8 }}>
          봉
        </p>
        {status.candles.length === 0 ? (
          <p className="lab-empty-msg">아직 데이터가 없습니다.</p>
        ) : (
          <div className="lab-scroll">
            <table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>주기</th>
                  <th>봉</th>
                  <th>구멍</th>
                  <th>마지막</th>
                </tr>
              </thead>
              <tbody>
                {status.candles.map((c) => {
                  const gap = status.gaps.find(
                    (g) => g.symbol === c.symbol && g.interval === c.interval,
                  );
                  return (
                    <tr key={`${c.symbol}-${c.interval}`}>
                      <td className="num">{c.symbol}</td>
                      <td className="num">{c.interval}</td>
                      <td className="num">{c.count.toLocaleString()}</td>
                      <td
                        className={gap && gap.missing > 0 ? "num down" : "num"}
                      >
                        {gap ? `${gap.missing} (${gap.intervals}구간)` : "0"}
                      </td>
                      <td className="num">
                        {c.last?.toISOString().slice(0, 16) ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="lab-empty-note">
          구멍은 메우지 않는다. 백테스트가 그 구간을 건너뛴다.
        </p>
      </section>

      <section>
        <p className="section-kicker" style={{ marginBottom: 8 }}>
          수집 잡
        </p>
        {status.jobs.length === 0 ? (
          <p className="lab-empty-msg">실행 기록 없음</p>
        ) : (
          <div className="lab-scroll">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>잡</th>
                  <th>행</th>
                  <th>연속 실패</th>
                  <th>마지막 실행</th>
                </tr>
              </thead>
              <tbody>
                {status.jobs.map((j) => (
                  <tr key={j.job}>
                    <td>
                      <Dot ok={j.ok} />
                    </td>
                    <td className="num">{j.job}</td>
                    <td className="num">{j.rows.toLocaleString()}</td>
                    <td
                      className={j.consecutiveFailures > 0 ? "num down" : "num"}
                    >
                      {j.consecutiveFailures}
                    </td>
                    <td className="num">
                      {j.finishedAt.toISOString().slice(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

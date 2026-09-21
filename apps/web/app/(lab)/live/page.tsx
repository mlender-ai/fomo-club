/**
 * `/live` — 전광판. **FCE 5트랙을 그대로 비춘다**(LAB-BRIDGE PART C).
 *
 * 랩은 엔진이 아니다. 여기 있는 숫자는 전부 FCE 가 낸 것이고, 랩이 하는 일은
 * **읽어서 보여주는 것과, 언제 끊겼는지 말하는 것** 둘뿐이다.
 *
 * ## 이 화면이 지키는 것
 *
 *  - 수익률은 **실현 기준**. 미실현은 옆 칸에 따로
 *  - 정지·보류는 **사유를 옆에** — 사유 없는 정지는 화면이 이유를 못 말한다
 *  - **레버리지를 숨기지 않는다** — MDD 가 배수에서 나온 숫자다
 *  - 손익 −90% 아래 포지션에 **청산 수준 경고** — FCE 에 청산 모델이 없다
 *  - 마지막 갱신과 **끊김 구간**을 표 위에
 */
import Link from "next/link";

import { readFceBoard, type FcePositionRow, type FceTrackRow } from "../../../lib/lab/fce-board";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { mark: string; label: string; tone: string }> = {
  running: { mark: "●", label: "운용중", tone: "ok" },
  held: { mark: "⚠", label: "보류", tone: "warn" },
  stopped: { mark: "⛔", label: "정지", tone: "bad" },
  excluded: { mark: "⛔", label: "제외", tone: "off" },
};

function money(value: number | null, currency: string): string {
  if (value === null) return "—";
  const digits = currency === "KRW" ? 0 : 2;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function sign(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "up" : "down";
}

function ageText(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / (60 * 24))}일 전`;
}

function stamp(at: Date): string {
  return at.toISOString().slice(5, 16).replace("T", " ");
}

function TrackRow({ track }: { track: FceTrackRow }) {
  const state = STATUS[track.status] ?? STATUS.running;
  return (
    <tr className={track.status === "running" ? "" : "is-stopped"}>
      <td className="name">
        {track.label}
        {/* **레버리지를 숨기지 않는다**(PART D-2). */}
        {track.leverage ? <span className="lab-tag">{track.leverage}x</span> : null}
      </td>
      <td className="num">
        {money(track.startingCapital, track.currency)} → {money(track.currentCapital, track.currency)}
        <span className="cur">{track.currency}</span>
      </td>
      <td className={`num ${sign(track.returnPct)}`}>{pct(track.returnPct)}</td>
      <td className={`num ${sign(track.unrealized)}`}>{money(track.unrealized, track.currency)}</td>
      <td className="num">{track.trades ?? "—"}</td>
      <td className="num">{track.winRatePct === null ? "—" : `${track.winRatePct.toFixed(1)}%`}</td>
      <td className="num">{track.profitFactor === null ? "—" : track.profitFactor.toFixed(2)}</td>
      <td className={`num ${track.mddPct !== null && track.mddPct > 30 ? "down" : ""}`}>
        {track.mddPct === null ? "—" : `${track.mddPct.toFixed(2)}%`}
      </td>
      <td className={`state ${state?.tone ?? ""}`}>
        <span aria-hidden>{state?.mark}</span> {state?.label}
      </td>
    </tr>
  );
}

function PositionRow({ position }: { position: FcePositionRow }) {
  return (
    <tr className={position.liquidationLevel ? "is-danger" : ""}>
      <td className="name">{position.symbol}</td>
      <td>{position.direction === "short" ? "숏" : "롱"}</td>
      <td className="num">{position.leverage ? `${position.leverage}x` : "—"}</td>
      <td className={`num ${sign(position.netReturnPct)}`}>{pct(position.netReturnPct)}</td>
      <td className="num">{position.healthScore ?? "—"}</td>
      <td className="warn-cell">
        {position.liquidationLevel ? <span className="down">⚠ 청산 수준</span> : null}
      </td>
    </tr>
  );
}

export default async function LivePage() {
  const board = await readFceBoard();
  const { freshness: f } = board;

  if (board.tracks.length === 0) {
    return (
      <>
        <h1 className="lab-title">전광판</h1>
        <div className="lab-empty">
          <p className="lab-empty-brand">STRATEGY LAB</p>
          <p className="lab-empty-msg">FCE 스냅샷이 아직 올라오지 않았습니다.</p>
          <p className="lab-empty-note">npm run lab:fce-upload</p>
        </div>
      </>
    );
  }

  const danger = board.positions.filter((p) => p.liquidationLevel).length;

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title">전광판</h1>
        <span className={`lab-fresh ${f.stale ? "is-stale" : "is-live"}`}>
          <span aria-hidden>{f.stale ? "○" : "●"}</span>{" "}
          {f.lastAt ? `${ageText(f.ageMs ?? 0)} 갱신` : "갱신 없음"}
        </span>
      </div>

      <p className="lab-summary">
        <span>FCE 거울 · 5트랙 · 전부 페이퍼</span>
        <strong>실주문 없음</strong>
        <span>수익률은 실현 기준</span>
      </p>

      {/* PART B-4 — 호스트가 자면 여기가 먼저 말한다. */}
      {f.stale ? (
        <p className="lab-warning is-loud">
          {f.lastAt
            ? `FCE 스냅샷이 ${ageText(f.ageMs ?? 0)}에서 멈춰 있다 (${stamp(f.lastAt)} 기준). 아래 숫자는 그 시각의 것이다.`
            : "FCE 스냅샷이 한 번도 올라오지 않았다."}
          {" "}업로더가 이 맥에서 돌아야 한다 — <code>npm run lab:fce-upload -- --watch</code>
        </p>
      ) : null}

      {f.lastError ? (
        <p className="lab-warning">
          마지막 실패 {stamp(f.lastError.at)} — {f.lastError.error.slice(0, 160)}
        </p>
      ) : null}

      {f.gaps.length > 0 ? (
        <p className="lab-warning">
          끊김 {f.gaps.length}구간 —{" "}
          {f.gaps
            .map((g) => `${stamp(g.from)} ~ ${stamp(g.to)} (${g.minutes}분)`)
            .join(" · ")}
          . <strong>메우지 않는다.</strong>
        </p>
      ) : null}

      <div className="lab-board-scroll">
        <table className="lab-board">
          <thead>
            <tr>
              <th className="l">트랙</th>
              <th>자본</th>
              <th>실현 수익률</th>
              <th>미실현</th>
              <th>N</th>
              <th>승률</th>
              <th>PF</th>
              <th>MDD</th>
              <th className="l">상태</th>
            </tr>
          </thead>
          <tbody>
            {board.tracks.map((track) => (
              <TrackRow key={track.key} track={track} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 정지·보류·표본 사유를 트랙마다 한 줄씩. **비워두지 않는다.** */}
      {board.tracks
        .filter((t) => t.statusReason || t.sampleNote || t.evidenceNote)
        .map((t) => (
          <p key={t.key} className="lab-halt">
            <span className="lab-nonrank">{STATUS[t.status]?.label ?? t.status}</span> {t.label} —{" "}
            {[t.statusReason, t.sampleNote, t.evidenceNote].filter(Boolean).join(" · ")}
          </p>
        ))}

      <section>
        <p className="section-kicker">
          보유 포지션 {board.positions.length}건
          {danger > 0 ? <span className="down"> · 청산 수준 {danger}건</span> : null}
        </p>
        {board.positions.length === 0 ? (
          <p className="lab-empty-note">들고 있는 것이 없다.</p>
        ) : (
          <div className="lab-board-scroll">
            <table className="lab-board">
              <thead>
                <tr>
                  <th className="l">심볼</th>
                  <th className="l">방향</th>
                  <th>레버</th>
                  <th>손익</th>
                  <th>건강도</th>
                  <th className="l" />
                </tr>
              </thead>
              <tbody>
                {board.positions.map((position) => (
                  <PositionRow key={position.id} position={position} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="lab-note-line">
          손익은 <strong>증거금 대비</strong>다. FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다 —
          실제 거래소였으면 그 전에 증거금이 없어진다.{" "}
          <Link href="/whale">고래 화면</Link>·
          <Link href="/data">데이터</Link>
        </p>
      </section>
    </>
  );
}

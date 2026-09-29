"use client";

/**
 * 연구 탭 "실험 중" (ENG-02 H).
 *
 * ```
 * 실험 중                                  누적 시도 7
 * #07  진입 비용 상한 0.16 → 0.12   9일 · 거래 21/30   ━━━━━━━░░░
 * ```
 *
 * - **판정 전에는 결과 숫자를 보이지 않는다** — 진행(거래 · 일)만. 중간에 보고 흔들리지 않게
 * - 누르면 본 트랙 · 그림자 누적 손익 곡선을 겹쳐 본다(모양만 · 축 숫자 없이)
 * - 판정이 나면 노트로 간다 · 승인 대기는 텔레그램 `/approve N`
 * - 누적 시도 수는 되돌리지 않는다 — 실패한 실험도 여기 남는다
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { useLab } from "../shell/useLab";
import { AreaChartCard, Card, Pill } from "../ui";

interface Item {
  number: number;
  label: string;
  baseline: unknown;
  value: unknown;
  status: string;
  reportOnly: boolean;
  question: string;
  days: number;
  trades: number;
  criteria: { minTrades: number; minDays: number; extensionDays: number };
  extended: boolean;
  noteNo: string | null;
  appliedVersion: string | null;
  curves: { main: { at: string; value: number }[]; shadow: { at: string; value: number }[] } | null;
}

interface View {
  tries: number;
  limit: number;
  items: Item[];
}

const STATUS: Record<string, { label: string; tone: "blue" | "mute" | "up" | "dn" | "warn" }> = {
  filtering: { label: "거르는 중", tone: "mute" },
  running: { label: "운용 중", tone: "blue" },
  extended: { label: "연장", tone: "warn" },
  awaiting: { label: "승인 대기", tone: "up" },
  reported: { label: "보고", tone: "up" },
  failed: { label: "없음", tone: "mute" },
  inconclusive: { label: "판단 불가", tone: "mute" },
  invalid: { label: "무효", tone: "dn" },
  discarded: { label: "걸러짐", tone: "mute" },
  approved: { label: "반영", tone: "up" },
  rejected: { label: "기각", tone: "mute" },
};

const pad = (n: number) => String(n).padStart(2, "0");

export function ExperimentsCard() {
  const { state } = useLab<View>("/api/lab/experiments", 60_000);
  const [open, setOpen] = useState<number | null>(null);
  const view = state.kind === "ready" ? state.data : null;
  const live = view ? view.items.filter((i) => ["filtering", "running", "extended", "awaiting"].includes(i.status)) : [];
  const past = view ? view.items.filter((i) => !live.includes(i)) : [];

  return (
    <Card
      title="실험 중"
      aside={view ? <span className="rs-days">누적 시도 {view.tries}</span> : null}
      info={
        <>
          <p>
            엔진이 자기 성과에서 약점을 찾아 가설을 세우고, 파라미터 하나만 바꾼 그림자로 본 트랙과 같은 신호를 따로 돌린다.
            판정 기준(거래 30건 · 14일 · 수익÷낙폭 · 우연 확률 20% 미만 · 비용 후 손익)은 시작할 때 잠근다.
          </p>
          <p>
            우연 확률은 지금까지 시작한 그림자 전부를 시도 수로 넣어 보정한다 — 시도할수록 통과가 어려워진다. 판정 전에는
            결과 숫자를 보이지 않는다. 적용은 사람이 승인한다(텔레그램 /approve 번호).
          </p>
        </>
      }
      flush
    >
      {state.kind === "loading" ? <p className="sh-note">불러오는 중…</p> : null}
      {view && view.items.length === 0 ? <p className="sh-note">아직 실험이 없다 — 매일 07:30 관측에서 가설이 생긴다</p> : null}
      {live.length > 0 ? (
        <ul className="rs-exp">
          {live.map((i) => (
            <Row key={i.number} i={i} open={open === i.number} onToggle={() => setOpen(open === i.number ? null : i.number)} />
          ))}
        </ul>
      ) : null}
      {past.length > 0 ? (
        <ul className="rs-exp is-past">
          {past.map((i) => (
            <Row key={i.number} i={i} open={open === i.number} onToggle={() => setOpen(open === i.number ? null : i.number)} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Row({ i, open, onToggle }: { i: Item; open: boolean; onToggle: () => void }) {
  const st = STATUS[i.status] ?? { label: i.status, tone: "mute" as const };
  const minDays = i.criteria.minDays + (i.extended ? i.criteria.extensionDays : 0);
  const progress = Math.min(1, Math.min(i.trades / i.criteria.minTrades, i.days / minDays));
  const live = ["running", "extended"].includes(i.status);
  return (
    <li className="rs-exp-row">
      <button type="button" className="rs-exp-head" aria-expanded={open} onClick={onToggle}>
        <span className="rs-exp-no">#{pad(i.number)}</span>
        <span className="rs-exp-what">
          {i.label} {String(i.baseline)} → {String(i.value)}
        </span>
        <Pill tone={st.tone}>{st.label}</Pill>
      </button>
      {live ? (
        <div className="rs-exp-progress">
          <span className="rs-exp-meta">
            {i.days}일 · 거래 {i.trades}/{i.criteria.minTrades}
          </span>
          <span className="rs-exp-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        </div>
      ) : null}
      {i.status === "awaiting" ? <p className="rs-exp-meta">텔레그램 /approve {i.number} · /reject {i.number} 사유</p> : null}
      {i.noteNo ? (
        <p className="rs-exp-meta">
          판정 노트 <Link href={`/research/${i.noteNo}`}>{i.noteNo}</Link>
          {i.appliedVersion ? ` · 반영 ${i.appliedVersion}` : ""}
        </p>
      ) : null}
      {open && i.curves ? <Curves curves={i.curves} /> : null}
    </li>
  );
}

/** 본 트랙 · 그림자 누적 손익 — **숫자 축 없이**(compact). 판정 전에 숫자로 흔들리지 않게. */
function Curves({ curves }: { curves: NonNullable<Item["curves"]> }) {
  const points = useMemo(() => {
    const ts = [...new Set([...curves.main, ...curves.shadow].map((p) => p.at))].sort();
    let m = 0;
    let s = 0;
    return ts.map((at) => {
      m = curves.main.find((p) => p.at === at)?.value ?? m;
      s = curves.shadow.find((p) => p.at === at)?.value ?? s;
      return { at, value: s, benchmark: m };
    });
  }, [curves]);
  if (points.length < 2) return <p className="sh-note">청산된 거래가 쌓이면 곡선이 나온다</p>;
  return <AreaChartCard compact step height={140} data={points} seriesLabel="그림자" benchmarkLabel="본 트랙" format={() => ""} />;
}

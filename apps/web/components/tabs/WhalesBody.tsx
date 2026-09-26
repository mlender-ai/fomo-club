"use client";

/**
 * 고래 본문 (UI-07 · UI-FIX C-6).
 *
 * ```
 * ┌ ① 갭 Hero ─────────────────────┬ ⑤ 관련 연구 + 확인 중인 가설 ┐
 * │ ② 갭 비교 + 반사실              │ ⑥ 24시간 관측               │
 * │ ③ 추적 지갑                     │ ⑦ 리더보드                  │
 * └ ④ 지갑 자격 깔때기 ─────────────┴────────────────────────────┘
 * ```
 *
 * **숫자는 FCE 가 같은 대조 표본에서 낸 것이다**(`lib/lab/whales.ts`). 박아 둔 65.8% 는 버렸다.
 *
 * 모집단 경고는 **Hero 바로 아래 한 줄**로 둔다(UI-07 B — 반드시). UI-FIX 는 `모집단` 을 내부 용어로 막고
 * 알약 하나만 허용했는데, UI-07 이 이 문장과 리더보드 주석을 필수로 정했다 — 이 두 문장만 예외다
 * (`__tests__/text-budget.test.ts`).
 *
 * 지갑 주소는 **앞 6 · 뒤 4** 뿐이다. 전체 주소는 업로더 밖으로 나오지 않는다.
 */
import Link from "next/link";

import { PageFrame } from "../shell/PageFrame";
import { useSyncHint } from "../shell/SyncProvider";
import {
  AssetRow,
  Card,
  DataTable,
  Empty,
  Hero,
  Pill,
  ResearchItem,
  StatGroup,
  money,
  num,
  pct,
  tone,
  usdCompact,
  type ResearchStatus,
} from "../ui";
import { sideLabel } from "../../lib/lab/labels";
import type { Wire } from "../../lib/lab/wire";
import { typeLabel } from "../../lib/lab/whales";

type Whales = Wire<"whales">;
type Board = NonNullable<Whales["board"]>;

/** UI-07 B · H 가 필수로 정한 두 문장. 텍스트 예산 테스트가 이 둘만 `모집단` 예외로 둔다. */
export const POPULATION_WARNING = "⚠ 두 승률은 다른 모집단이다 — 비교 가능 여부 확인 중";
export const LEADERBOARD_NOTE = "※ 고래 자신의 체결 승률 — 추종 승률과 다른 모집단";

const pctOrDash = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
const hours = (h: number | null) => (h === null ? "—" : h < 48 ? `${h.toFixed(1)}시간` : `${(h / 24).toFixed(1)}일`);

export function WhalesBody({ data }: { data: Whales }) {
  const hint = useSyncHint();
  const b = data.board;
  if (!data.whale || !b) {
    return (
      <PageFrame title="고래">
        <Empty title="고래 데이터가 아직 없어요" reason={hint ?? "FCE 가 고래 추종 스냅샷을 올리면 여기 뜹니다."} />
      </PageFrame>
    );
  }
  const g = b.gap;

  return (
    <PageFrame
      title="고래"
      description="고래를 따라간 결과"
      info={
        <>
          <p>
            고래 승률은 고래 자신의 체결 손익(FCE `whale_events.closed_pnl`)이고, 우리 승률은 그 신호를 우리 사이징·비용·출구로
            거래한 결과(`whale_follow_trades`)다. 같은 것을 재지 않으므로 갭의 일부는 정의상 생긴다 — FCE 도 얼마가 정의
            차이인지는 이 대조만으로 가를 수 없다고 적는다.
          </p>
          {g?.sampleNote ? <p>FCE 대조 표본: {g.sampleNote}</p> : null}
          <p>화면은 30초마다 다시 읽는다. 값은 Mac 업로더가 FCE 를 읽을 때(15분마다) 바뀐다.</p>
        </>
      }
      side={
        <>
          <ResearchCard b={b} />
          <ObservationCard b={b} />
          <LeaderboardCard b={b} />
        </>
      }
    >
      {/* ① 갭 Hero */}
      <Hero
        // 숫자 아래 보조는 16자다(UI-FIX A-2) — "고래 · 우리" 는 라벨로 올린다.
        label="고래 승률 − 우리 추종 승률"
        value={g?.gapPp === null || g?.gapPp === undefined ? "—" : `${g.gapPp.toFixed(1)}%p`}
        meta={`${pctOrDash(g?.whaleWinPct)} − ${pctOrDash(g?.followWinPct)}`}
      />
      <p className="sh-alert">{POPULATION_WARNING}</p>

      {/* ② 갭 비교 + 반사실 */}
      <CompareCard b={b} />

      {/* ③ 추적 지갑 */}
      <WalletsCard b={b} />

      {/* ④ 깔때기 */}
      <FunnelCard b={b} />
    </PageFrame>
  );
}

function CompareCard({ b }: { b: Board }) {
  const cell = (v: number | null | undefined, unit: string) => {
    if (v === null || v === undefined) return "—";
    if (unit === "pct") return `${v.toFixed(1)}%`;
    if (unit === "count") return String(v);
    if (unit === "hours") return hours(v);
    if (unit === "minutes") return `${v.toFixed(1)}분`;
    return num(v);
  };
  const e = b.exit;
  return (
    <Card
      title="갭 비교"
      description="같은 대조 표본 · FCE"
      flush
      info={
        <>
          <p>빈칸은 FCE 가 고래 쪽으로 내지 않는 값이다. 보유 중앙값은 대조된 거래에서 우리 출구와 고래 청산까지의 시간이다.</p>
          {e?.caveat ? <p>{e.caveat}</p> : null}
          {e?.reason ? <p>FCE 판정: {e.reason}</p> : null}
        </>
      }
    >
      <DataTable
        caption="고래와 우리 추종 비교"
        columns={[
          { key: "k", label: "" },
          { key: "whale", label: "고래", numeric: true },
          { key: "ours", label: "우리 (추종)", numeric: true },
        ]}
        rows={[
          ...b.compare.map((r) => ({
            key: r.label,
            k: r.label,
            whale: cell(r.whale, r.unit),
            ours:
              r.unit === "minutes" && "p90" in r && r.p90 != null
                ? `${cell(r.ours, r.unit)} · p90 ${cell(r.p90, r.unit)}`
                : cell(r.ours, r.unit),
          })),
          { key: "exit", k: "청산 방식", whale: "고래 판단", ours: "우리 규칙" },
        ]}
      />
      {e ? (
        <div className="wh-counter">
          <p className="wh-counter-title">반사실 · 고래 청산을 그대로 따랐다면</p>
          <p className="wh-counter-body">
            <span className={`ui-num is-${tone(e.whaleNet)}`}>{money(e.whaleNet, "USDT")}</span>
            <span className="wh-counter-vs">
              우리 <span className={`is-${tone(e.oursNet)}`}>{money(e.oursNet, "USDT")}</span> · {e.count}건
            </span>
          </p>
          {e.caveat ? <p className="sh-note">⚠ 우리 출구에 결함이 있다 — 확정 아님</p> : null}
        </div>
      ) : null}
    </Card>
  );
}

function WalletsCard({ b }: { b: Board }) {
  return (
    <Card title={`추적 지갑 ${b.wallets.length}개`} description="추종 자격 통과 · 주소 앞뒤만" flush>
      <ul className="ui-rows">
        {b.wallets.map((w) => {
          const levs = w.positions.map((p) => p.leverage).filter((v): v is number => v !== null);
          const lev = levs.length ? (Math.min(...levs) === Math.max(...levs) ? `${levs[0]}배` : `${Math.min(...levs)}~${Math.max(...levs)}배`) : null;
          const top = [...w.positions].sort((x, y) => (y.sizeUsd ?? 0) - (x.sizeUsd ?? 0))[0];
          return (
            <AssetRow
              key={w.key}
              icon="🐋"
              name={w.short}
              subtitle={[`승률 ${pctOrDash(w.winPct)}`, `N ${w.sampleSize ?? "—"}`, lev].filter(Boolean).join(" · ")}
              value={<Pill tone="up">추종중</Pill>}
              subValue={top ? `${top.coin} ${sideLabel(top.side)} ${usdCompact(top.sizeUsd)}` : "보유 없음"}
              href={`/whales/${w.key}`}
            />
          );
        })}
      </ul>
    </Card>
  );
}

function FunnelCard({ b }: { b: Board }) {
  const f = b.funnel;
  if (!f) return null;
  const top = f.stages[0]?.left ?? 1;
  return (
    <Card
      title="지갑 자격"
      description={`${f.population}개 → ${f.eligible}개`}
      info={
        <>
          <p>FCE 가 떨어뜨리는 순서 그대로다 — 유형 → 표본 → 승률. 지갑마다 사유는 하나다.</p>
          {f.populationNote ? <p>{f.populationNote}</p> : null}
          {!f.consistent ? <p>단계를 빼 나간 끝이 FCE 통과 수와 다르다 — FCE 분해가 바뀌었다.</p> : null}
        </>
      }
    >
      <ol className="wh-funnel">
        {f.stages.map((s) => (
          <li key={s.label}>
            {s.removed !== null ? (
              <span className="wh-funnel-cut">
                −{s.removed} {s.reason}
              </span>
            ) : null}
            <div className="wh-funnel-row">
              <span className="wh-funnel-bar" style={{ width: `${Math.max(2, (s.left / top) * 100)}%` }} />
              <span className="wh-funnel-n">{s.left}</span>
              <span className="wh-funnel-label">{s.label}</span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ResearchCard({ b }: { b: Board }) {
  const hyps = b.gap?.hypotheses ?? [];
  return (
    <Card title="관련 연구" aside={<Link href="/research">전부</Link>} flush>
      <ul className="ui-research">
        {b.research.map((r) => (
          <ResearchItem
            key={r.no}
            no={r.no}
            title={r.title}
            status={r.status as ResearchStatus}
            summary={r.summary}
            blocks={r.blocks}
            href={`/research/${r.no}`}
          />
        ))}
      </ul>
      {hyps.length > 0 ? (
        <div className="wh-hyps">
          <p className="wh-hyps-title">확인 중인 가설 · FCE</p>
          <ul>
            {hyps.map((h) => (
              <li key={h.id}>
                <span>{h.label}</span>
                <Pill tone={h.consistent ? "warn" : "mute"}>{h.consistent ? "정합" : "안 맞음"}</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function ObservationCard({ b }: { b: Board }) {
  const o = b.observation;
  return (
    <Card
      title="24시간 관측"
      info={
        <p>
          FCE 가 고래 다중체결 알림을 전부 미검증으로 강등해 푸시하지 않은 것의 24시간 집계다(FCE 일일 리포트와 같은 식).
          {o?.maxSample != null ? ` 사후 채점 표본 최대 ${o.maxSample}건.` : ""}
        </p>
      }
    >
      {o ? (
        <>
          <StatGroup
            stats={[
              { label: "다중체결", value: `${o.bursts}건` },
              { label: "지갑", value: `${o.wallets}개` },
              { label: "체결", value: `${o.fills}건` },
              { label: "최대 명목", value: usdCompact(o.maxNotionalUsd) },
            ]}
          />
          <p className="st-line">전부 미검증 · 푸시 강등</p>
        </>
      ) : (
        <p className="sh-note">FCE 알림 상태를 못 읽었어요.</p>
      )}
    </Card>
  );
}

function LeaderboardCard({ b }: { b: Board }) {
  const l = b.leaderboard;
  if (!l) return null;
  return (
    <Card
      title="리더보드"
      description={`추적군 ${l.tracked} · 사후 채점 ${l.closedSamples.toLocaleString("en-US")}건`}
      info={
        <p>
          사후 승률은 전체 승 ÷ 전체 체결(체결 가중)이라 지갑 평균이 아니다. 지갑 중앙값은 표본 {l.minSample}건 이상 지갑{" "}
          {l.scoredWallets}개의 가운데 값이다. 선정은 승률로 하지 않는다 — FCE 가 사후에 채점할 뿐이다.
        </p>
      }
    >
      <StatGroup
        stats={[
          { label: "사후 승률", value: pctOrDash(l.overallWinPct), note: "체결 가중 · 전체" },
          { label: "지갑 중앙값", value: pctOrDash(l.walletMedianWinPct), note: `${l.minSample}건+ ${l.scoredWallets}개` },
        ]}
      />
      <p className="st-line">{LEADERBOARD_NOTE}</p>
    </Card>
  );
}


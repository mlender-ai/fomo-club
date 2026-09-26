"use client";

/**
 * 전략 본문 (UI-05 PART A · UI-FIX C-2).
 *
 * ```
 * A-1  결론 — 기준선을 넘은 전략  0 / 2          ← hero 숫자(UI-FIX B-6: 문장은 폰에서 깨졌다)
 * A-2  수익 ÷ 낙폭 막대 — 회색 기준선 · 넘은 것 파랑+순위 · 못 넘은 것 빨강 `기준 미달` · 잴 수 없는 것 막대 없음
 * A-4  우연 확률 — 함께 잰 전략 수 · 1위가 우연일 확률
 * A-3  전체 지표 표 — 폰에서는 가로로 민다 · 레버리지 열이 있다
 * A-5  폐기한 전략 — 접혀 있다. 지우지 않는다
 * ```
 *
 * 기준선·거래 수는 Overview 와 **같은 조립본 값**이다(UI-FIX B-4 · B-5). 순위는 서버가 준다 —
 * 기준선을 넘고 · 표본 30 이상 · 우연 확률 50% 미만일 때만 번호가 있다(`lib/lab/strategies.ts`).
 */
import Link from "next/link";

import { PageFrame } from "../shell/PageFrame";
import { AssetRow, Card, CompareBar, DataTable, Hero, StatGroup, money, num, pct, tone, type CompareItem } from "../ui";
import { trackStatus } from "../../lib/lab/labels";
import type { Wire } from "../../lib/lab/wire";

type Strategies = Wire<"strategies">;
type Row = Strategies["rows"][number];

/** `2026-07-12T…` → `7/12` */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** 우연 확률 — 99.5% 이상은 `99%+`. 반올림한 `100%` 는 "확실히 우연" 이라는 주장이 된다. */
export function chanceLabel(p: number | null): string {
  if (p === null) return "—";
  if (p >= 0.995) return "99%+";
  return `${Math.round(p * 100)}%`;
}

/** 평균 보유 — 48시간까지는 시간, 넘으면 일. */
export function holdLabel(h: number | null): string {
  if (h === null) return "—";
  return h < 48 ? `${h.toFixed(1)}시간` : `${(h / 24).toFixed(1)}일`;
}

const leverageLabel = (r: Row) => (r.leverage ? `${r.leverage}배` : "—");

export function StrategiesBody({ data }: { data: Strategies }) {
  const winner = data.winner ? data.rows.find((r) => r.key === data.winner?.key) ?? null : null;
  return (
    <PageFrame
      title="전략"
      description="순위는 수익 ÷ 낙폭 · 전부 페이퍼"
      info={
        <>
          <p>
            <strong>수익률 순위가 아니다.</strong> 수익률로 줄 세우면 레버리지를 많이 쓴 쪽이 이긴다. 수익을 낙폭으로
            나눠 보고, 그 트랙이 시작한 날부터 BTC 를 들고 있었을 때의 같은 값을 기준선으로 둔다. Overview 전략 경쟁과
            같은 값이다.
          </p>
          <p>
            번호는 세 조건을 다 채울 때만 붙는다 — 기준선을 넘었고, 거래가 {data.minSample}건 이상이고, 1위가 우연일
            확률이 50% 미만. 기준선을 못 넘은 전략에는 번호가 없다.
          </p>
          <dl>
            {data.rows
              .filter((r) => r.statusReason)
              .map((r) => (
                <Pair key={r.key} term={r.label} value={r.statusReason ?? ""} />
              ))}
          </dl>
        </>
      }
    >
      <Hero
        label="기준선을 넘은 전략"
        value={`${data.beatCount} / ${data.measuredCount}`}
        meta={
          winner
            ? `1위 ${winner.label}`
            : `운용 ${data.rows.filter((r) => r.status === "running").length} · 멈춤 ${
                data.rows.filter((r) => r.status !== "running").length
              }`
        }
      />

      <RaceCard data={data} />
      <ChanceCard data={data} />
      <TableCard rows={data.rows} />
      <ArchiveCard archive={data.archive} />
    </PageFrame>
  );
}

// ── A-2 비교 막대 ───────────────────────────────────────────────────────────

function RaceCard({ data }: { data: Strategies }) {
  // 기준선이 맨 위 — 트랙마다 기간이 달라(시작일부터 잰다) 기간별로 한 줄씩.
  const baselines = new Map<string, number>();
  for (const r of data.rows) if (r.baseline && r.baselineFrom) baselines.set(r.baselineFrom, r.baseline.value);
  const measured = data.rows
    .filter((r) => r.verdict !== "unmeasured" && r.returnOverMdd !== null)
    .sort((a, b) => (b.returnOverMdd ?? 0) - (a.returnOverMdd ?? 0));
  const rest = data.rows.filter((r) => !measured.includes(r));

  const items: CompareItem[] = [
    ...[...baselines].map(([from, value]) => ({
      label: `BTC ${md(from)}~`,
      value,
      display: num(value),
      isBaseline: true,
    })),
    ...measured.map((r) => ({
      label: r.label,
      value: r.returnOverMdd,
      display: num(r.returnOverMdd),
      beats: r.verdict === "beat",
      rank: r.rank,
      // 기준선 값은 바로 위 회색 막대에 있다 — 이름 아래는 판정 한 단어.
      note: r.verdict === "beat" ? (r.rank ? "기준선 넘음" : "순위 보류") : "기준 미달",
    })),
    ...rest.map((r) => {
      const note = r.reason || (r.status === "running" ? "잴 거래 없음" : "");
      // 돌고 있는데 잴 거래가 없으면 `—`. `운용중` 은 띄우지 않는다(UI-FIX C-2 — 비정상만 글자로).
      const display = r.status === "running" ? "—" : trackStatus(r.status).label;
      return { label: r.label, value: null, display, ...(note ? { note } : {}) };
    }),
  ];

  return (
    <Card
      title="수익 ÷ 낙폭"
      description="회색 = 같은 기간 BTC 보유"
      info={
        <>
          <p>
            막대는 수익률 ÷ 최대 낙폭이다. 회색 막대가 같은 기간 BTC 를 들고만 있었을 때의 값이고, 전략마다 자기가
            시작한 날부터의 기준선과 견준다. 넘으면 파랑, 못 넘으면 빨강이다.
          </p>
          <dl>
            {measured.map((r) => (
              <Pair
                key={r.key}
                term={r.label}
                value={`${num(r.returnOverMdd)} · 기준선 ${num(r.baseline?.value ?? null)}${
                  r.baselineFrom ? ` (${md(r.baselineFrom)}~)` : ""
                }`}
              />
            ))}
          </dl>
          <p>정지·보류·제외된 트랙은 막대가 없다. 줄은 남긴다 — 멈춘 것을 빼면 잘 돈 것만 남는다.</p>
        </>
      }
    >
      <CompareBar items={items} underTone="dn" />
    </Card>
  );
}

// ── A-4 우연 확률 ───────────────────────────────────────────────────────────

function ChanceCard({ data }: { data: Strategies }) {
  const c = data.chance;
  return (
    <Card
      title="우연 확률"
      info={
        <>
          <p>
            여럿을 함께 재면 그중 하나는 우연히 좋아 보인다. 표본 {data.minSample}건을 채운 전략들의 일별 샤프로, 전부
            실력이 없다고 가정했을 때 1위만큼 좋아 보일 확률을 잰다(Šidák 보정). 백테스트 전광판과 같은 식이다.
          </p>
          <p>50% 이상이면 번호를 주지 않는다. 순위를 매겨 놓고 "우연일 수 있다" 를 덧붙이면 사람은 순위를 먼저 읽는다.</p>
          <p>샤프는 FCE 가 내지 않아 랩이 원장의 일별 실현 자본으로 잰다. 호스트가 잔 날은 변화 0 으로 들어간다.</p>
        </>
      }
    >
      <StatGroup
        stats={[
          { label: "함께 잰 전략", value: `${c.tested}개` },
          { label: "1위가 우연일 확률", value: chanceLabel(c.familyP) },
        ]}
      />
      <p className="st-line">
        {c.tested === 0 ? "표본을 채운 전략이 없다" : c.clearsRanks ? "우연으로 보기 어렵다" : "순위를 매기지 않는다"}
      </p>
    </Card>
  );
}

// ── A-3 전체 지표 ───────────────────────────────────────────────────────────

const COLUMNS = [
  { key: "name", label: "전략" },
  { key: "asset", label: "자산(환산)", numeric: true },
  { key: "ret", label: "수익률", numeric: true },
  { key: "mdd", label: "MDD", numeric: true },
  { key: "rm", label: "수익÷낙폭", numeric: true },
  { key: "sharpe", label: "샤프", numeric: true },
  { key: "win", label: "승률", numeric: true },
  { key: "pf", label: "PF", numeric: true },
  { key: "n", label: "거래", numeric: true },
  { key: "hold", label: "평균 보유", numeric: true },
  { key: "lev", label: "레버리지", numeric: true },
  { key: "status", label: "상태" },
];

function TableCard({ rows }: { rows: Row[] }) {
  return (
    <Card
      title="전체 지표"
      flush
      info={
        <>
          <p>
            자산은 트랙마다 $10,000 로 환산한 값이다. 수익률은 FCE 가 낸 실현 기준 값이고, 낙폭·승률·PF·거래 수는 랩이
            받아 쌓은 원장 전부로 잰다 — Overview 와 복기가 같은 원장을 본다.
          </p>
          <p>레버리지는 체결에서 실측한다. 강제청산은 반영되지 않는다.</p>
        </>
      }
    >
      <DataTable
        caption="전략별 전체 지표"
        columns={COLUMNS}
        rows={rows.map((r) => {
          const mdd = r.mddPct === null ? null : -Math.abs(r.mddPct);
          const st = trackStatus(r.status);
          return {
            key: r.key,
            name: <Link href={`/strategies/${r.key}`}>{r.label}</Link>,
            asset: money(r.normalized, "USD"),
            ret: <span className={`is-${tone(r.returnPct)}`}>{pct(r.returnPct)}</span>,
            mdd: <span className={mdd === null ? "is-mute" : "is-dn"}>{pct(mdd)}</span>,
            rm: num(r.returnOverMdd),
            sharpe: num(r.sharpe),
            win: r.winRatePct === null ? "—" : `${r.winRatePct.toFixed(1)}%`,
            pf: num(r.profitFactor),
            n: r.trades === null ? "—" : String(r.trades),
            hold: holdLabel(r.avgHoldHours),
            lev: leverageLabel(r),
            // 정상이면 아무것도 안 띄운다(UI-FIX C-2 — `운용중` 삭제). 비정상·판정만 글자로.
            status: r.status === "running" ? (r.rank ? `${r.rank}위` : r.verdict === "under" ? "기준 미달" : "—") : st.label,
          };
        })}
      />
    </Card>
  );
}

// ── A-5 폐기한 전략 ─────────────────────────────────────────────────────────

function ArchiveCard({ archive }: { archive: Strategies["archive"] }) {
  if (archive.length === 0) return null;
  return (
    <section className="ui-card is-flush">
      <details className="st-archive">
        <summary>{`폐기한 전략 ${archive.length}개`}</summary>
        <ul className="ui-rows">
          {archive.map((a) => (
            <AssetRow
              key={a.label}
              name={a.label}
              subtitle={`${a.stoppedAt ? `폐기 ${md(a.stoppedAt)}` : "폐기"} · ${a.reason}`}
              value={<span className="ui-num">{num(a.cagrMdd)}</span>}
              subValue="수익÷낙폭"
            />
          ))}
        </ul>
      </details>
    </section>
  );
}

function Pair({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}

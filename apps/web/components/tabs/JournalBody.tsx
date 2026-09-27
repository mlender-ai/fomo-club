"use client";

/**
 * 복기 본문 (UI-09 PART A · C · UI-FIX C-4).
 *
 * ```
 * 실현 손익  −$165.72                      ← hero (닫힌 거래 전부)
 * 거래 260건
 * 승 · 패 · 승률 · 손익비   [비용 88%]
 * 트랙 · 결과 · 청산 · 기간  ← 필터 넷
 * 청산 사유별 막대            ← 걸린 거래로 다시 센다
 * 날짜 · 트랙 · 심볼 · 방향 · 레버 · 보유 · 수익률 · 청산 · 사후    ← 표 (폰은 가로로 민다)
 *                                     ┌ 청산 품질 (7일 뒤) ┐
 *                                     │ 손절 후 반등  N%   │
 *                                     └ 익절 후 더 감 N%   ┘
 * ```
 *
 * **손실 거래를 숨기지 않는다** — 기본 필터는 전부다. 청산 사유도 빼지 않는다(FCE 가 새 사유를 내면 `기타`).
 * 거래 수는 Overview 누적 거래와 같은 행들을 센다(UI-FIX B-5).
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageFrame } from "../shell/PageFrame";
import { useSyncHint } from "../shell/SyncProvider";
import { Card, DataTable, Empty, Hero, Pill, StatGroup, money, num, pct, tone, type PillTone } from "../ui";
import { exitLabel, sideLabel } from "../../lib/lab/labels";
import { exitSummary } from "../../lib/lab/journal";
import type { Wire } from "../../lib/lab/wire";

type Journal = Wire<"journal">;
type Row = Journal["rows"][number];

const DAY = 86_400_000;

export const FILTER_GROUPS = {
  track: [
    { key: "all", label: "전체" },
    { key: "crypto", label: "크립토" },
    { key: "whale", label: "고래" },
    { key: "stock_us", label: "US" },
    { key: "stock_kr", label: "KR" },
  ],
  result: [
    { key: "all", label: "전체" },
    { key: "win", label: "수익" },
    { key: "loss", label: "손실" },
  ],
  exit: [
    { key: "all", label: "전체" },
    { key: "stop", label: "손절" },
    { key: "take", label: "익절" },
    { key: "signal", label: "신호" },
    { key: "time", label: "시간" },
  ],
  period: [
    { key: "7", label: "7일" },
    { key: "30", label: "30일" },
    { key: "all", label: "전체" },
  ],
} as const;

export type Filters = { track: string; result: string; exit: string; period: string };
export const DEFAULT_FILTERS: Filters = { track: "all", result: "all", exit: "all", period: "all" };

export function applyFilters(rows: Row[], f: Filters, now = Date.now()): Row[] {
  return rows.filter((r) => {
    if (f.track !== "all" && r.trackKey !== f.track) return false;
    if (f.result === "win" && !((r.netPnlUsdt ?? 0) > 0)) return false;
    if (f.result === "loss" && !((r.netPnlUsdt ?? 0) < 0)) return false;
    if (f.exit !== "all" && r.category !== f.exit) return false;
    if (f.period !== "all" && r.exitAt && now - Date.parse(r.exitAt) > Number(f.period) * DAY) return false;
    return true;
  });
}

/** `2026-09-23T11:02:00Z` → 한국 시간 `09-23 20:02`. */
function kstShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return d.toISOString().slice(5, 16).replace("T", " ");
}

export function holdLabel(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < 48) return `${Math.round(h)}시간`;
  return `${Math.round(h / 24)}일`;
}

const CATEGORY_TONE: Record<string, PillTone> = { stop: "dn", take: "up", signal: "blue", time: "mute", other: "mute" };
const POST: Record<string, { mark: string; tone: string }> = {
  favorable: { mark: "↗", tone: "up" },
  adverse: { mark: "↘", tone: "dn" },
  flat: { mark: "→", tone: "mute" },
};

export function JournalBody({ data, initialFilters = DEFAULT_FILTERS }: { data: Journal; initialFilters?: Filters }) {
  const hint = useSyncHint();
  const [f, setF] = useState<Filters>(initialFilters);
  const t = data.total;
  const shown = useMemo(() => applyFilters(data.rows, f), [data.rows, f]);
  const bars = useMemo(() => exitSummary(shown), [shown]);
  const showOpen = f.result === "all" && f.exit === "all" && (f.track === "all" || data.open.some((o) => o.trackKey === f.track));

  if (t.count === 0) {
    return (
      <PageFrame title="복기">
        <Empty title="닫힌 거래가 아직 없어요" reason={hint ?? "FCE 가 포지션을 닫으면 여기 쌓입니다."} />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="복기"
      description="어떤 거래가 벌고 잃었나 · 왜"
      info={
        <>
          <p>
            닫힌 거래 전부다 — Overview 의 누적 거래와 같은 목록을 센다. 손익률은 증거금 대비이고, 비용 {t.costSharePct === null ? "—" : `${t.costSharePct.toFixed(1)}%`}{" "}
            = 수수료·펀딩비 ÷ 비용 전 손익의 크기.
          </p>
          <p>
            청산 사유는 FCE 사유를 넷으로 묶었다 — 손절(무효선 이탈 · 본전 손절), 익절(익절 1·2 · 익절 압력), 신호(스탠스 반전),
            시간(시간 감쇠 · 시간 손절). 그 밖의 FCE 사유는 기타로 남긴다.
          </p>
          <p>
            고래 추종의 시간 감쇠는 FCE 출구 결함(보유 봉 수를 잡 실행 횟수로 센다)의 영향을 받는다 — 연구 01.
          </p>
          {t.flat > 0 ? <p>손익이 정확히 0 인 거래 {t.flat}건은 승·패 어디에도 넣지 않았다.</p> : null}
        </>
      }
      side={<QualityCard q={data.quality} />}
    >
      <Hero
        label="실현 손익"
        value={<span className={`ui-num is-${tone(t.netUsdt)}`}>{money(t.netUsdt, "USDT")}</span>}
        delta={
          t.costSharePct === null ? undefined : (
            <p className="ui-delta">
              <Pill tone="warn">{`비용 ${Math.round(t.costSharePct)}%`}</Pill>
            </p>
          )
        }
        meta={`거래 ${t.count}건`}
      />
      <p className="st-line">
        {t.wins}승 {t.losses}패 · 승률 {t.winRatePct === null ? "—" : `${t.winRatePct.toFixed(1)}%`} · 손익비 {num(t.profitFactor)}
      </p>

      <div className="jr-filters">
        {(Object.keys(FILTER_GROUPS) as (keyof typeof FILTER_GROUPS)[]).map((group) => (
          <div key={group} className="jr-filter">
            <span className="jr-filter-label">{{ track: "트랙", result: "결과", exit: "청산", period: "기간" }[group]}</span>
            <div className="ui-ranges" role="tablist" aria-label={group}>
              {FILTER_GROUPS[group].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="tab"
                  aria-selected={f[group] === o.key}
                  className={`ui-range${f[group] === o.key ? " is-on" : ""}`}
                  onClick={() => setF({ ...f, [group]: o.key })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ExitBars bars={bars} />

      <Card title={`거래 ${shown.length}건`} description={showOpen && data.open.length ? `보유 중 ${data.open.length}건 위` : undefined} flush>
        {shown.length === 0 && !(showOpen && data.open.length) ? (
          <p className="sh-note st-body">이 조건의 거래가 없어요.</p>
        ) : (
          <DataTable
            caption="거래 목록"
            // 폰에서 첫 화면에 **무엇이 · 얼마 · 왜 나왔나** 가 서게 — 심볼(고정 열) · 수익률 · 청산을 앞으로.
            // 지시서 A-3 의 열은 전부 있다. 나머지는 가로로 민다.
            columns={[
              { key: "symbol", label: "심볼" },
              { key: "ret", label: "수익률", numeric: true },
              { key: "exit", label: "청산" },
              { key: "at", label: "날짜" },
              { key: "track", label: "트랙" },
              { key: "side", label: "방향" },
              { key: "lev", label: "레버", numeric: true },
              { key: "hold", label: "보유", numeric: true },
              { key: "post", label: "사후 7일", numeric: true },
            ]}
            rows={[
              ...(showOpen
                ? data.open
                    .filter((o) => f.track === "all" || o.trackKey === f.track)
                    .map((o) => ({
                      key: `open-${o.id}`,
                      at: <Link href={`/positions/${o.id}`}>{kstShort(o.entryAt)}</Link>,
                      track: o.trackLabel,
                      symbol: <Link href={`/positions/${o.id}`}>{o.symbol}</Link>,
                      side: sideLabel(o.direction),
                      lev: o.leverage ? `${o.leverage}배` : "—",
                      hold: "—",
                      ret: <Pill tone="blue">보유중</Pill>,
                      exit: "—",
                      post: "—",
                    }))
                : []),
              ...shown.map((r) => ({
                key: r.id,
                at: <Link href={`/journal/${r.id}`}>{kstShort(r.exitAt)}</Link>,
                track: r.trackLabel,
                symbol: <Link href={`/journal/${r.id}`}>{r.symbol}</Link>,
                side: sideLabel(r.direction),
                lev: r.leverage ? `${r.leverage}배` : "—",
                hold: holdLabel(r.holdHours),
                ret: <span className={`is-${tone(r.netReturnPct)}`}>{pct(r.netReturnPct)}</span>,
                exit: (
                  <Pill tone={CATEGORY_TONE[r.category] ?? "mute"}>{exitLabel(r.exitReason)}</Pill>
                ),
                post: r.post ? (
                  <span className={`is-${POST[r.post.verdict]?.tone ?? "mute"}`}>
                    {POST[r.post.verdict]?.mark} {pct(r.post.movePct, 1)}
                    {r.post.matured ? "" : "*"}
                  </span>
                ) : (
                  "—"
                ),
              })),
            ]}
          />
        )}
      </Card>
    </PageFrame>
  );
}

function ExitBars({ bars }: { bars: ReturnType<typeof exitSummary> }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <Card
      title="청산 사유별"
      description="손절이 많고 익절이 적으면 진입 문제"
      info={<p>건수 · 평균 손익률(증거금 대비). 필터를 걸면 걸린 거래로 다시 센다.</p>}
    >
      {bars.length === 0 ? (
        <p className="sh-note">거래가 없어요.</p>
      ) : (
        <ul className="jr-bars">
          {bars.map((b) => (
            <li key={b.category}>
              <span className="jr-bar-label">{b.label}</span>
              <span className="jr-bar-track">
                <span className={`jr-bar-fill is-${b.category}`} style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
              <span className="jr-bar-n">{b.count}건</span>
              <span className={`jr-bar-avg is-${tone(b.avgReturnPct)}`}>평균 {pct(b.avgReturnPct, 1)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QualityCard({ q }: { q: Journal["quality"] }) {
  const cell = (x: { pct: number | null; n: number; of: number }) => (x.pct === null ? "—" : `${Math.round(x.pct)}%`);
  return (
    <Card
      title="청산 품질"
      description={`청산 ${q.horizonDays}일 뒤 가격 기준`}
      info={
        <>
          <p>
            청산가와 청산 {q.horizonDays}일 뒤 그날 일봉 종가를 비교한다(Bitget 공개 시세). 포지션 방향으로 1% 넘게 유리하게 갔으면
            "반등 · 더 감" 이다. {q.horizonDays}일이 안 지난 거래는 세지 않는다 — 표의 * 표시.
          </p>
          <p>FCE 는 페이퍼 거래의 청산 뒤 가격을 재지 않는다. 이 칸은 랩이 잰다. 숫자가 이상하면 연구 08 로 등록한다.</p>
        </>
      }
    >
      <StatGroup
        stats={[
          { label: "손절 후 반등", value: cell(q.stopRebound), note: `${q.stopRebound.n} / ${q.stopRebound.of}건 · 높으면 빡빡함` },
          { label: "익절 후 더 감", value: cell(q.takeRunUp), note: `${q.takeRunUp.n} / ${q.takeRunUp.of}건 · 높으면 이름` },
        ]}
      />
    </Card>
  );
}

"use client";

/**
 * 전략 본문 (UI-FIX C-2).
 *
 * **hero 는 문장이 아니라 숫자다.** 전에는 "기준선 넘은 전략 없음" 이 폰에서 `없` / `음` 으로
 * 깨졌다(B-6). 이제 `0 / 2` — 기준선을 잴 수 있는 전략 중 넘은 것의 수.
 *
 * 행은 이름 · 부제 1줄(N · 승률) · 오른쪽 **하나**(수익률 또는 상태). PF·MDD 는 상세로 내렸다.
 * `운용중` 알약은 없다 — 정상이면 아무것도 안 띄우고, 비정상만 상태 글자로 띄운다.
 *
 * 기준선·거래 수는 Overview 와 **같은 조립본 값**이다(B-4 · B-5, `lib/lab/overview.ts`).
 */
import { PageFrame } from "../shell/PageFrame";
import { AssetRow, Card, Hero, num, pct, tone } from "../ui";
import { trackGlyph, trackStatus } from "../../lib/lab/labels";
import type { Wire } from "../../lib/lab/wire";

type Strategies = Wire<"strategies">;

/** `2026-07-12T…` → `7/12` */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export function StrategiesBody({ data }: { data: Strategies }) {
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
          <dl>
            {data.rows
              .filter((r) => r.returnOverMdd !== null)
              .map((r) => (
                <Pair
                  key={r.key}
                  term={r.label}
                  value={`${num(r.returnOverMdd)} · 기준선 ${r.baseline ? num(r.baseline.value) : "—"}${
                    r.baselineFrom ? ` (${md(r.baselineFrom)}~)` : ""
                  }`}
                />
              ))}
          </dl>
          <p>기준선을 넘지 못했거나 표본이 {data.minSample}건 미만이면 순위를 매기지 않는다.</p>
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
      <Hero label="기준선을 넘은 전략" value={`${data.beatCount} / ${data.measuredCount}`} />

      <Card flush>
        <ul className="ui-rows">
          {data.rows.map((r) => {
            const running = r.status === "running";
            return (
              <AssetRow
                key={r.key}
                icon={trackGlyph(r.key, r.label)}
                name={`${r.label}${r.leverage ? ` · ${r.leverage}배` : ""}`}
                subtitle={
                  running
                    ? [
                        r.trades === null ? null : `N ${r.trades}`,
                        r.winRatePct === null ? null : `승률 ${r.winRatePct.toFixed(1)}%`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "지표 없음"
                    : r.reason
                }
                value={
                  running ? (
                    <span className={`ui-num is-${tone(r.returnPct)}`}>{pct(r.returnPct)}</span>
                  ) : (
                    <span className="ui-row-state">{trackStatus(r.status).label}</span>
                  )
                }
                href={`/strategies/${r.key}`}
              />
            );
          })}
        </ul>
      </Card>
    </PageFrame>
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

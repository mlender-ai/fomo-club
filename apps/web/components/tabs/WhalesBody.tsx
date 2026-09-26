"use client";

/**
 * 고래 본문 (UI-FIX C-6).
 *
 * hero 는 **갭 숫자**다(고래 자신의 승률 − 우리 추종 승률). 다만 두 승률은 거래 목록·진입 시점·
 * 가격·사이징·청산·승패 판정이 전부 다른 모집단이다(`docs/lab/WHALE_GAP.md`). 그 경고를 문단
 * 대신 **알약 하나(`모집단 다름`) + ⓘ** 로 붙인다. 경고를 지운 게 아니라 접은 것이다.
 */
import { PageFrame } from "../shell/PageFrame";
import { useSyncHint } from "../shell/SyncProvider";
import { AssetRow, Card, Empty, Hero, Info, Pill, StatGroup, money } from "../ui";
import type { Wire } from "../../lib/lab/wire";

type Whales = Wire<"whales">;

/** FCE `funnel.rejected` 키 → 사람이 읽는 말. */
const REJECT_LABEL: Record<string, string> = {
  excluded_type: "유형 제외",
  sample_below_min: "표본 미달",
  win_rate_below_min: "승률 미달",
};

export function WhalesBody({ data }: { data: Whales }) {
  const hint = useSyncHint();
  const w = data.whale;
  const rates = data.winRates;

  if (!w || !rates) {
    return (
      <PageFrame title="고래">
        <Empty title="고래 데이터가 아직 없어요" reason={hint ?? "FCE 가 고래 추종 스냅샷을 올리면 여기 뜹니다."} />
      </PageFrame>
    );
  }

  const ours = rates.ourFollow.value;
  const gap = ours === null ? null : rates.whaleOwn.value - ours;
  const rejected = Object.entries(w.rejected).filter(([, n]) => n > 0);

  return (
    <PageFrame
      title="고래"
      description="FCE 고래 추종 · 지갑 자격 · 두 승률"
      side={
        <>
          <Card
            title="지갑 자격"
            description={`${w.walletsTotal}개 중 ${w.eligible}개 통과`}
            info={
              w.passers.length > 0 ? (
                <p>
                  통과: {w.passers.map((a) => `${a.slice(0, 6)}…${a.slice(-4)}`).join(" · ")}. 유형 제외는 마켓메이커·캐리
                  지갑이다.
                </p>
              ) : undefined
            }
          >
            <StatGroup
              stats={[
                { label: "추적", value: String(w.walletsTotal) },
                { label: "통과", value: String(w.eligible) },
                ...rejected.map(([k, n]) => ({ label: REJECT_LABEL[k] ?? k, value: String(n) })),
              ]}
            />
          </Card>
          <Card title="추종 트랙 성적">
            <StatGroup
              stats={[
                { label: "거래", value: w.followTrades === null ? "—" : String(w.followTrades) },
                { label: "손익비", value: w.followPf === null ? "—" : w.followPf.toFixed(3) },
                {
                  label: "실현",
                  value: money(w.followNetUsdt, "USDT"),
                  tone: w.followNetUsdt === null ? "mute" : w.followNetUsdt < 0 ? "dn" : "up",
                },
              ]}
            />
          </Card>
        </>
      }
    >
      <Hero
        label="승률 갭 · 고래 − 추종"
        value={gap === null ? "—" : `${gap.toFixed(1)}%p`}
        delta={
          <p className="ui-delta">
            <Pill tone="warn">모집단 다름</Pill>
            <Info title="두 승률은 다른 것을 잰다">
              <p>
                <strong>{rates.note}</strong> 옳은 비교는 같은 거래 목록 위에서 한 축만 바꾸는 것이다.
              </p>
              <dl>
                <dt>고래 {rates.whaleOwn.value.toFixed(1)}%</dt>
                <dd>{rates.whaleOwn.measures}</dd>
                <dt>추종 {ours === null ? "—" : `${ours.toFixed(1)}%`}</dt>
                <dd>
                  {rates.ourFollow.measures}
                  {rates.ourFollow.trades === null ? "" : ` · ${rates.ourFollow.trades}건`}
                </dd>
              </dl>
            </Info>
          </p>
        }
        meta={`${rates.whaleOwn.value.toFixed(1)}% − ${ours === null ? "—" : `${ours.toFixed(1)}%`}`}
      />

      <Card
        title="원인 축"
        flush
        info={
          <dl>
            {data.causes.map((c) => (
              <Pair key={c.axis} term={c.axis} value={c.detail ? `${c.verdict} · ${c.detail}` : c.verdict} />
            ))}
          </dl>
        }
      >
        <ul className="ui-rows">
          {data.causes.map((c) => (
            <AssetRow
              key={c.axis}
              icon={c.axis.slice(0, 1)}
              name={c.axis}
              subtitle={c.measured ?? "—"}
              value={<span className="ui-row-state">{c.short}</span>}
            />
          ))}
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

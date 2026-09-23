"use client";

/**
 * `/whales` — 고래 (UI-00 §2 · UI-03 PART B).
 *
 * UI-00 은 가장 큰 숫자를 "갭" 이라고 했다. 그런데 **33.4%p 는 뺄셈이 아니다** — 두 승률은
 * 거래 목록·진입 시점·가격·사이징·청산·레버리지·승패 판정이 전부 다른 모집단이다
 * (`docs/lab/WHALE_GAP.md`). API 도 `subtractable: false` 를 박아 보낸다.
 *
 * 그래서 hero 에 **두 수를 나란히** 놓는다. 그게 이 화면의 답이다 — "갭이 있다" 가
 * 아니라 "서로 다른 질문의 답 두 개" 라는 것. 다듬는 것은 `UI-07` 이다.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { useSyncHint } from "../../../components/shell/SyncProvider";
import { Card, Empty, Hero, Pill, Skeleton, StatGroup, money } from "../../../components/ui";
import type { Wire } from "../../../lib/lab/wire";

type Whales = Wire<"whales">;

/** FCE `funnel.rejected` 키 → 사람이 읽는 말. */
const REJECT_LABEL: Record<string, string> = {
  excluded_type: "유형 제외 (MM·캐리)",
  sample_below_min: "표본 미달",
  win_rate_below_min: "승률 미달",
};

export default function WhalesPage() {
  const { state, retry } = useLab<Whales>("/api/lab/whales");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="고래" side={<Skeleton height={260} radius="var(--r-card)" />}>
          <Skeleton width={360} height={60} />
          <Skeleton height={300} radius="var(--r-card)" />
        </PageFrame>
      }
    >
      {(data) => <WhalesBody data={data} />}
    </LabView>
  );
}

function WhalesBody({ data }: { data: Whales }) {
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
  const rejected = Object.entries(w.rejected).filter(([, n]) => n > 0);

  return (
    <PageFrame
      title="고래"
      description="FCE 고래 추종 · 지갑 자격 · 두 승률"
      side={
        <>
          <Card title="지갑 자격" description={`${w.walletsTotal}개 중 ${w.eligible}개 통과`}>
            <StatGroup
              stats={[
                { label: "추적", value: String(w.walletsTotal) },
                { label: "통과", value: String(w.eligible) },
                ...rejected.map(([k, n]) => ({ label: REJECT_LABEL[k] ?? k, value: String(n) })),
              ]}
            />
            {w.passers.length > 0 ? (
              <p className="sh-note" style={{ marginTop: "var(--s4)" }}>
                통과: {w.passers.map((a) => `${a.slice(0, 6)}…${a.slice(-4)}`).join(" · ")}
              </p>
            ) : null}
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
        label="고래 자신 · 우리 추종 — 두 승률"
        value={
          <>
            {rates.whaleOwn.value.toFixed(1)}%<span className="sh-hero-sep"> · </span>
            {ours === null ? "—" : `${ours.toFixed(1)}%`}
          </>
        }
        meta={<strong>두 수를 빼지 않는다.</strong>}
      />

      <div className="sh-two">
        <Card title="고래 자신의 승률" description={rates.whaleOwn.measures}>
          <p className="sh-big">{rates.whaleOwn.value.toFixed(1)}%</p>
        </Card>
        <Card
          title="우리 추종 승률"
          description={`${rates.ourFollow.measures}${rates.ourFollow.trades === null ? "" : ` · ${rates.ourFollow.trades}건`}`}
        >
          <p className="sh-big">{ours === null ? "—" : `${ours.toFixed(1)}%`}</p>
        </Card>
      </div>

      <p className="sh-alert">
        <strong>{rates.note}</strong> 옳은 비교는 같은 거래 목록 위에서 한 축만 바꾸는 것이다.
      </p>

      <Card title="그래서 무엇이 원인인가" description="축 하나씩 — 잰 것과 안 잰 것을 가른다" flush>
        <ul className="ui-rows">
          {data.causes.map((c) => (
            <li key={c.axis} className="ui-row">
              <span className="ui-row-link sh-cause">
                <span className="ui-row-title">{c.axis}</span>
                <span className="ui-row-sub">{c.measured ?? "—"}</span>
                <Pill tone={c.measured === null ? "warn" : "mute"}>{c.verdict}</Pill>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </PageFrame>
  );
}

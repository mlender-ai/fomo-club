"use client";

/**
 * 지갑 상세 (UI-07 PART D — "클릭 → 지갑 상세 (포지션 이력)").
 *
 * 경로 열쇠는 주소 앞 6 · 뒤 4 다(`0x020c5872`) — **전체 주소는 URL 에도 없다.** 화면에 있는 것은
 * FCE 가 그 지갑에 대해 낸 것뿐이다: 자격 채점 · 우리 추종 성적 · 지금 보유 · 최근 체결.
 */
import Link from "next/link";

import { PageFrame } from "../shell/PageFrame";
import { AssetRow, Card, DataTable, Empty, Hero, Pill, StatGroup, kstStamp, money, num, price, tone, usdCompact } from "../ui";
import { sideLabel } from "../../lib/lab/labels";
import type { Wire } from "../../lib/lab/wire";
import { typeLabel } from "../../lib/lab/whales";

type Whales = Wire<"whales">;

const EVENT: Record<string, string> = { open: "진입", increase: "추가", reduce: "축소", close: "청산" };

export function WhaleWalletBody({ data, walletKey }: { data: Whales; walletKey: string }) {
  const w = data.board?.wallets.find((x) => x.key === walletKey);
  if (!w) {
    return (
      <PageFrame title="지갑">
        <Empty
          title="추적 지갑이 아니에요"
          reason="자격을 통과한 지갑만 상세가 있습니다. 목록이 바뀌었을 수 있어요."
          action={<Link href="/whales">고래로</Link>}
        />
      </PageFrame>
    );
  }
  const f = w.follow;
  return (
    <PageFrame
      title={w.short}
      description={
        <>
          <Link href="/whales">고래</Link> · {w.label} · {typeLabel(w.type)}
        </>
      }
      info={
        <>
          <p>
            자격 승률은 FCE 가 이 지갑의 체결을 우리 판정 원장으로 채점한 값이고(표본 {w.sampleSize ?? "—"} · CI 하한{" "}
            {w.ciLow ?? "—"}%), 추종 승률은 우리가 따라 들어가 우리 출구로 나온 결과다. 다른 것을 잰다.
          </p>
          <p>주소는 앞 6 · 뒤 4 만 보여준다.</p>
        </>
      }
    >
      <Hero label="자격 승률" value={w.winPct === null ? "—" : `${w.winPct.toFixed(1)}%`} meta={`표본 ${w.sampleSize ?? "—"}건`} />
      <div className="sh-inline">
        <Pill tone="up">추종중</Pill>
      </div>
      {w.lastFillAt ? <p className="st-line">마지막 체결 {kstStamp(w.lastFillAt)}</p> : null}

      {f ? (
        <StatGroup
          stats={[
            { label: "추종 승률", value: f.winPct === null ? "—" : `${f.winPct.toFixed(1)}%` },
            { label: "추종 손익", value: money(f.netUsdt, "USDT"), tone: tone(f.netUsdt) },
            { label: "손익비", value: num(f.pf) },
            { label: "따라간 거래", value: `${f.closed ?? "—"} / ${f.entries ?? "—"}` },
          ]}
        />
      ) : null}

      <Card title={`지금 보유 ${w.positions.length}개`} flush>
        {w.positions.length > 0 ? (
          <DataTable
            caption="이 지갑의 보유 포지션"
            columns={[
              { key: "coin", label: "코인" },
              { key: "side", label: "방향" },
              { key: "size", label: "명목", numeric: true },
              { key: "lev", label: "레버리지", numeric: true },
              { key: "entry", label: "진입", numeric: true },
              { key: "mark", label: "현재", numeric: true },
              { key: "upnl", label: "미실현", numeric: true },
            ]}
            rows={[...w.positions]
              .sort((a, b) => (b.sizeUsd ?? 0) - (a.sizeUsd ?? 0))
              .map((p, i) => ({
                key: `${p.coin}-${i}`,
                coin: p.coin,
                side: sideLabel(p.side),
                size: usdCompact(p.sizeUsd),
                lev: p.leverage ? `${p.leverage}배` : "—",
                entry: price(p.entryPx),
                mark: price(p.markPx),
                upnl: <span className={`is-${tone(p.unrealizedUsd)}`}>{usdCompact(p.unrealizedUsd)}</span>,
              }))}
          />
        ) : (
          <p className="sh-note st-body">지금 보유가 없어요.</p>
        )}
      </Card>

      <Card title="최근 체결" description="FCE 최근 관측 20건 중" flush>
        {w.events.length > 0 ? (
          <ul className="ui-rows">
            {w.events.map((e, i) => (
              <AssetRow
                key={`${e.at}-${i}`}
                name={`${e.coin} ${sideLabel(e.side)}`}
                subtitle={`${EVENT[e.event] ?? e.event} · ${e.at ? kstStamp(e.at) : "—"}`}
                value={<span className="ui-num">{usdCompact(e.sizeUsd)}</span>}
              />
            ))}
          </ul>
        ) : (
          <p className="sh-note st-body">FCE 최근 관측에 이 지갑의 체결이 없어요.</p>
        )}
      </Card>
    </PageFrame>
  );
}

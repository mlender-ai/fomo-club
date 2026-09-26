"use client";

/**
 * 포지션 본문 (UI-06 PART A · UI-FIX C-3).
 *
 * ```
 * 미실현 손익  −$2.47          ← hero (FCE 미실현 합계 · 비용 포함)
 * 열린 포지션 5개
 * ┌ TRUMPUSDT          (64) ┐   ← 건강도 원 — 값이 있을 때만(페이퍼에는 없다)
 * │ 롱 · 3배                 │
 * │ −1.95%                   │   ← display · 손익색
 * │ [롱 우세]  [청산 위험]    │
 * │ ●━━━━○━━━━━━━━━━━━━━●    │   ← 가격 레일
 * └ 무효 2.1215 현재 2.134 익절 2.2085 ┘
 * ```
 *
 * - **위험한 것 먼저**(A-3). 건강도가 없어 청산 위험 → 무효화 거리 → 손익 순(`lib/lab/positions.ts`)
 * - 청산 위험(A-4) — 증거금 대비 −80% 이하면 테두리 빨강 + 알약
 * - **페이퍼만**이다. 라이브 계좌 전용 다섯 가지는 없다고 말한다(프로 모드)
 */
import Link from "next/link";

import { PageFrame } from "../shell/PageFrame";
import { useSyncHint } from "../shell/SyncProvider";
import { ModeToggle, useViewMode } from "../shell/useViewMode";
import { Card, Empty, Glossed, HealthRing, Hero, Pill, PriceRail, kstStamp, money, pct, tone } from "../ui";
import { claimText, sideLabel, stanceLabel } from "../../lib/lab/labels";
import type { Wire } from "../../lib/lab/wire";

type Positions = Wire<"positions">;
export type PositionRow = Positions["positions"][number];

export function PositionsBody({ data }: { data: Positions }) {
  const hint = useSyncHint();
  const [mode, setMode] = useViewMode();

  if (data.total === 0) {
    return (
      <PageFrame title="포지션">
        <Empty title="열린 포지션이 없어요" reason={hint ?? "FCE 페이퍼가 포지션을 열면 여기 뜹니다."} />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="포지션"
      description={data.lastAt ? `동기화 ${kstStamp(data.lastAt).slice(-5)} · FCE 페이퍼` : "FCE 페이퍼"}
      info={
        <>
          <p>
            FCE 페이퍼 포지션이다. FCE 로컬 UI 의 라이브 포지션은 Bitget 실계좌라 이 사이트(로그인 없이 열린다)에
            올리지 않는다.
          </p>
          <p>
            손익은 증거금 대비이고 수수료·펀딩이 들어 있다. {data.caveat} 그래서 −80% 를 넘으면 청산 위험으로
            표시한다 — 연구 02.
          </p>
          <p>줄은 위험한 것부터다 — 청산 위험, 무효화에 가까운 것, 손익이 낮은 것 순.</p>
          <p>화면은 30초마다 다시 읽는다. 값은 Mac 업로더가 FCE 를 읽을 때(15분마다) 바뀐다.</p>
        </>
      }
    >
      <ModeToggle mode={mode} onChange={setMode} />

      <Hero
        label="미실현 손익"
        value={<span className={`ui-num is-${tone(data.unrealizedUsdt)}`}>{money(data.unrealizedUsdt, "USDT")}</span>}
        meta={`열린 포지션 ${data.total}개`}
      />

      {data.liquidationLevel > 0 ? (
        <p className="sh-alert">
          <strong>청산 위험 {data.liquidationLevel}개</strong> · 증거금 대비 −80% 아래
        </p>
      ) : null}

      <ul className="ps-grid">
        {data.positions.map((p) => (
          <li key={p.id}>
            <PositionCard p={p} mode={mode} />
          </li>
        ))}
      </ul>

      {mode === "pro" ? <LiveOnlyCard names={data.liveOnly} /> : null}
    </PageFrame>
  );
}

function PositionCard({ p, mode }: { p: PositionRow; mode: "minimal" | "pro" }) {
  const stance = stanceLabel(p.stance, p.direction);
  return (
    <Link href={`/positions/${p.id}`} className={`ps-card${p.liquidationLevel ? " is-risk" : ""}`}>
      <div className="ps-card-head">
        <div className="ps-card-id">
          <span className="ps-card-symbol">{p.symbol}</span>
          <span className="ps-card-side">
            {sideLabel(p.direction)}
            {p.leverage ? ` · ${p.leverage}배` : ""}
          </span>
        </div>
        <HealthRing score={p.healthScore} />
      </div>
      <p className={`ps-card-pnl is-${tone(p.netReturnPct)}`}>{pct(p.netReturnPct)}</p>
      {mode === "pro" || p.liquidationLevel ? (
        <div className="sh-inline">
          {p.liquidationLevel ? <Pill tone="dn">청산 위험</Pill> : null}
          {mode === "pro" && stance ? <Pill tone={stance.tone}>{stance.label}</Pill> : null}
        </div>
      ) : null}
      {mode === "pro" && p.evidence[0] ? (
        <p className="ps-card-why">
          <Glossed text={claimText(p.evidence[0].claim)} />
        </p>
      ) : null}
      {p.rail ? (
        <PriceRail
          rail={p.rail}
          mark={p.markPrice}
          takeProfit={p.takeProfitPrice}
          size="card"
        />
      ) : (
        <p className="sh-note">가격선 없음</p>
      )}
    </Link>
  );
}

/** FCE 가 라이브 계좌에만 붙이는 것 — 지어내지 않고 이름만 남긴다. */
export function LiveOnlyCard({ names }: { names: string[] }) {
  return (
    <Card
      title="FCE 라이브 전용"
      description="페이퍼 포지션에는 없다"
      info={
        <>
          <p>
            FCE 는 이 다섯 가지를 Bitget 실계좌 포지션(`/api/live/positions`)에만 계산한다. 페이퍼 거래에는 그 칸이
            없다.
          </p>
          <p>
            실계좌 값을 같은 심볼로 빌려 오지 않는다 — 다른 포지션의 판정이 되고, 실계좌에 무엇을 들고 있는지가
            드러난다. FCE 가 페이퍼에도 싣는 날 이 자리가 채워진다.
          </p>
        </>
      }
    >
      <div className="sh-inline">
        {names.map((n) => (
          <Pill key={n} tone="mute">
            {n}
          </Pill>
        ))}
      </div>
    </Card>
  );
}

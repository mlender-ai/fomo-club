"use client";

/**
 * `/positions/[id]` — 포지션 상세 (UI-03 PART B).
 *
 * 지금 랩이 가진 것만 그린다. 건강도 상세·지금 볼 것·패턴 시간봉은 **아직 안 올라온다** —
 * API 가 `missing` 으로 알려주고, 화면은 그걸 빈칸으로 지어내지 않고 그대로 말한다.
 * 채우는 것은 `UI-06` 이다.
 */
import Link from "next/link";
import { useParams } from "next/navigation";

import { LabView } from "../../../../components/shell/LabView";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import { Card, Hero, Pill, Skeleton, StatGroup, money, pct, tone } from "../../../../components/ui";
import { shortStamp, sideLabel } from "../../../../lib/lab/labels";
import type { Jsonify } from "../../../../lib/lab/wire";
import type { FcePositionRow } from "../../../../lib/lab/fce-board";

interface Detail {
  position: Jsonify<FcePositionRow>;
  caveat: string;
  missing: string[];
}

/** API 가 아직 없다고 알려주는 칸 → 사람이 읽는 말. */
const MISSING_LABEL: Record<string, string> = {
  healthDetail: "건강도 상세",
  invalidation: "무효화 조건",
  takeProfit: "익절 조건",
  watchNow: "지금 볼 것",
  patternTimeframes: "패턴 시간봉",
};

export default function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, retry } = useLab<Detail>(`/api/lab/positions/${encodeURIComponent(id)}`);

  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="포지션">
          <Skeleton width={260} height={60} />
          <Skeleton height={120} radius="var(--r-stat)" />
        </PageFrame>
      }
    >
      {(data) => {
        const p = data.position;
        return (
          <PageFrame
            title={p.symbol}
            description={
              <>
                <Link href="/positions">포지션</Link> · {sideLabel(p.direction)}
                {p.leverage ? ` · ${p.leverage}x` : ""}
              </>
            }
          >
            <Hero
              label="손익 · 증거금 대비"
              value={<span className={`ui-num is-${tone(p.netReturnPct)}`}>{pct(p.netReturnPct)}</span>}
              meta={`진입 ${shortStamp(p.entryAt)}`}
            />
            {p.liquidationLevel ? (
              <p className="sh-alert">
                <strong>⚠ 청산 수준.</strong> 실제 거래소였으면 이미 증거금이 없어진 자리다.
              </p>
            ) : null}
            <StatGroup
              stats={[
                { label: "증거금", value: money(p.marginUsdt, "USDT") },
                { label: "레버리지", value: p.leverage ? `${p.leverage}x` : "—" },
                { label: "건강도", value: p.healthScore === null ? "—" : String(p.healthScore), note: "0~100 · FCE 판정" },
              ]}
            />
            <Card title="아직 안 올라온 것" description="없는 걸 있는 척 그리지 않는다">
              <div className="sh-inline">
                {data.missing.map((m) => (
                  <Pill key={m} tone="mute">
                    {MISSING_LABEL[m] ?? m}
                  </Pill>
                ))}
              </div>
            </Card>
            <p className="sh-note">{data.caveat}</p>
          </PageFrame>
        );
      }}
    </LabView>
  );
}

"use client";

/**
 * `/strategies/[id]` — 전략 상세 (UI-03 PART B · UI-05 PART B).
 *
 * 트랙 키(`crypto` · `whale` · `stock_us` · `stock_kr` · `polymarket`)로 연다.
 * 전략 목록 조립본에서 골라낸다 — **API 를 한 번만 부른다.** 본문은 `components/tabs/StrategyDetailBody.tsx`.
 */
import { useParams } from "next/navigation";

import { LabView } from "../../../../components/shell/LabView";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import { StrategyDetailBody } from "../../../../components/tabs/StrategyDetailBody";
import { Skeleton } from "../../../../components/ui";
import type { Wire } from "../../../../lib/lab/wire";

type Strategies = Wire<"strategies">;

export default function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, retry } = useLab<Strategies>("/api/lab/strategies");

  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="전략">
          <Skeleton width={320} height={60} />
          <Skeleton height={120} radius="var(--r-stat)" />
          <Skeleton height={280} radius="var(--r-card)" />
        </PageFrame>
      }
    >
      {(data) => <StrategyDetailBody data={data} id={id} />}
    </LabView>
  );
}

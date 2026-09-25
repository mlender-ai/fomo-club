"use client";

/**
 * `/strategies` — 전략 (UI-00 §2 · UI-03 PART B · UI-FIX C-2).
 *
 * **FCE 트랙이 곧 전략이다.** 랩 자체 전략 3종은 폐기됐다(LAB-BRIDGE 0-3).
 * 본문은 `components/tabs/StrategiesBody.tsx`.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { StrategiesBody } from "../../../components/tabs/StrategiesBody";
import { Skeleton, SkeletonRows } from "../../../components/ui";
import type { Wire } from "../../../lib/lab/wire";

type Strategies = Wire<"strategies">;

export default function StrategiesPage() {
  const { state, retry } = useLab<Strategies>("/api/lab/strategies");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="전략">
          <Skeleton width={200} height={60} />
          <SkeletonRows rows={5} />
        </PageFrame>
      }
    >
      {(data) => <StrategiesBody data={data} />}
    </LabView>
  );
}

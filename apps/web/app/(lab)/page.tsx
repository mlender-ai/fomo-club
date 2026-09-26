"use client";

/**
 * `/` — Overview (UI-04).
 *
 * > 얼마로 시작해서 지금 얼마인가. 무엇이 잘되고 무엇이 안 되나. 지금 무엇을 확인하고 있나.
 *
 * ```
 * ① Hero            ⑥ 지금 연구 중
 * ② 차트            ⑦ 전략 경쟁
 * ③ 통계 4칸        ⑧ 최근 활동
 * ④ 트랙 리스트
 * ⑤ 주석
 * ```
 *
 * 본문은 `components/tabs/OverviewBody.tsx` — 텍스트 예산 테스트가 같은 부품을 그려 잰다(UI-FIX A-2).
 */
import { LabView } from "../../components/shell/LabView";
import { PageFrame } from "../../components/shell/PageFrame";
import { useLab } from "../../components/shell/useLab";
import { OverviewBody } from "../../components/tabs/OverviewBody";
import { Skeleton, SkeletonRows } from "../../components/ui";
import type { Wire } from "../../lib/lab/wire";

type Overview = Wire<"overview">;

function OverviewLoading() {
  // 실제 레이아웃과 같은 모양이어야 뜨는 순간 화면이 튀지 않는다(UI-03 E).
  return (
    <PageFrame
      title="Overview"
      hideTitle
      side={
        <>
          <Skeleton height={320} radius="var(--r-card)" />
          <Skeleton height={200} radius="var(--r-card)" />
        </>
      }
    >
      <Skeleton width={320} height={14} />
      <Skeleton width={380} height={60} />
      <Skeleton width={260} height={20} />
      <Skeleton height={300} radius="var(--r-card)" />
      <Skeleton height={104} radius="var(--r-stat)" />
      <SkeletonRows rows={5} />
    </PageFrame>
  );
}

export default function OverviewPage() {
  const { state, retry } = useLab<Overview>("/api/lab/overview");
  return (
    <LabView state={state} retry={retry} loading={<OverviewLoading />}>
      {(data) => <OverviewBody data={data} />}
    </LabView>
  );
}

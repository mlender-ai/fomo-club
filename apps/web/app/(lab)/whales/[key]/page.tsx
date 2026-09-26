"use client";

/**
 * `/whales/[key]` — 추적 지갑 상세 (UI-07 PART D). 열쇠는 주소 앞 6 · 뒤 4.
 * 고래 조립본에서 골라낸다 — API 한 번. 30초마다 다시 읽는다.
 */
import { useParams } from "next/navigation";

import { LabView } from "../../../../components/shell/LabView";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import { WhaleWalletBody } from "../../../../components/tabs/WhaleWalletBody";
import { Skeleton } from "../../../../components/ui";
import type { Wire } from "../../../../lib/lab/wire";

export default function WhaleWalletPage() {
  const { key } = useParams<{ key: string }>();
  const { state, retry } = useLab<Wire<"whales">>("/api/lab/whales", 30_000);
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="지갑">
          <Skeleton width={240} height={60} />
          <Skeleton height={200} radius="var(--r-card)" />
        </PageFrame>
      }
    >
      {(data) => <WhaleWalletBody data={data} walletKey={key} />}
    </LabView>
  );
}

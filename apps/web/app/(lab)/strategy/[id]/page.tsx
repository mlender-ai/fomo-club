import { LabEmpty } from "../../LabEmpty";

/** `/strategy/[id]` — 전략 상세. LAB-08 이 만든다. */
export default async function StrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <h1 className="lab-title">
        전략 <span className="num">{id}</span>
      </h1>
      <LabEmpty note="LAB-08 전략 상세" />
    </>
  );
}

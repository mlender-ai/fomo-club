import { LabEmpty } from "./LabEmpty";

/** `/` — 백테스트 (기본). 결과 표와 자산곡선은 LAB-05 가 만든다. */
export default function BacktestPage() {
  return (
    <>
      <h1 className="lab-title">백테스트</h1>
      <LabEmpty note="LAB-04 엔진 · LAB-05 화면" />
    </>
  );
}

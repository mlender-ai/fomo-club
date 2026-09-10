/**
 * D-2 임시 화면. **LAB-05 까지 이 상태로 둔다.**
 *
 * 데이터가 없다는 것을 숨기지 않는다 — LAB-00 §7 "데이터 구멍을 메우지 않는다".
 */
export function LabEmpty({ note }: { note?: string }) {
  return (
    <div className="lab-empty">
      <p className="lab-empty-brand">STRATEGY LAB</p>
      <p className="lab-empty-msg">아직 데이터가 없습니다.</p>
      {note ? <p className="lab-empty-note">{note}</p> : null}
    </div>
  );
}

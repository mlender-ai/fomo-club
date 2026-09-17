/**
 * LAB-08 PART A — 전광판. `/live`.
 *
 * > **표 하나. 지금 무슨 일이 일어나고 있는지 한눈에.**
 *
 * 서버에서 첫 화면을 그리고(빈 표가 잠깐 보이지 않게), 그 뒤 갱신은 클라이언트가
 * 1분마다 값만 바꾼다 — `LiveBoard` 의 주석에 방식이 적혀 있다.
 */
import { LiveBoard } from "../../../components/lab/LiveBoard";
import { readLiveBoard } from "../../../lib/lab/live-board";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const board = await readLiveBoard();

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title">전광판</h1>
      </div>
      <LiveBoard initial={board} />
    </>
  );
}

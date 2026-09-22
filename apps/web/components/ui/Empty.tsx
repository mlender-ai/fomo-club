/**
 * 데이터가 없을 때 (UI-01 E).
 *
 * **"없음" 으로 끝내지 않는다.** 왜 없는지와 무엇을 하면 되는지를 같이 적는다.
 * 빈 화면은 고장과 구분이 안 되고, 구분이 안 되면 아무도 고치지 않는다.
 */
import type { ReactNode } from "react";

export function Empty({
  title,
  reason,
  action,
}: {
  title: string;
  /** 왜 비었나. 이게 없으면 화면이 고장난 것처럼 보인다. */
  reason?: ReactNode;
  /** 무엇을 하면 되나. 명령어나 링크. */
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <p className="ui-empty-title">{title}</p>
      {reason ? <p className="ui-empty-reason">{reason}</p> : null}
      {action ? <p className="ui-empty-action">{action}</p> : null}
    </div>
  );
}

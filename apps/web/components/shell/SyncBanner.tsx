"use client";

/**
 * 끊김 띠 (UI-02 PART G · UI-03 PART D).
 *
 * > **끊기면 모든 화면 상단에 띠를 띄운다.** 옛 숫자를 지금 숫자로 읽으면 안 된다.
 *
 * 지연(주황)에는 띄우지 않는다 — 헤더 점이 이미 말하고 있고, 띠를 너무 자주 띄우면
 * 아무도 안 읽는다. **1시간을 넘기면** 띄운다.
 */
import { useSync } from "./SyncProvider";

export function SyncBanner() {
  const { sync, collect, unreachable } = useSync();

  if (unreachable) {
    return (
      <div className="sh-banner" role="alert">
        <strong>랩 서버에 닿지 못했어요.</strong> 아래 숫자는 마지막으로 받은 값일 수 있어요.
      </div>
    );
  }
  // 시세 끊김 — FCE 와 따로 본다. 시세는 **이 맥의 러너**가 넣는다(docs/lab/CRON.md §0-3).
  const stale = collect?.staleSymbols ?? [];
  if (stale.length > 0 && (!sync || sync.level !== "broken")) {
    const minutes = collect?.feedAgeMs ? Math.floor(collect.feedAgeMs / 60_000) : null;
    return (
      <div className="sh-banner" role="alert">
        <strong>시세가 {minutes ? `${minutes}분째 ` : ""}안 들어와요</strong> ({stale.join(", ")}). 로컬 수집 러너를
        확인하세요 — <code>npm run lab:runner</code>
      </div>
    );
  }

  if (!sync || sync.level !== "broken") return null;

  const hours = sync.ageMs === null ? null : Math.floor(sync.ageMs / 3_600_000);
  const since =
    sync.lastAt === null
      ? "한 번도 동기화된 적이 없어요"
      : hours !== null && hours >= 1
        ? `동기화가 ${hours}시간째 끊겼어요`
        : "동기화가 끊겼어요";

  return (
    <div className="sh-banner" role="alert">
      <strong>{since}.</strong> 아래 숫자는 지금 값이 아니에요. FCE 호스트가 켜져 있는지 확인하세요 —{" "}
      <code>caffeinate -dimsu &amp;</code>
      {sync.lastError ? <span className="sh-banner-err"> · 마지막 실패: {sync.lastError.error.slice(0, 80)}</span> : null}
    </div>
  );
}

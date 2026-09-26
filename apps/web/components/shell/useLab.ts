"use client";

/**
 * 화면 하나가 API 하나를 부르는 자리 (UI-03 PART E).
 *
 * ## 왜 화면이 직접 부르나 — 탭이 안 눌리던 이유
 *
 * 전에는 화면이 **서버 렌더 중에** DB 를 여러 번 왕복했다. 왕복 한 번이 ~900ms 라
 * 탭을 누르고 화면이 바뀌기까지 4~12.8초가 걸렸고, 그동안 URL 도 내용도 그대로였다.
 * 누른 사람에겐 **아무 일도 안 일어난 것**과 같았다(`docs/ui/SHELL.md` §1).
 *
 * 이제 화면 틀은 즉시 뜨고, 이 훅이 쿼리 한 번짜리 API 를 부르는 동안 스켈레톤을
 * 보여준다.
 *
 * ## 네 상태
 *
 * | 상태 | 뜻 |
 * |---|---|
 * | `loading` | 부르는 중 |
 * | `not_built` | 조립본이 없다 — **업로드가 한 번도 안 돌았다**. 고장이 아니다 |
 * | `error` | 부르다 실패했다 — 다시 시도 버튼 |
 * | `ready` | 받았다 |
 *
 * `not_built` 와 `error` 를 가르는 이유: 둘 다 빈 화면이지만 **할 일이 다르다.**
 * 하나는 러너를 켜야 하고, 하나는 다시 눌러보면 된다.
 */
import { useCallback, useEffect, useState } from "react";

import type { WireEnvelope, WireSync } from "../../lib/lab/wire";

export type LabState<T> =
  | { kind: "loading" }
  | { kind: "not_built"; hint: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: T; builtAt: string; sync: WireSync; ms: number };

/**
 * `refreshMs` — 이 간격으로 **조용히** 다시 부른다(UI-06 — 포지션 30초 갱신). 다시 부르는 동안
 * 스켈레톤을 띄우지 않고 지금 화면을 둔다. 실패해도 지금 화면을 지우지 않는다 — 다음 차례에 또 부른다.
 */
export function useLab<T>(path: string, refreshMs?: number): { state: LabState<T>; retry: () => void } {
  const [state, setState] = useState<LabState<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!refreshMs) return;
    const timer = setInterval(() => {
      // 탭이 숨겨져 있으면 부르지 않는다 — 폰 배터리와 서버 왕복을 아낀다.
      if (typeof document === "undefined" || document.visibilityState === "visible") setTick((n) => n + 1);
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);

  useEffect(() => {
    if (tick === 0) return;
    const controller = new AbortController();
    fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const env = (await res.json().catch(() => null)) as WireEnvelope<T> | null;
        if (env && "data" in env) {
          setState({ kind: "ready", data: env.data, builtAt: env.builtAt, sync: env.sync, ms: env.ms });
        }
      })
      .catch(() => {
        // 조용한 갱신은 실패를 화면에 올리지 않는다. 헤더의 동기화 표시가 낡음을 말한다.
      });
    return () => controller.abort();
  }, [path, tick]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });

    fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | (WireEnvelope<T> & { error?: undefined })
          | { error: string; hint?: string }
          | null;
        if (res.status === 503 && body && "error" in body && body.error === "not_built") {
          setState({
            kind: "not_built",
            hint: body.hint ?? "FCE 업로드가 한 번도 돌지 않았다",
          });
          return;
        }
        if (!res.ok || !body || ("error" in body && body.error)) {
          const reason = body && "error" in body && body.error ? body.error : `HTTP ${res.status}`;
          setState({ kind: "error", message: reason });
          return;
        }
        const env = body as WireEnvelope<T>;
        setState({ kind: "ready", data: env.data, builtAt: env.builtAt, sync: env.sync, ms: env.ms });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "네트워크 오류",
        });
      });

    return () => controller.abort();
  }, [path, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

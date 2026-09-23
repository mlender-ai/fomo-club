"use client";

/**
 * 동기화 상태를 한 곳에서 부른다 (UI-02 PART G · UI-03 PART C).
 *
 * 헤더와 끊김 띠가 **같은 값**을 봐야 한다. 둘이 따로 부르면 헤더는 "실시간" 인데
 * 띠는 "끊김" 이라고 말하는 순간이 생긴다.
 *
 * 1분마다 다시 부른다. `/api/lab/status` 는 쿼리 한 번이다.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { WireSync } from "../../lib/lab/wire";

/** 60초. 헤더의 "N분 전" 이 분 단위라 이보다 촘촘할 이유가 없다. */
const POLL_MS = 60_000;

interface SyncValue {
  sync: WireSync | null;
  /** 상태 API 자체에 닿지 못했나. **그것도 끊김이다.** */
  unreachable: boolean;
}

const SyncContext = createContext<SyncValue>({ sync: null, unreachable: false });

export function SyncProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SyncValue>({ sync: null, unreachable: false });

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/lab/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((body: { sync: WireSync }) => alive && setValue({ sync: body.sync, unreachable: false }))
        .catch(() => alive && setValue((v) => ({ sync: v.sync, unreachable: true })));
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  return useContext(SyncContext);
}

/**
 * 빈 화면에 덧붙일 한 줄. 동기화가 끊겨 있으면 **비어 있는 이유가 그것일 수 있다**는
 * 것을 같이 말한다(UI-03 E-1).
 */
export function useSyncHint(): string | null {
  const { sync, unreachable } = useSync();
  if (unreachable) return "랩 서버에 닿지 못했다 — 잠시 뒤 다시 시도한다";
  if (!sync || sync.level !== "broken") return null;
  return `${sync.label} — FCE 호스트가 켜져 있는지 확인한다`;
}

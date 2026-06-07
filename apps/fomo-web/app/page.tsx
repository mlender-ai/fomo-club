"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { EmotionType } from "@fomo/core";
import { SplashScreen } from "@/components/SplashScreen";
import { EmotionGate } from "@/components/EmotionGate";
import { HomeView } from "@/components/HomeView";
import { getSessionId } from "@/lib/session";
import {
  fetchIndex,
  fetchToday,
  fetchPulse,
  fetchWhale,
  fetchCalendar,
  postVote,
  type FomoIndexResponse,
  type TallyResponse,
  type CalendarResponse,
} from "@/lib/fomoApi";

type Phase = "splash" | "gate" | "home";

const SPLASH_MIN_MS = 1200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * 진입 여정 오케스트레이터 — splash → (오늘 미선택 시) gate → home.
 * 데이터 페칭/투표를 여기서 관리하고 하위 화면에 props로 내려준다.
 * 정체성: 감정 게이트가 '시장의 포모 → 나의 포모' 두 단계 전환의 무대(docs/MASCOT.md §5).
 */
export default function Home() {
  const [phase, setPhase] = useState<Phase>("splash");
  const [leavingSplash, setLeavingSplash] = useState(false);
  const [gateReopen, setGateReopen] = useState(false);

  const [index, setIndex] = useState<FomoIndexResponse | null>(null);
  const [tally, setTally] = useState<TallyResponse | null>(null);
  const [pulse, setPulse] = useState<string[]>([]);
  const [whale, setWhale] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [mine, setMine] = useState<EmotionType | null>(null);

  // 스플래시 동안 데이터 프리페치 + 최소 표시시간 보장 후 분기
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const sid = getSessionId();
    const minDelay = prefersReducedMotion()
      ? Promise.resolve()
      : new Promise((r) => setTimeout(r, SPLASH_MIN_MS));

    const load = Promise.allSettled([
      fetchIndex(),
      fetchToday(),
      fetchPulse(),
      fetchWhale(),
      fetchCalendar(sid),
    ]).then(([i, t, p, w, c]) => {
      if (i.status === "fulfilled") setIndex(i.value);
      if (t.status === "fulfilled") setTally(t.value);
      if (p.status === "fulfilled") setPulse(p.value.items);
      if (w.status === "fulfilled") setWhale(w.value.items);
      let todays: EmotionType | null = null;
      if (c.status === "fulfilled") {
        setCalendar(c.value);
        const v = c.value.days[c.value.today];
        if (v) {
          todays = v as EmotionType;
          setMine(todays);
        }
      }
      return todays;
    });

    Promise.all([load, minDelay]).then(([todays]) => {
      // 스플래시를 부드럽게 내보내고 다음 phase로
      setLeavingSplash(true);
      setTimeout(() => setPhase(todays ? "home" : "gate"), 300);
    });
  }, []);

  const vote = useCallback(async (e: EmotionType) => {
    setMine(e); // 낙관적
    try {
      const res = await postVote(getSessionId(), e);
      setTally(res);
      setCalendar((prev) =>
        prev ? { ...prev, days: { ...prev.days, [prev.today]: e } } : prev
      );
    } catch {
      /* 선택 상태 유지 */
    }
  }, []);

  const reopenGate = useCallback(() => {
    setGateReopen(true);
    setPhase("gate");
  }, []);

  const finishGate = useCallback(() => {
    setGateReopen(false);
    setPhase("home");
  }, []);

  if (phase === "splash") {
    return <SplashScreen leaving={leavingSplash} />;
  }

  if (phase === "gate") {
    return (
      <EmotionGate
        score={index ? index.score : null}
        onVote={vote}
        onDone={finishGate}
        reopen={gateReopen}
      />
    );
  }

  return (
    <HomeView
      index={index}
      tally={tally}
      pulse={pulse}
      whale={whale}
      calendar={calendar}
      mine={mine}
      onReopenGate={reopenGate}
    />
  );
}

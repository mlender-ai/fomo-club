"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { FEATURE_EMOTION_VOTE, type EmotionType } from "@fomo/core";
import { EmotionGate } from "@/components/EmotionGate";
import { HomeView } from "@/components/HomeView";
import { SplashScreen } from "@/components/SplashScreen";
import { getSessionId } from "@/lib/session";
import { hasSession } from "@/lib/auth";
import {
  FOMO_INDEX_UPDATED_EVENT,
  fetchIndex,
  fetchToday,
  fetchBanner,
  fetchCalendar,
  fetchVoices,
  fetchFeed,
  fetchNews,
  warmDiscovery,
  postVote,
  type FeedResponse,
  type NewsResponse,
  type VoiceItem,
  type FomoIndexResponse,
  type TallyResponse,
  type CalendarResponse,
  type BannerItem,
  type MarketScore,
} from "@/lib/fomoApi";

type Phase = "splash" | "splashLeaving" | "gate" | "home";

/**
 * 진입 여정 오케스트레이터 — 스플래시가 떠 있는 동안 발견 덱 데이터를 먼저 당긴다.
 * (감정 투표 flag 가 켜져 오늘 미선택이면 gate 로, 현재는 OFF 라 대부분 home.)
 */
export default function Home() {
  const [phase, setPhase] = useState<Phase>("splash");
  const [gateReopen, setGateReopen] = useState(false);
  const splashDismissedRef = useRef(false);
  const pendingGateRef = useRef(false);

  const dismissSplash = useCallback(() => {
    splashDismissedRef.current = true;
    setPhase("splashLeaving");
    setTimeout(() => setPhase(pendingGateRef.current ? "gate" : "home"), 500);
  }, []);

  const [index, setIndex] = useState<FomoIndexResponse | null>(null);
  const [tally, setTally] = useState<TallyResponse | null>(null);
  const [banner, setBanner] = useState<BannerItem[]>([]);
  const [markets, setMarkets] = useState<MarketScore[]>([]);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [voices, setVoices] = useState<VoiceItem[] | null>(null);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [mine, setMine] = useState<EmotionType | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const onIndexUpdated = (event: Event) => {
      const next = (event as CustomEvent<FomoIndexResponse>).detail;
      if (next) setIndex(next);
    };
    window.addEventListener(FOMO_INDEX_UPDATED_EVENT, onIndexUpdated);
    return () => window.removeEventListener(FOMO_INDEX_UPDATED_EVENT, onIndexUpdated);
  }, []);

  // 로그인 상태는 클라에서만 확정(SSR 불일치 방지).
  useEffect(() => {
    void hasSession().then(setLoggedIn);
  }, []);

  // 뉴스 피드는 외부 RSS 다중 수집이라 느릴 수 있다 — 스플래시를 막지 않고 별도로 로드.
  // 실패 시 빈 배열 → 피드 탭에 담담한 빈 상태(무한 로딩 금지).
  useEffect(() => {
    fetchNews()
      .then(setNews)
      .catch(() => setNews({ deck: [], lang: "ko" }));
  }, []);

  // 진입 즉시 백그라운드 데이터 로드. 도착 전엔 HomeView 내부 로딩 상태가 담당.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const sid = getSessionId();
    void warmDiscovery().catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Home] discovery prewarm failed", err);
      }
    });

    const load = Promise.allSettled([
      fetchIndex(),
      fetchToday(),
      fetchBanner(),
      fetchCalendar(sid),
      fetchVoices(),
      fetchFeed(),
    ]).then(([i, t, b, c, v, f]) => {
      if (i.status === "fulfilled") setIndex(i.value);
      if (t.status === "fulfilled") setTally(t.value);
      if (b.status === "fulfilled") {
        setBanner(b.value.items);
        setMarkets(b.value.markets ?? []);
      }
      // 실패 시 null — EmotionFeed가 mock으로 폴백(빈 화면 금지)
      if (f.status === "fulfilled") setFeed(f.value);
      // 실패 시 빈 배열 — 무한 "불러오는 중" 대신 담담한 빈 상태로
      setVoices(v.status === "fulfilled" ? v.value.items : []);
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

    load.then((todays) => {
      // CTA 전에는 스플래시를 절대 닫지 않는다. 게이트 필요 여부만 예약한다.
      if (FEATURE_EMOTION_VOTE && !todays) {
        if (splashDismissedRef.current) setPhase("gate");
        else pendingGateRef.current = true;
      }
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

  // M4 구조화 한마디 — 같은 vote에 상황·의연함 키 추가(upsert) 후 피드 갱신.
  const voiceRef = useRef<EmotionType | null>(null);
  voiceRef.current = mine;
  const sendVoice = useCallback(async (situationKey: string, resolveKey: string) => {
    const emotion = voiceRef.current;
    if (!emotion) return;
    try {
      await postVote(getSessionId(), emotion, { situationKey, resolveKey });
      const v = await fetchVoices();
      setVoices(v.items);
    } catch {
      /* 한마디 저장 실패해도 여정은 이어진다 — 피드는 다음 진입에 갱신 */
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

  // 로그인 성공(SignupGate) → 토큰 기준으로 캘린더 재조회(익명+연결분 합쳐 표시).
  const handleLoggedIn = useCallback(() => {
    setLoggedIn(true);
    fetchCalendar(getSessionId())
      .then(setCalendar)
      .catch(() => {
        /* 조회 실패해도 게이트는 통과 — 다음 진입에 다시 시도 */
      });
  }, []);

  if (phase === "splash" || phase === "splashLeaving") {
    return <SplashScreen leaving={phase === "splashLeaving"} onDone={dismissSplash} />;
  }

  if (phase === "gate") {
    return (
      <EmotionGate
        score={index ? index.score : null}
        onVote={vote}
        onVoice={sendVoice}
        onDone={finishGate}
        reopen={gateReopen}
      />
    );
  }

  return (
    <HomeView
      index={index}
      tally={tally}
      banner={banner}
      markets={markets}
      feed={feed}
      news={news}
      calendar={calendar}
      voices={voices}
      mine={mine}
      onReopenGate={reopenGate}
      loggedIn={loggedIn}
      onLoggedIn={handleLoggedIn}
    />
  );
}

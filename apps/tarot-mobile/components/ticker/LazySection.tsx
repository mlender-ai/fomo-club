import React, { useState, useEffect } from "react";

interface Props {
  children: React.ReactNode;
  /** 첫 렌더 후 지연(ms). 기본 80ms — JS 스레드 초기 페인트 이후 렌더링 */
  delayMs?: number;
  /** 플레이스홀더 — 지연 중 표시 (없으면 null) */
  placeholder?: React.ReactNode;
}

/**
 * 첫 렌더 직후 children을 지연 마운트하는 래퍼.
 * React Native에서 React.lazy/Suspense 대신 사용 가능한 지연 로드 패턴.
 * 초기 프레임에서 무거운 섹션(차트·재무·뉴스)을 제외해 첫 화면 렌더링을 가볍게 만든다.
 */
export function LazySection({ children, delayMs = 80, placeholder = null }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);

  if (!ready) return <>{placeholder}</>;
  return <>{children}</>;
}

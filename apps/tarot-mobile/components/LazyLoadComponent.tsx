import React from "react";
import { useDeferredRender } from "../lib/useDeferredRender";

interface Props {
  /** 이 컴포넌트가 활성화된 시점 (탭이 포커스된 시점 등). false면 마운트하지 않는다. */
  active?: boolean;
  /** 인터랙션 완료 후 추가 지연(ms). 0이면 완료 직후 마운트. */
  delayMs?: number;
  /** 준비되기 전 대체 콘텐츠 */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * React Native에서 React.lazy/Suspense 코드스플리팅이 동작하지 않는 대신,
 * InteractionManager로 탭 전환 애니메이션 완료 후 children을 마운트해
 * 첫 페인트 및 전환 jank를 줄인다 (#264).
 *
 * 사용 예: 종목 상세 info 탭의 네트워크 의존 섹션 래핑
 */
export function LazyLoadComponent({ active = true, delayMs = 0, fallback = null, children }: Props) {
  const ready = useDeferredRender(active, delayMs);
  if (!ready) return <>{fallback}</>;
  return <>{children}</>;
}

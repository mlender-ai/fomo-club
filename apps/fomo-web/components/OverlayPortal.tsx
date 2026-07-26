"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 전체화면 오버레이(뎁스·검색)는 반드시 body 로 포털한다.
 *
 * position:fixed 는 조상에 transform/filter/perspective 가 있으면 **뷰포트가 아니라 그 조상**을
 * 기준으로 잡힌다. 홈 <main> 은 진입 애니메이션을 갖고 있어서, 애니메이션 클래스가 잔여 transform 을
 * 남기는 순간 뎁스 오버레이의 아래쪽이 화면 밖으로 밀려 잘렸다(2026-07 회귀).
 * CSS 쪽(fill-mode)도 고쳤지만, 앞으로 어떤 조상이 transform 을 갖더라도 다시 갇히지 않도록
 * 배선 자체를 body 직속으로 끊어둔다.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

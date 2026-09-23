/**
 * 랩 골격 (UI-03 PART C · D).
 *
 * ```
 * <Header />
 * <SyncBanner />      끊겼을 때만
 * <main>
 * ```
 *
 * ## 이 레이아웃은 DB 를 부르지 않는다
 *
 * 전에는 여기서 `readPaperPulse()` 를 기다렸다. 레이아웃이 DB 를 기다리면 **모든 탭이
 * 그만큼 늦게 뜬다.** 동기화 상태는 이제 브라우저가 `/api/lab/status` 로 부른다.
 *
 * 탭이 "안 눌리던" 원인과 고친 방법은 `docs/ui/SHELL.md` 에 있다.
 */
import type { ReactNode } from "react";

import { Header } from "../../components/shell/Header";
import { SyncBanner } from "../../components/shell/SyncBanner";
import { SyncProvider } from "../../components/shell/SyncProvider";

export default function LabLayout({ children }: { children: ReactNode }) {
  return (
    <SyncProvider>
      <div className="sh-shell">
        <Header />
        <SyncBanner />
        <main className="sh-main">{children}</main>
      </div>
    </SyncProvider>
  );
}

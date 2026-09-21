import type { ReactNode } from "react";
import Link from "next/link";

import { readPaperPulse } from "../../lib/lab/paper-pulse";

/**
 * 랩 골격 — LAB-01 PART D-1 의 라우트 셋만 감싼다.
 *
 * 라우트 그룹(`(lab)`)이라 URL 에는 나타나지 않는다. `/login` 은 이 그룹 밖이므로
 * 내비 없이 자기 화면을 쓴다.
 *
 * ## 헤더에 페이퍼 상태를 단다 (LAB-FIX2 PART E-3)
 *
 * **살아 있는지는 어느 탭에서든 보여야 한다.** 전광판에 들어가야만 알 수 있으면,
 * 백테스트 화면을 보는 동안 페이퍼가 며칠 멈춰 있어도 모른다.
 */
export const dynamic = "force-dynamic";

export default async function LabLayout({ children }: { children: ReactNode }) {
  const pulse = await readPaperPulse();

  return (
    <div className="lab-shell">
      <nav className="lab-nav">
        <span className="lab-brand">Strategy Lab</span>
        {/*
          LAB-BRIDGE — 전광판이 첫 화면이다. 랩은 이제 FCE 를 비추는 창구이고,
          백테스트는 **끝난 실험의 보관함**이다(PART C-4). 순서가 곧 우선순위다.
        */}
        <Link className="lab-nav-link" href="/live">
          전광판
        </Link>
        <Link className="lab-nav-link" href="/whale">
          고래
        </Link>
        <Link className="lab-nav-link" href="/trades">
          거래
        </Link>
        <Link className="lab-nav-link" href="/data">
          데이터
        </Link>
        <Link className="lab-nav-link is-archive" href="/">
          백테스트
        </Link>
        <Link
          className={`lab-paper-state ${pulse.running ? "is-on" : "is-off"}`}
          href="/live"
          title={pulse.detail}
        >
          <span className="dot" aria-hidden>
            {pulse.running ? "●" : "○"}
          </span>
          {pulse.label}
        </Link>
      </nav>
      <main className="lab-main">{children}</main>
    </div>
  );
}

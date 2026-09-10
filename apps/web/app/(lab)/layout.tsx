import type { ReactNode } from "react";
import Link from "next/link";

/**
 * 랩 골격 — LAB-01 PART D-1 의 라우트 셋만 감싼다.
 *
 * 라우트 그룹(`(lab)`)이라 URL 에는 나타나지 않는다. `/login` 은 이 그룹 밖이므로
 * 내비 없이 자기 화면을 쓴다.
 */
export default function LabLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lab-shell">
      <nav className="lab-nav">
        <span className="lab-brand">Strategy Lab</span>
        <Link className="lab-nav-link" href="/">
          백테스트
        </Link>
        <Link className="lab-nav-link" href="/live">
          전광판
        </Link>
      </nav>
      <main className="lab-main">{children}</main>
    </div>
  );
}

import type { ReactNode } from "react";
import { requireAdmin } from "../../lib/admin-auth";
import LogoutButton from "./LogoutButton";
import "./admin.css";

export const metadata = {
  title: "Trading Taro Admin",
  description: "타로 앱 운영 관리 대시보드",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="admin-shell">
      <nav className="admin-sidebar">
        <div className="admin-logo">
          <span className="admin-logo-icon">🔮</span>
          <span className="admin-logo-text">Taro Admin</span>
        </div>

        <ul className="admin-nav">
          <li>
            <a href="/admin" className="admin-nav-link">
              <span className="admin-nav-icon">📊</span>
              대시보드
            </a>
          </li>
          <li>
            <a href="/admin/cards" className="admin-nav-link">
              <span className="admin-nav-icon">🃏</span>
              카드 관리
            </a>
          </li>
          <li>
            <a href="/admin/prompts" className="admin-nav-link">
              <span className="admin-nav-icon">📝</span>
              프롬프트
            </a>
          </li>
          <li>
            <a href="/admin/monitoring" className="admin-nav-link">
              <span className="admin-nav-icon">📡</span>
              모니터링
            </a>
          </li>
          <li>
            <a href="/admin/analytics" className="admin-nav-link">
              <span className="admin-nav-icon">📈</span>
              분석
            </a>
          </li>
        </ul>
        <div className="admin-sidebar-footer">
          <LogoutButton />
        </div>
      </nav>
      <main className="admin-content">{children}</main>
    </div>
  );
}

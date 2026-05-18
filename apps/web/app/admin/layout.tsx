import type { ReactNode } from "react";
import { requireAdmin } from "../../lib/admin-auth";

export const metadata = {
  title: "Trading Taro Admin",
  description: "타로 앱 운영 관리 대시보드",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  requireAdmin();

  return (
    <div className="admin-shell">
      <nav className="admin-sidebar">
        <div className="admin-logo">
          <span className="admin-logo-icon">🔮</span>
          <span className="admin-logo-text">Taro Admin</span>
        </div>
        
        {/* Added by Gemini - Agent Identifier Badge */}
        <div style={{ padding: '0 20px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '6px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px' }}>✨</span>
            <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: '500' }}>Managed by Gemini</span>
          </div>
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
          <a href="/" className="admin-nav-link">← 메인으로</a>
        </div>
      </nav>
      <main className="admin-content">{children}</main>
    </div>
  );
}

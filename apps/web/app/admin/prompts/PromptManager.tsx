"use client";

import { useState } from "react";

interface PromptVersion {
  id: string;
  version: string;
  content: string;
  isActive: boolean;
  activatedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function PromptManager({ prompts }: { prompts: PromptVersion[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function createPrompt() {
    if (!newVersion.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: newVersion, content: newContent }),
      });
      setShowCreate(false);
      setNewVersion("");
      setNewContent("");
      window.location.reload();
    } catch {
      alert("생성 실패");
    } finally {
      setSaving(false);
    }
  }

  async function activatePrompt(id: string) {
    if (!confirm("이 버전을 활성화하시겠습니까? 기존 활성 버전은 비활성화됩니다.")) return;
    try {
      await fetch(`/api/admin/prompts/${id}/activate`, { method: "POST" });
      window.location.reload();
    } catch {
      alert("활성화 실패");
    }
  }

  return (
    <>
      <div className="admin-prompt-actions">
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "취소" : "+ 새 버전 추가"}
        </button>
      </div>

      {showCreate && (
        <div className="admin-section-card admin-prompt-create">
          <h3>새 프롬프트 버전</h3>
          <div className="admin-edit-field">
            <label>버전 (예: 1.1.0)</label>
            <input
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="1.1.0"
            />
          </div>
          <div className="admin-edit-field">
            <label>프롬프트 내용</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={12}
              placeholder="프롬프트 전문을 입력하세요..."
              className="admin-prompt-textarea"
            />
          </div>
          <button
            className="admin-btn admin-btn-primary"
            onClick={createPrompt}
            disabled={saving}
          >
            {saving ? "생성 중..." : "생성"}
          </button>
        </div>
      )}

      <div className="admin-prompt-list">
        {prompts.map((p) => (
          <div
            key={p.id}
            className={`admin-prompt-item ${p.isActive ? "active" : ""}`}
          >
            <div className="admin-prompt-header" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
              <div className="admin-prompt-meta">
                <span className="admin-prompt-version">v{p.version}</span>
                {p.isActive && <span className="admin-badge-active">활성</span>}
                <span className="admin-prompt-date">
                  {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                </span>
                {p.createdBy && (
                  <span className="admin-prompt-author">by {p.createdBy}</span>
                )}
              </div>
              <div className="admin-prompt-actions-inline">
                {!p.isActive && (
                  <button
                    className="admin-btn admin-btn-sm admin-btn-success"
                    onClick={(e) => {
                      e.stopPropagation();
                      activatePrompt(p.id);
                    }}
                  >
                    활성화
                  </button>
                )}
                <span className="admin-expand-icon">
                  {expandedId === p.id ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {expandedId === p.id && (
              <div className="admin-prompt-content">
                <pre>{p.content}</pre>
              </div>
            )}
          </div>
        ))}

        {prompts.length === 0 && (
          <p className="admin-empty">등록된 프롬프트가 없습니다. 위 버튼으로 첫 버전을 추가하세요.</p>
        )}
      </div>
    </>
  );
}

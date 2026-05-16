"use client";

import { useState } from "react";

interface CardWithCount {
  id: string;
  name: string;
  nameKo: string;
  arcana: string;
  number: number;
  keywords: unknown;
  keywordsKo: unknown;
  meaningUpright: string;
  meaningReversed: string;
  imageUrl: string;
  toneGuide: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { drawHistoryCards: number };
}

export function CardTable({ cards }: { cards: CardWithCount[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [editForm, setEditForm] = useState({
    nameKo: "",
    meaningUpright: "",
    meaningReversed: "",
    toneGuide: "",
    imageUrl: "",
  });

  const filtered = cards.filter((c) => {
    if (filter === "ALL") return true;
    return c.status === filter;
  });

  function startEdit(card: CardWithCount) {
    setEditingId(card.id);
    setEditForm({
      nameKo: card.nameKo,
      meaningUpright: card.meaningUpright,
      meaningReversed: card.meaningReversed,
      toneGuide: card.toneGuide,
      imageUrl: card.imageUrl,
    });
  }

  async function saveCard(id: string) {
    setSaving(true);
    try {
      await fetch(`/api/admin/cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      window.location.reload();
    } catch {
      alert("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await fetch(`/api/admin/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    window.location.reload();
  }

  return (
    <>
      <div className="admin-filter-bar">
        {(["ALL", "ACTIVE", "INACTIVE"] as const).map((f) => (
          <button
            key={f}
            className={`admin-filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? "전체" : f === "ACTIVE" ? "활성" : "비활성"}
          </button>
        ))}
      </div>

      <div className="admin-card-grid">
        {filtered.map((card) => (
          <div key={card.id} className={`admin-card-item ${card.status === "INACTIVE" ? "inactive" : ""}`}>
            {editingId === card.id ? (
              <div className="admin-card-edit">
                <div className="admin-edit-field">
                  <label>한국어 이름</label>
                  <input
                    value={editForm.nameKo}
                    onChange={(e) => setEditForm({ ...editForm, nameKo: e.target.value })}
                  />
                </div>
                <div className="admin-edit-field">
                  <label>정방향 의미</label>
                  <textarea
                    value={editForm.meaningUpright}
                    onChange={(e) => setEditForm({ ...editForm, meaningUpright: e.target.value })}
                  />
                </div>
                <div className="admin-edit-field">
                  <label>역방향 의미</label>
                  <textarea
                    value={editForm.meaningReversed}
                    onChange={(e) => setEditForm({ ...editForm, meaningReversed: e.target.value })}
                  />
                </div>
                <div className="admin-edit-field">
                  <label>톤 가이드</label>
                  <textarea
                    value={editForm.toneGuide}
                    onChange={(e) => setEditForm({ ...editForm, toneGuide: e.target.value })}
                  />
                </div>
                <div className="admin-edit-field">
                  <label>이미지 URL</label>
                  <input
                    value={editForm.imageUrl}
                    onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                  />
                </div>
                <div className="admin-edit-actions">
                  <button className="admin-btn admin-btn-primary" onClick={() => saveCard(card.id)} disabled={saving}>
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button className="admin-btn admin-btn-ghost" onClick={() => setEditingId(null)}>취소</button>
                </div>
              </div>
            ) : (
              <>
                <div className="admin-card-header">
                  <div className="admin-card-number">{card.number}</div>
                  <div className="admin-card-names">
                    <span className="admin-card-name-ko">{card.nameKo}</span>
                    <span className="admin-card-name-en">{card.name}</span>
                  </div>
                  <span className={`admin-status-dot ${card.status === "ACTIVE" ? "active" : "inactive"}`} />
                </div>
                <div className="admin-card-keywords">
                  {(card.keywordsKo as string[]).map((kw) => (
                    <span key={kw} className="admin-keyword-tag">{kw}</span>
                  ))}
                </div>
                <div className="admin-card-meanings">
                  <div className="admin-meaning">
                    <span className="admin-meaning-label">↑ 정방향</span>
                    <p>{card.meaningUpright}</p>
                  </div>
                  <div className="admin-meaning">
                    <span className="admin-meaning-label">↓ 역방향</span>
                    <p>{card.meaningReversed}</p>
                  </div>
                </div>
                <div className="admin-card-meta">
                  <span className="admin-meta-item">사용 {card._count.drawHistoryCards}회</span>
                  <span className="admin-meta-item">{card.toneGuide.slice(0, 30)}…</span>
                </div>
                <div className="admin-card-actions">
                  <button className="admin-btn admin-btn-sm" onClick={() => startEdit(card)}>수정</button>
                  <button
                    className={`admin-btn admin-btn-sm ${card.status === "ACTIVE" ? "admin-btn-danger" : "admin-btn-success"}`}
                    onClick={() => toggleStatus(card.id, card.status)}
                  >
                    {card.status === "ACTIVE" ? "비활성화" : "활성화"}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

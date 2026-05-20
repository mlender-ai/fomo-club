"use client";

import { useState } from "react";

interface Props {
  initialOverrides: Record<string, string>;
  domainMap: Record<string, string>;
}

export function LogosClient({ initialOverrides, domainMap }: Props) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [ticker, setTicker] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleSave() {
    if (!ticker.trim() || !url.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ticker-logos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim(), url: url.trim() }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "저장 실패");
      }
      setOverrides((prev) => ({ ...prev, [ticker.toUpperCase()]: url.trim() }));
      setMsg({ text: `${ticker.toUpperCase()} 저장 완료`, ok: true });
      setTicker("");
      setUrl("");
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "오류 발생", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: string) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/ticker-logos?ticker=${encodeURIComponent(t)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("삭제 실패");
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[t];
        return next;
      });
      setMsg({ text: `${t} 삭제 완료`, ok: true });
    } catch {
      setMsg({ text: "삭제 오류", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const overrideList = Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b));
  const autoList = Object.entries(domainMap).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      {/* 추가/수정 폼 */}
      <section className="admin-section-card" style={{ marginBottom: "1.5rem" }}>
        <h2>오버라이드 추가</h2>
        <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "1rem" }}>
          특정 티커의 로고 URL을 직접 지정합니다. 비워두면 Clearbit → Google 자동 해석을 사용합니다.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", marginBottom: 4 }}>
              티커
            </label>
            <input
              className="admin-input"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="005930.KS"
              style={{ width: 140 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", marginBottom: 4 }}>
              로고 URL (PNG/SVG)
            </label>
            <input
              className="admin-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              style={{ width: "100%" }}
            />
          </div>
          <button
            className="admin-btn admin-btn-primary"
            onClick={handleSave}
            disabled={saving || !ticker.trim() || !url.trim()}
          >
            저장
          </button>
          {url && (
            <button
              className="admin-btn"
              onClick={() => setPreview(url)}
            >
              미리보기
            </button>
          )}
        </div>
        {msg && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: msg.ok ? "#22c55e" : "#f87171" }}>
            {msg.text}
          </p>
        )}
        {preview && (
          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="preview"
              style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, background: "#1e1e2e" }}
              onError={() => setPreview(null)}
            />
            <span style={{ fontSize: "0.875rem", color: "#9ca3af" }}>미리보기</span>
            <button
              style={{ fontSize: "0.75rem", color: "#6366f1", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => setPreview(null)}
            >
              닫기
            </button>
          </div>
        )}
      </section>

      {/* 커스텀 오버라이드 목록 */}
      {overrideList.length > 0 && (
        <section className="admin-section-card" style={{ marginBottom: "1.5rem" }}>
          <h2>커스텀 오버라이드 ({overrideList.length})</h2>
          <table className="admin-table" style={{ marginTop: "0.75rem" }}>
            <thead>
              <tr>
                <th>티커</th>
                <th>로고</th>
                <th>URL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overrideList.map(([t, logoUrl]) => (
                <tr key={t}>
                  <td><span className="admin-ticker">{t}</span></td>
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl}
                      alt={t}
                      style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, background: "#1e1e2e" }}
                    />
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <a href={logoUrl} target="_blank" rel="noreferrer" style={{ color: "#6366f1" }}>{logoUrl}</a>
                  </td>
                  <td>
                    <button
                      className="admin-btn admin-btn-danger"
                      onClick={() => void handleDelete(t)}
                      disabled={saving}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* 자동 매핑 목록 */}
      <section className="admin-section-card">
        <h2>자동 도메인 매핑 ({autoList.length})</h2>
        <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "1rem" }}>
          오버라이드가 없을 때 Clearbit/Google Favicons로 자동 해석. 위에서 오버라이드 추가 시 우선 적용됩니다.
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>티커</th>
              <th>도메인</th>
              <th>Clearbit 미리보기</th>
              <th>오버라이드 여부</th>
            </tr>
          </thead>
          <tbody>
            {autoList.map(([t, domain]) => (
              <tr key={t}>
                <td><span className="admin-ticker">{t}</span></td>
                <td style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>{domain}</td>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://logo.clearbit.com/${domain}?size=64`}
                    alt={t}
                    style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, background: "#1e1e2e" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </td>
                <td>
                  {overrides[t] ? (
                    <span style={{ color: "#22c55e", fontSize: "0.875rem" }}>✓ 오버라이드 설정됨</span>
                  ) : (
                    <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>자동</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

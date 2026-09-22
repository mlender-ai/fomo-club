"use client";

import { useState } from "react";

export default function PasswordInput() {
  const [show, setShow] = useState(false);

  return (
    <div style={{ display: "flex", gap: "12px", width: "100%" }}>
      <input 
        name="password" 
        type={show ? "text" : "password"} 
        placeholder="Dashboard password" 
        required 
        style={{ flex: 1, minWidth: 0 }}
      />
      <button 
        type="button" 
        onClick={() => setShow(!show)}
        style={{ 
          flexShrink: 0,
          width: "50px",
          background: "var(--bg-2)",
          border: "1px solid var(--line-2)",
          borderRadius: "var(--r-row)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
          padding: 0
        }}
        tabIndex={-1}
        title={show ? "비밀번호 숨기기" : "비밀번호 보기"}
      >
        {show ? "👁️" : "👁️‍🗨️"}
      </button>
    </div>
  );
}

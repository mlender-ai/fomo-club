"use client";

import { useState } from "react";

export default function PasswordInput() {
  const [show, setShow] = useState(false);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input 
        name="password" 
        type={show ? "text" : "password"} 
        placeholder="Dashboard password" 
        required 
        style={{ width: "100%", paddingRight: "40px" }}
      />
      <button 
        type="button" 
        onClick={() => setShow(!show)}
        style={{ 
          position: "absolute", 
          right: "10px", 
          background: "none", 
          border: "none", 
          cursor: "pointer",
          fontSize: "16px",
          color: "#999"
        }}
      >
        {show ? "👁️" : "👁️‍🗨️"}
      </button>
    </div>
  );
}

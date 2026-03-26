import React from "react";

export default function JamPage({ onLeave }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", color: "white" }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "3rem", marginBottom: "1rem" }}>
        Jam Room
      </h1>
      <p style={{ color: "#7D848C", marginBottom: "2rem" }}>방에 입장했습니다. (임시 페이지)</p>
      <button
        onClick={onLeave}
        style={{
          padding: "0.75rem 1.5rem", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)", color: "white", cursor: "pointer"
        }}
      >
        방 나가기
      </button>
    </div>
  );
}
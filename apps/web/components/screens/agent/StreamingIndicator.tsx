"use client";

export function StreamingIndicator() {
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
      <div style={{ width: 2, background: "var(--accent)", borderRadius: 2 }} />
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          color: "var(--text-3)", fontSize: 12,
        }}
      >
        <span style={{ display: "inline-flex", gap: 3 }}>
          <span
            style={{
              width: 4, height: 4, background: "var(--accent)", borderRadius: "50%",
              animation: "reliat-pulse 1.2s ease-in-out infinite",
            }}
          />
          <span
            style={{
              width: 4, height: 4, background: "var(--accent)", borderRadius: "50%",
              animation: "reliat-pulse 1.2s ease-in-out 0.2s infinite",
            }}
          />
          <span
            style={{
              width: 4, height: 4, background: "var(--accent)", borderRadius: "50%",
              animation: "reliat-pulse 1.2s ease-in-out 0.4s infinite",
            }}
          />
        </span>
        Reasoning…
        <style>{`@keyframes reliat-pulse{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}`}</style>
      </div>
    </div>
  );
}

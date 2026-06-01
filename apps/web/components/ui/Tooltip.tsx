"use client";

import { type ReactNode, useState } from "react";

export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  if (!label) return <>{children}</>;
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
            transform: "translateX(-50%)", whiteSpace: "nowrap",
            padding: "4px 8px", fontSize: 11.5,
            background: "var(--surface-3)", color: "var(--text-1)",
            border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
            boxShadow: "var(--shadow-pop)", zIndex: 50, pointerEvents: "none",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

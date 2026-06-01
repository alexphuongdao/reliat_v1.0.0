"use client";

import { type ReactNode } from "react";

export interface PillProps {
  children: ReactNode;
  color?: string;
  bg?: string;
  border?: string;
  mono?: boolean;
  size?: "sm" | "md";
}

export function Pill({ children, color, bg, border, mono, size = "md" }: PillProps) {
  const h = size === "sm" ? 18 : 22;
  const fs = size === "sm" ? 10.5 : 11.5;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        height: h, padding: "0 8px",
        fontSize: fs,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        fontVariantNumeric: "tabular-nums",
        fontWeight: "var(--fw-medium)" as unknown as number,
        letterSpacing: mono ? 0 : "0.02em",
        color: color || "var(--text-2)",
        background: bg || "var(--surface-2)",
        border: `1px solid ${border || "var(--border)"}`,
        borderRadius: "var(--r-pill)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

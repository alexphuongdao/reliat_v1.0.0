"use client";

import type { ReactNode } from "react";

export function PrefRow({
  label, sub, children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "1fr auto",
        gap: 16, alignItems: "center",
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

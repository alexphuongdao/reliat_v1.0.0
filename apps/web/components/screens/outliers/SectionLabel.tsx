"use client";

import type { ReactNode } from "react";
import { Icon } from "../../ui";

export function SectionLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 10.5, color: "var(--text-3)", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
      }}
    >
      <Icon name={icon} size={12} />
      {children}
    </div>
  );
}

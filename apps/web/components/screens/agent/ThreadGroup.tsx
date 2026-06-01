"use client";

import { Icon } from "../../ui";

export interface ThreadItem {
  t: string;
  title: string;
  pinned?: boolean;
  current?: boolean;
}

export function ThreadGroup({ label, items }: { label: string; items: ThreadItem[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10.5, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontWeight: 600, padding: "4px 6px",
        }}
      >
        {label}
      </div>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "flex-start", gap: 6,
            padding: "8px 8px", borderRadius: "var(--r-sm)",
            background: it.current ? "var(--accent-dim)" : "transparent",
            color: it.current ? "var(--accent-bright)" : "var(--text-1)",
            cursor: "pointer", fontSize: 12.5,
          }}
          onMouseEnter={(e) => {
            if (!it.current) (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)";
          }}
          onMouseLeave={(e) => {
            if (!it.current) (e.currentTarget as HTMLDivElement).style.background = "transparent";
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
              }}
            >
              {it.title}
            </div>
            <div
              className="mono"
              style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 1 }}
            >
              {it.t}
            </div>
          </div>
          {it.pinned && <Icon name="pin" size={11} />}
        </div>
      ))}
    </div>
  );
}

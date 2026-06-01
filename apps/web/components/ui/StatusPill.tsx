"use client";

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; bg: string; label: string }> = {
    open:         { c: "var(--sev-warn)", bg: "var(--sev-warn-dim)", label: "Open" },
    acknowledged: { c: "var(--accent)",   bg: "var(--accent-dim)",   label: "Ack" },
    resolved:     { c: "var(--text-2)",   bg: "var(--surface-2)",    label: "Resolved" },
    dismissed:    { c: "var(--text-3)",   bg: "var(--surface-1)",    label: "Dismissed" },
  };
  const m = map[status] || { c: "var(--text-3)", bg: "var(--surface-1)", label: status };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        height: 18, padding: "0 8px", fontSize: 10.5, fontWeight: 600,
        color: m.c, background: m.bg, border: "1px solid var(--border)",
        borderRadius: "var(--r-pill)", textTransform: "uppercase", letterSpacing: "0.06em",
      }}
    >
      {m.label}
    </span>
  );
}

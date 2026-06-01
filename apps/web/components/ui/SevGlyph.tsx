"use client";

/** Severity glyph — square (critical) / triangle (warn) / circle (info). */
export function SevGlyph({ sev, size = 10 }: { sev: string; size?: number }) {
  const color = sev === "critical" ? "var(--sev-crit)" : sev === "warn" ? "var(--sev-warn)" : "var(--sev-info)";
  const label = sev === "critical" ? "Critical" : sev === "warn" ? "Warning" : "Info";
  const s = size;
  if (sev === "critical") {
    return (
      <span
        title={label}
        aria-label={label}
        role="img"
        style={{
          display: "inline-block", width: s, height: s,
          background: color, borderRadius: 1.5,
          flexShrink: 0, transform: "translateY(-1px)",
        }}
      />
    );
  }
  if (sev === "warn") {
    return (
      <svg
        width={s + 2} height={s + 1} viewBox="0 0 12 11"
        role="img" aria-label={label}
        style={{ display: "inline-block", flexShrink: 0, transform: "translateY(-1px)" }}
      >
        <polygon points="6,0 12,10.5 0,10.5" fill={color} />
      </svg>
    );
  }
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      style={{
        display: "inline-block", width: s, height: s,
        background: color, borderRadius: "50%",
        flexShrink: 0, transform: "translateY(-1px)",
      }}
    />
  );
}

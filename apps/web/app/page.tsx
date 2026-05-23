/**
 * Phase 0 — boot/parity check.
 *
 * This page exists to prove three things:
 *   1. The Next.js dev/build pipeline works.
 *   2. `tokens.css` is loading (the page picks up --surface-0, --text-1, etc.).
 *   3. The Geist / Geist Mono webfonts resolve through the next/font CSS vars
 *      that tokens.css now consumes.
 *
 * Phase 1 replaces this with the first real screen port (Outliers).
 */
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--surface-0)",
        color: "var(--text-1)",
        fontFamily: "var(--font-sans)",
        padding: "48px 56px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Reliat
        </h1>
        <span
          className="mono"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-3)",
          }}
        >
          web · v1.0.0 · phase 0
        </span>
      </header>

      <section
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: 20,
          maxWidth: 720,
        }}
      >
        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 10.5,
            color: "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          Migration in progress
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            color: "var(--text-2)",
            lineHeight: 1.6,
          }}
        >
          Tokens, fonts, and the Next.js build pipeline are wired. Screens are
          being ported one at a time — Outliers first, then Channels. The
          original prototype at <code style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)" }}>/frontend/</code> remains
          the visual source of truth until the port reaches parity.
        </p>
      </section>

      <SeverityRow />
      <SurfaceRow />
    </main>
  );
}

// Two small parity checks: severity colors and surface ramp. If these render
// in the right hues, tokens.css is loading correctly.
function SeverityRow() {
  const items: { label: string; color: string }[] = [
    { label: "critical", color: "var(--sev-crit)" },
    { label: "warning", color: "var(--sev-warn)" },
    { label: "info", color: "var(--sev-info)" },
    { label: "ok", color: "var(--ch-4)" },
  ];
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {items.map((it) => (
        <span
          key={it.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            color: "var(--text-2)",
            padding: "4px 10px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              background: it.color,
              borderRadius: 999,
              display: "inline-block",
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function SurfaceRow() {
  return (
    <div style={{ display: "flex", gap: 0 }}>
      {[0, 1, 2, 3, "inset"].map((n) => (
        <div
          key={n}
          style={{
            background: `var(--surface-${n})`,
            border: "1px solid var(--border)",
            padding: "10px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "var(--text-3)",
          }}
        >
          surface-{n}
        </div>
      ))}
    </div>
  );
}

"use client";

/**
 * Keyboard shortcut cheatsheet — opened by `?`. Glass overlay with a
 * 2-column grid of grouped shortcuts. Lifted verbatim from AppShell so
 * the shell file owns less.
 */
import { Icon } from "../ui";

export interface HelpCheatsheetProps {
  onClose: () => void;
}

const GROUPS: Array<{ name: string; items: Array<[string, string]> }> = [
  {
    name: "Global",
    items: [
      ["⌘ K", "Command palette"],
      ["⌘ J", "Toggle agent drawer"],
      ["?", "This cheatsheet"],
      ["Esc", "Close any overlay"],
    ],
  },
  {
    name: "Navigate",
    items: [
      ["G P", "Pulse"],
      ["G C", "Channels"],
      ["G O", "Outliers"],
      ["G A", "Agent"],
      ["G L", "Library"],
      ["G N", "Design notes"],
    ],
  },
  {
    name: "Lists",
    items: [
      ["J / K", "Next / prev"],
      ["Enter", "Open / expand"],
      ["X", "Toggle select"],
      ["⇧ click", "Range select"],
    ],
  },
  {
    name: "Outliers",
    items: [
      ["E", "Acknowledge"],
      ["R", "Resolve"],
      ["A", "Assign"],
      ["D", "Dismiss"],
    ],
  },
  {
    name: "Layout",
    items: [
      ["[ ]", "Collapse / expand rail"],
      ["\\", "Toggle right rail"],
    ],
  },
];

export function HelpCheatsheet({ onClose }: HelpCheatsheetProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5,7,10,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 250,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 90vw)",
          background: "var(--glass-bg-2)",
          backdropFilter: "var(--glass-blur)",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-modal)",
          padding: "20px 24px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Keyboard shortcuts</h2>
          <button onClick={onClose} style={{ color: "var(--text-3)", display: "flex" }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {GROUPS.map((g) => (
            <div key={g.name}>
              <h3
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  margin: "0 0 8px",
                }}
              >
                {g.name}
              </h3>
              {g.items.map(([k, l], i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "4px 0",
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ display: "flex", gap: 3, width: 80 }}>
                    {k.split(" ").map((t, j) => (
                      <span key={j} className="kbd">
                        {t}
                      </span>
                    ))}
                  </span>
                  <span style={{ color: "var(--text-2)" }}>{l}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

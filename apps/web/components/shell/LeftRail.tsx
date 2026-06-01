"use client";

/**
 * LeftRail — 240px sidebar (56px when collapsed). Owns the visual
 * arrangement; the parent owns the collapsed state and the navigation
 * + palette callbacks.
 */
import { Icon, Tooltip } from "../ui";
import { SURFACES, type SurfaceId } from "./surfaces";

export interface LeftRailProps {
  railCollapsed: boolean;
  /** Receives the new collapsed value. */
  onSetCollapsed: (v: boolean) => void;
  onOpenPalette: () => void;
  surface: SurfaceId;
  onNavigate: (id: SurfaceId) => void;
}

export function LeftRail({
  railCollapsed,
  onSetCollapsed,
  onOpenPalette,
  surface,
  onNavigate,
}: LeftRailProps) {
  return (
    <nav
      style={{
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "all var(--t-med) var(--ease)",
      }}
    >
      {/* Logo + collapse */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: railCollapsed ? "center" : "space-between",
          padding: railCollapsed ? "14px 0" : "14px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent) 0%, #2D6F7A 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#062028",
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          >
            R
          </div>
          {!railCollapsed && (
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Reliat
            </span>
          )}
        </div>
        {!railCollapsed && (
          <Tooltip label="Collapse rail · [">
            <button
              onClick={() => onSetCollapsed(true)}
              style={{ color: "var(--text-3)", display: "flex" }}
            >
              <Icon name="collapse-rail" size={14} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Palette CTA */}
      <div style={{ padding: railCollapsed ? "8px 6px" : "10px 10px" }}>
        <button
          onClick={onOpenPalette}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: railCollapsed ? "6px 0" : "7px 10px",
            justifyContent: railCollapsed ? "center" : "flex-start",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-sm)",
            fontSize: 12.5,
            color: "var(--text-3)",
            cursor: "pointer",
            transition: "all var(--t-instant)",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "var(--surface-3)";
            el.style.color = "var(--text-1)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "var(--surface-2)";
            el.style.color = "var(--text-3)";
          }}
        >
          <Icon name="search" size={14} />
          {!railCollapsed && (
            <span style={{ flex: 1, textAlign: "left" }}>Search or jump to…</span>
          )}
          {!railCollapsed && (
            <span style={{ display: "flex", gap: 2 }}>
              <span className="kbd">⌘</span>
              <span className="kbd">K</span>
            </span>
          )}
        </button>
      </div>

      {/* Surface buttons */}
      <div
        style={{
          padding: railCollapsed ? "0 6px" : "0 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {SURFACES.map((s) => {
          const active = surface === s.id;
          return (
            <Tooltip key={s.id} label={railCollapsed ? `${s.label} · ${s.short}` : ""}>
              <button
                onClick={() => onNavigate(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: railCollapsed ? "8px 0" : "8px 10px",
                  justifyContent: railCollapsed ? "center" : "flex-start",
                  background: active ? "var(--accent-dim)" : "transparent",
                  color: active ? "var(--accent-bright)" : "var(--text-2)",
                  borderRadius: "var(--r-sm)",
                  fontSize: 13,
                  fontWeight: 500,
                  width: "100%",
                  borderLeft:
                    !railCollapsed && active
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                  paddingLeft: !railCollapsed ? 8 : undefined,
                  transition: "background var(--t-instant), color var(--t-instant)",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = "var(--surface-2)";
                    el.style.color = "var(--text-1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = "transparent";
                    el.style.color = "var(--text-2)";
                  }
                }}
              >
                <Icon name={s.icon} size={16} />
                {!railCollapsed && (
                  <>
                    <span style={{ flex: 1, textAlign: "left" }}>{s.label}</span>
                    <span
                      className="mono"
                      style={{ fontSize: 10.5, color: "var(--text-4)" }}
                    >
                      {s.short}
                    </span>
                  </>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Design notes link */}
      <div
        style={{
          padding: railCollapsed ? "8px 6px 12px" : "10px 10px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          onClick={() => onNavigate("notes")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: railCollapsed ? "8px 0" : "8px 10px",
            width: "100%",
            justifyContent: railCollapsed ? "center" : "flex-start",
            background: surface === "notes" ? "var(--accent-dim)" : "transparent",
            color: surface === "notes" ? "var(--accent-bright)" : "var(--text-3)",
            borderRadius: "var(--r-sm)",
            fontSize: 12.5,
            transition: "all var(--t-instant)",
          }}
          onMouseEnter={(e) => {
            if (surface !== "notes") {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "var(--surface-2)";
              el.style.color = "var(--text-1)";
            }
          }}
          onMouseLeave={(e) => {
            if (surface !== "notes") {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "transparent";
              el.style.color = "var(--text-3)";
            }
          }}
        >
          <Icon name="book" size={14} />
          {!railCollapsed && (
            <span style={{ flex: 1, textAlign: "left" }}>Design notes</span>
          )}
          {!railCollapsed && (
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
              G N
            </span>
          )}
        </button>
        {railCollapsed && (
          <Tooltip label="Expand rail · ]">
            <button
              onClick={() => onSetCollapsed(false)}
              style={{
                marginTop: 6,
                padding: "6px 0",
                width: "100%",
                display: "flex",
                justifyContent: "center",
                color: "var(--text-3)",
              }}
            >
              <Icon name="expand-rail" size={14} />
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}

"use client";

/**
 * Top-bar account control — who you are, which customer you're looking at,
 * and sign out. Replaces the hardcoded "You" chip.
 */
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Icon } from "../ui";
import type { SessionUser } from "../../lib/session.types";

function initials(user: SessionUser): string {
  const source = (user.name || user.username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const scope = user.allTenants ? "All customers" : user.tenant?.name ?? "—";

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        title="Account"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 8px 4px 4px",
          borderRadius: "var(--r-pill)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <span
          style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "var(--accent-dim)",
            color: "var(--accent-bright)",
            fontSize: 10.5, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {initials(user)}
        </span>
        <span style={{ fontSize: 12 }}>{user.name || user.username}</span>
        <Icon name="chevdown" size={12} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            minWidth: 236,
            background: "var(--glass-bg-2)",
            backdropFilter: "var(--glass-blur)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--r-md, 10px)",
            boxShadow: "var(--shadow-modal)",
            padding: 6,
            zIndex: 300,
          }}
        >
          <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
              {user.name || user.username}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {user.email}
            </div>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6,
                marginTop: 8,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em",
                  color: "var(--accent-bright)", background: "var(--accent-dim)",
                  borderRadius: "var(--r-pill)", padding: "2px 7px",
                }}
              >
                {user.role}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{scope}</span>
            </div>
          </div>

          <a
            href="/login?switch=1"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 10px", marginTop: 4,
              borderRadius: "var(--r-sm)",
              fontSize: 12.5, color: "var(--text-2)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-2)";
              e.currentTarget.style.color = "var(--text-1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-2)";
            }}
          >
            Switch account
          </a>

          <form action={logout}>
            <button
              type="submit"
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "8px 10px",
                borderRadius: "var(--r-sm)",
                fontSize: 12.5, color: "var(--text-2)",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.color = "var(--text-1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-2)";
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

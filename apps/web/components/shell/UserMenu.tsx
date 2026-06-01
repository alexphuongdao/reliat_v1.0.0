"use client";

/**
 * UserMenu — the top-right account control. Replaces the static
 * "YO/You" placeholder. Renders the signed-in user's initials +
 * username; clicking opens a popover with email, sign-in source, and
 * a Sign out action.
 *
 * First piece of Milestone D (componentize): a self-contained shell
 * fragment lifted out of AppShell, owning its own open/close state and
 * outside-click behaviour.
 */
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "../../lib/auth";
import type { UserOut } from "../../lib/types";
import { Icon } from "../ui";

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape.
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignOut = useCallback(() => {
    logout();
    router.replace("/login");
  }, [logout, router]);

  // AppShell is gated behind AuthGuard, so `user` is non-null in
  // practice — but render nothing if it isn't, instead of crashing.
  if (!user) return null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        title="Account"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px 4px 4px",
          borderRadius: "var(--r-pill)",
          border: `1px solid ${open ? "var(--accent-line)" : "var(--border-strong)"}`,
          background: open ? "var(--accent-dim)" : "transparent",
          color: "var(--text-1)",
          transition: "border-color var(--t-instant) var(--ease), background var(--t-instant) var(--ease)",
        }}
      >
        <Avatar user={user} />
        <span
          style={{
            fontSize: 12,
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.username}
        </span>
        <Icon
          name="chevdown"
          size={12}
        />
      </button>

      {open && <ProfilePopover user={user} onSignOut={handleSignOut} />}
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────

function Avatar({ user, size = 22 }: { user: UserOut; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent-dim)",
        color: "var(--accent-bright)",
        fontSize: Math.round(size * 0.48),
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initialsFor(user)}
    </span>
  );
}

function initialsFor(user: UserOut): string {
  const source = user.name?.trim() || user.username.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// ─── Profile popover ─────────────────────────────────────────────────

function ProfilePopover({ user, onSignOut }: { user: UserOut; onSignOut: () => void }) {
  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 280,
        background: "var(--surface-1)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-modal)",
        overflow: "hidden",
        zIndex: 60,
      }}
    >
      {/* Header — identity block */}
      <div style={{ display: "flex", gap: 12, padding: 14 }}>
        <Avatar user={user} size={36} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-semibold)" as unknown as number,
              color: "var(--text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.name || user.username}
          </div>
          <div
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--text-3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.email}
          </div>
        </div>
      </div>

      {/* Meta rows */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <Row label="Username" value={user.username} />
        <Row label="Signed in via" value={providerLabel(user.provider)} />
      </div>

      {/* Sign out */}
      <div style={{ borderTop: "1px solid var(--border)", padding: 8 }}>
        <button
          type="button"
          role="menuitem"
          onClick={onSignOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: "var(--r-sm)",
            background: "transparent",
            color: "var(--sev-crit)",
            fontSize: "var(--fs-sm)",
            fontWeight: "var(--fw-medium)" as unknown as number,
            transition: "background var(--t-instant) var(--ease)",
          }}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
        >
          <Icon name="arrowright" size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 14px",
        fontSize: "var(--fs-xs)",
      }}
    >
      <span
        style={{
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: "var(--fw-semibold)" as unknown as number,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "var(--text-2)",
          maxWidth: "55%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function providerLabel(provider: string | null): string {
  if (!provider) return "Email + password";
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";
  return provider;
}

function hoverOn(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget.style as CSSProperties).background = "var(--sev-crit-dim)";
}
function hoverOff(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget.style as CSSProperties).background = "transparent";
}

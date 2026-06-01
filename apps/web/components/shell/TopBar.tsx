"use client";

/**
 * TopBar — 48px header above the surface content. Renders breadcrumb,
 * the live-ingest indicator (Pulse only), notifications, the Agent
 * drawer toggle, and the UserMenu. The Agent drawer's open/close
 * state lives in AppShell, so it's passed in.
 */
import { Button, Icon } from "../ui";
import { type SurfaceId, surfaceLabel } from "./surfaces";
import { UserMenu } from "./UserMenu";

export interface TopBarProps {
  surface: SurfaceId;
  agentOpen: boolean;
  onToggleAgent: () => void;
}

export function TopBar({ surface, agentOpen, onToggleAgent }: TopBarProps) {
  return (
    <header
      style={{
        height: "var(--topbar-h)",
        minHeight: "var(--topbar-h)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        background: "var(--surface-0)",
        borderBottom: "1px solid var(--border)",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="mine" size={16} />
        <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
          Karingal Pit · West
        </span>
        <span style={{ color: "var(--text-4)" }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
          {surfaceLabel(surface)}
        </span>
      </div>

      <span style={{ flex: 1 }} />

      {surface === "pulse" && (
        <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          ● live · last ingest 00:11
        </span>
      )}

      <Button size="sm" variant="ghost" leftIcon="bell">
        <span className="mono">2</span>
      </Button>
      <Button
        size="sm"
        variant={agentOpen ? "primary" : "secondary"}
        leftIcon="sparkle"
        onClick={onToggleAgent}
        title="Toggle agent drawer (⌘J)"
      >
        Agent
        <span style={{ marginLeft: 4, display: "flex", gap: 2 }}>
          <span className="kbd">⌘</span>
          <span className="kbd">J</span>
        </span>
      </Button>
      <span style={{ width: 1, height: 18, background: "var(--border)" }} />
      <UserMenu />
    </header>
  );
}

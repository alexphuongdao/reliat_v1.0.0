"use client";

/**
 * Library — settings, uploads, channels config, prefs.
 * Ported 1:1 from frontend/screens/library.jsx.
 */
import { useState } from "react";
import { Icon, Pill } from "../ui";
import type { Channel } from "../../lib/types";
import { ChannelsSection } from "./library/ChannelsSection";
import { PrefsSection } from "./library/PrefsSection";
import { UploadsSection } from "./library/UploadsSection";
import { UsersSection } from "./library/UsersSection";

type SectionId = "uploads" | "channels" | "users" | "api" | "prefs";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
}

export interface LibraryScreenProps {
  channels: Channel[];
}

export function LibraryScreen({ channels: CHANNELS }: LibraryScreenProps) {
  const [section, setSection] = useState<SectionId>("uploads");
  const sections: SectionDef[] = [
    { id: "uploads",  label: "Uploads", icon: "upload" },
    { id: "channels", label: "Channels", icon: "belt" },
    { id: "users",    label: "Users & Roles", icon: "user" },
    { id: "api",      label: "API Keys", icon: "key", disabled: true, badge: "1.1" },
    { id: "prefs",    label: "Preferences", icon: "cog" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100%", overflow: "hidden" }}>
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface-1)",
          padding: "20px 12px",
          overflow: "auto",
        }}
      >
        <h2
          style={{
            fontSize: 11, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 600, margin: "0 0 10px 6px",
          }}
        >
          Library
        </h2>
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => !s.disabled && setSection(s.id)}
            disabled={s.disabled}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 10px", width: "100%",
              background: section === s.id ? "var(--accent-dim)" : "transparent",
              color: section === s.id
                ? "var(--accent-bright)"
                : s.disabled
                  ? "var(--text-4)"
                  : "var(--text-1)",
              border: "none",
              borderRadius: "var(--r-sm)",
              fontSize: 13,
              cursor: s.disabled ? "not-allowed" : "pointer",
              marginBottom: 2,
            }}
          >
            <Icon name={s.icon} size={14} />
            <span style={{ flex: 1, textAlign: "left" }}>{s.label}</span>
            {s.badge && <Pill size="sm" color="var(--text-4)">Coming {s.badge}</Pill>}
          </button>
        ))}
      </aside>
      <div style={{ overflow: "auto", padding: "24px 32px 40px" }}>
        <div style={{ maxWidth: 880 }}>
          {section === "uploads" && <UploadsSection />}
          {section === "channels" && <ChannelsSection channels={CHANNELS} />}
          {section === "users" && <UsersSection />}
          {section === "prefs" && <PrefsSection />}
        </div>
      </div>
    </div>
  );
}


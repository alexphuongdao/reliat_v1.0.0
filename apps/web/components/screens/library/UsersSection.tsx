"use client";

import { Button, Pill } from "../../ui";
import { SectionHeader } from "./SectionHeader";

export function UsersSection() {
  return (
    <div>
      <SectionHeader
        title="Users & Roles"
        sub="v1.0.0 ships with one role: plant_manager. Roles are not editable yet — the structure is here for 1.1."
      />
      <div className="panel">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "32px 1fr 160px 120px 80px",
            gap: 12, padding: "10px 14px", alignItems: "center",
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "var(--accent-dim)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent-bright)", fontWeight: 600,
            }}
          >
            YO
          </div>
          <div>
            <div>You</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>
              you@reliat.example
            </div>
          </div>
          <Pill size="sm" mono>plant_manager</Pill>
          <span className="mono muted">Active now</span>
          <Button size="sm" variant="ghost">Edit</Button>
        </div>
      </div>
    </div>
  );
}

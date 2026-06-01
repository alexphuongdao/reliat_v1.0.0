"use client";

import { useState } from "react";
import { Pill, Segmented } from "../../ui";
import { PrefRow } from "./PrefRow";
import { SectionHeader } from "./SectionHeader";

export function PrefsSection() {
  const [theme, setTheme] = useState("dark");
  const [density, setDensity] = useState("comfortable");
  return (
    <div>
      <SectionHeader title="Preferences" />
      <div className="panel" style={{ padding: "14px 16px" }}>
        <PrefRow label="Theme" sub="Dark is the primary mode. Light is available but secondary.">
          <Segmented
            options={[
              { id: "dark", label: "Dark" },
              { id: "light", label: "Light" },
              { id: "auto", label: "System" },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </PrefRow>
        <PrefRow label="Density" sub="Compact reduces row heights by 4px and trims paddings.">
          <Segmented
            options={[
              { id: "comfortable", label: "Comfortable" },
              { id: "compact", label: "Compact" },
            ]}
            value={density}
            onChange={setDensity}
          />
        </PrefRow>
        <PrefRow label="Time zone" sub="Affects all timestamps displayed. Source data is stored UTC.">
          <Pill mono>Site local · UTC+2</Pill>
        </PrefRow>
        <PrefRow label="Number format" sub="Display only. Source remains comma-decimal.">
          <Segmented
            options={[
              { id: "pt", label: "1,234.56" },
              { id: "comma", label: "1.234,56" },
            ]}
            value="pt"
            onChange={() => {}}
          />
        </PrefRow>
        <PrefRow
          label="Notification rules"
          sub="Where critical outliers go. Email is a placeholder; webhooks ship in 1.1."
        >
          <Pill mono>email · phone-on-call</Pill>
        </PrefRow>
      </div>
    </div>
  );
}

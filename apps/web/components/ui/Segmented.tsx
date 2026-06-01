"use client";

export interface SegmentedOption { id: string; label: string }

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: SegmentedOption[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex", padding: 2,
        background: "var(--surface-inset)", border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
      }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id as T)}
          style={{
            padding: "3px 10px", fontSize: 11.5, fontWeight: 500,
            background: value === o.id ? "var(--surface-3)" : "transparent",
            color: value === o.id ? "var(--text-1)" : "var(--text-3)",
            borderRadius: "var(--r-sm)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

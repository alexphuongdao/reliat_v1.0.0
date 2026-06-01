"use client";

/**
 * Text input styled with the design tokens — there isn't an Input in
 * the locked primitive set, so this is a brand-new file that reuses
 * --surface, --text, --r-md, --accent for focus, matching the rest of
 * the surface grammar (panels, buttons).
 */
import { type ChangeEvent, type CSSProperties, type InputHTMLAttributes, useState } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  error?: string | null;
  hint?: string;
  containerStyle?: CSSProperties;
}

export function Input({
  label,
  error,
  hint,
  containerStyle,
  onChange,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? "var(--sev-crit)"
    : focused
      ? "var(--accent-line)"
      : "var(--border-strong)";

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, ...containerStyle }}>
      <span
        style={{
          fontSize: "var(--fs-micro)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-3)",
          fontWeight: "var(--fw-semibold)" as unknown as number,
        }}
      >
        {label}
      </span>
      <input
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e)}
        style={{
          height: 36,
          padding: "0 12px",
          background: "var(--surface-2)",
          color: "var(--text-1)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--r-sm)",
          fontSize: "var(--fs-md)",
          outline: "none",
          transition: "border-color var(--t-fast) var(--ease)",
          fontFamily: "var(--font-sans)",
        }}
      />
      {(error || hint) && (
        <span
          style={{
            fontSize: "var(--fs-xs)",
            color: error ? "var(--sev-crit)" : "var(--text-3)",
            minHeight: 14,
          }}
        >
          {error || hint}
        </span>
      )}
    </label>
  );
}

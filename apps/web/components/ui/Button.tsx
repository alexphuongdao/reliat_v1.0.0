"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { Icon } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: string;
  rightIcon?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  type?: "button" | "submit" | "reset";
  style?: CSSProperties;
}

export function Button({
  children, variant = "secondary", size = "md",
  leftIcon, rightIcon, onClick, title, disabled, active, type = "button", style,
}: ButtonProps) {
  const sizes = {
    sm: { h: 24, px: 8,  fs: 12 },
    md: { h: 28, px: 10, fs: 12.5 },
    lg: { h: 32, px: 12, fs: 13 },
  }[size];
  const variants = {
    primary:   { bg: "var(--accent)",        color: "#062028",          border: "transparent",         hover: "var(--accent-bright)" },
    secondary: { bg: "var(--surface-2)",     color: "var(--text-1)",    border: "var(--border-strong)", hover: "var(--surface-3)" },
    ghost:     { bg: "transparent",          color: "var(--text-2)",    border: "transparent",         hover: "var(--surface-2)" },
    danger:    { bg: "var(--sev-crit-dim)",  color: "var(--sev-crit)",  border: "var(--sev-crit-dim)", hover: "rgba(242,110,110,0.26)" },
  }[variant];
  const [h, setH] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: sizes.h, padding: `0 ${sizes.px}px`,
        fontSize: sizes.fs, fontWeight: "var(--fw-medium)" as unknown as number,
        background: active ? "var(--accent-dim)" : (h ? variants.hover : variants.bg),
        color: active ? "var(--accent-bright)" : variants.color,
        border: `1px solid ${active ? "var(--accent-line)" : variants.border}`,
        borderRadius: "var(--r-sm)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background var(--t-instant) var(--ease), color var(--t-instant) var(--ease), border-color var(--t-instant) var(--ease)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {leftIcon && <Icon name={leftIcon} size={14} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={14} />}
    </button>
  );
}

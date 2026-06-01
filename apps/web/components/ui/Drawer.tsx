"use client";

import { type ReactNode, useEffect } from "react";

export interface DrawerProps {
  open: boolean;
  onClose?: () => void;
  width?: string | number;
  children: ReactNode;
  title?: string;
}

export function Drawer({ open, onClose, width = "45%", children, title }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose && onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.18)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity var(--t-med) var(--ease)",
          zIndex: 80,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width,
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          borderLeft: "1px solid var(--glass-border)",
          boxShadow: "var(--shadow-modal)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform var(--t-med) var(--ease)",
          zIndex: 90,
          display: "flex", flexDirection: "column",
        }}
      >
        {children}
      </aside>
    </>
  );
}

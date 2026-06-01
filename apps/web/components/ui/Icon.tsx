"use client";

import { type CSSProperties } from "react";

export type IconName =
  | "pulse" | "layers" | "inbox" | "spark" | "cog" | "book" | "search"
  | "sparkle" | "message" | "check" | "x" | "cmd" | "arrowup" | "arrowright"
  | "arrowleft" | "chevron" | "chevdown" | "circle" | "dot" | "panel-l"
  | "panel-r" | "compare" | "zap" | "history" | "collapse-rail"
  | "expand-rail" | "mine" | "belt" | "pin" | "filter" | "plus" | "more"
  | "user" | "send" | "play" | "pause" | "upload" | "key" | "bell";

export function Icon({ name, size = 16 }: { name: IconName | string; size?: number }) {
  const s = size;
  const stroke = "currentColor";
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { flexShrink: 0, display: "block" } as CSSProperties,
    "aria-hidden": true,
  };
  switch (name) {
    case "pulse":    return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>;
    case "layers":   return <svg {...common}><path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>;
    case "inbox":    return <svg {...common}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5 5l-3 7v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3-7H5z"/></svg>;
    case "spark":    return <svg {...common}><path d="M9 18l3-3 3 3 6-7"/><circle cx="9" cy="18" r="1.2" fill={stroke}/><circle cx="15" cy="18" r="1.2" fill={stroke}/></svg>;
    case "cog":      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case "book":     return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
    case "search":   return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
    case "sparkle":  return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>;
    case "message":  return <svg {...common}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>;
    case "check":    return <svg {...common}><polyline points="20 6 9 17 4 12"/></svg>;
    case "x":        return <svg {...common}><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case "cmd":      return <svg {...common}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>;
    case "arrowup":  return <svg {...common}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case "arrowright":return <svg {...common}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "arrowleft":return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>;
    case "chevron":  return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
    case "chevdown": return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case "circle":   return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
    case "dot":      return <svg {...common}><circle cx="12" cy="12" r="4" fill={stroke}/></svg>;
    case "panel-l":  return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>;
    case "panel-r":  return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>;
    case "compare":  return <svg {...common}><path d="M3 6h13M3 6l4-4M3 6l4 4M21 18H8M21 18l-4-4M21 18l-4 4"/></svg>;
    case "zap":      return <svg {...common}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
    case "history":  return <svg {...common}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>;
    case "collapse-rail": return <svg {...common}><path d="M14 6l-6 6 6 6"/><path d="M20 4v16"/></svg>;
    case "expand-rail":   return <svg {...common}><path d="M10 6l6 6-6 6"/><path d="M4 4v16"/></svg>;
    case "mine":     return <svg {...common}><path d="M2 22h20"/><path d="M4 22V12l4-3 4 3 4-3 4 3v10"/><path d="M8 22v-6h4v6"/></svg>;
    case "belt":     return <svg {...common}><rect x="2" y="9" width="20" height="6" rx="3"/><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>;
    case "pin":      return <svg {...common}><path d="M12 17v5"/><path d="M9 10.7V3h6v7.7l3 4.3H6l3-4.3z"/></svg>;
    case "filter":   return <svg {...common}><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg>;
    case "plus":     return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "more":     return <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
    case "user":     return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case "send":     return <svg {...common}><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>;
    case "play":     return <svg {...common}><polygon points="5 3 19 12 5 21 5 3" fill={stroke}/></svg>;
    case "pause":    return <svg {...common}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case "upload":   return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    case "key":      return <svg {...common}><path d="M21 2l-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-3 3"/><path d="m15 8 3 3"/></svg>;
    case "bell":     return <svg {...common}><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
    default: return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3"/></svg>;
  }
}

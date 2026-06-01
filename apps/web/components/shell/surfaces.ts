/**
 * Shared surface registry — the canonical list of navigable surfaces
 * and the G-prefix keymap. Lives in its own file so LeftRail, TopBar,
 * and AppShell all import the same source of truth.
 */

export type SurfaceId =
  | "pulse"
  | "channels"
  | "outliers"
  | "agent"
  | "library"
  | "notes";

export interface SurfaceDef {
  id: SurfaceId;
  label: string;
  icon: string;
  short: string;
}

/**
 * The five surfaces shown in the rail's main nav. `notes` is a
 * SurfaceId too, but it lives in the rail's footer rather than this
 * list.
 */
export const SURFACES: readonly SurfaceDef[] = [
  { id: "pulse",    label: "Pulse",    icon: "pulse",   short: "⌘1" },
  { id: "channels", label: "Channels", icon: "belt",    short: "⌘2" },
  { id: "outliers", label: "Outliers", icon: "inbox",   short: "⌘3" },
  { id: "agent",    label: "Agent",    icon: "sparkle", short: "⌘4" },
  { id: "library",  label: "Library",  icon: "book",    short: "⌘5" },
];

/** Second key after `g` → which surface to navigate to. */
export const G_TO_SURFACE: Record<string, SurfaceId> = {
  p: "pulse",
  c: "channels",
  o: "outliers",
  a: "agent",
  l: "library",
  n: "notes",
};

export function surfaceLabel(id: SurfaceId): string {
  return SURFACES.find((s) => s.id === id)?.label ?? "Design notes";
}

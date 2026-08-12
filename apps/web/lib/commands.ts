import type { Command } from "./types";

/**
 * ⌘K palette entries that are pure UI — navigation, toggles, help.
 *
 * These are the same for every tenant because they are application actions,
 * not data. Channel and outlier entries are appended by the shell from the
 * caller's own tenant-scoped fetch; nothing here is derived from a mock.
 */
export const STATIC_COMMANDS: Command[] = [
  { id: "go.pulse",     label: "Go to Pulse",             kind: "Navigate",   shortcut: "G P", surface: "pulse" },
  { id: "go.channels",  label: "Go to Channels",          kind: "Navigate",   shortcut: "G C", surface: "channels" },
  { id: "go.outliers",  label: "Go to Outliers",          kind: "Navigate",   shortcut: "G O", surface: "outliers" },
  { id: "go.agent",     label: "Go to Agent",             kind: "Navigate",   shortcut: "G A", surface: "agent" },
  { id: "go.library",   label: "Go to Library",           kind: "Navigate",   shortcut: "G L", surface: "library" },
  { id: "go.notes",     label: "Open Design Notes",       kind: "Navigate",   surface: "notes" },
  { id: "agent.toggle", label: "Toggle Agent drawer",     kind: "Action",     shortcut: "⌘J" },
  { id: "theme.toggle", label: "Toggle density: compact", kind: "Preference" },
  { id: "kbd.help",     label: "Show keyboard shortcuts", kind: "Help",       shortcut: "?" },
];

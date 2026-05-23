/**
 * Formatters — ported verbatim from frontend/ui.jsx.
 *
 * Note: `fmtAge` and `fmtTime` both use the local timezone of whoever renders
 * the call. They MUST run client-side only — using them inside a Server
 * Component will produce a hydration mismatch the moment the user's clock
 * differs from the server's. The screens that consume them are all
 * "use client" components, so this is enforced by where they're imported.
 */

export interface FmtTimeOpts { withSec?: boolean }

export function fmtTime(t: number | Date, opts: FmtTimeOpts = {}): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return opts.withSec ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

export function fmtAge(t: number | Date): string {
  const ms = Date.now() - new Date(t).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

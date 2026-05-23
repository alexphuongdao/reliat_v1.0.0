/**
 * psdAt — deterministic PSD snapshot at a moment in time.
 * Ported verbatim from the original frontend/data.jsx. Phase 3 will
 * replace this with the live `/api/channels/:id/psd?t=` endpoint.
 */
import type { Channel, PsdSnapshot, SeriesPoint } from "./types";

function rng(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SIEVE_SIZES = [1, 2.5, 4, 6.3, 9.5, 12.5, 19, 25, 31.5, 45, 63, 80, 100, 125, 160];

export function psdAt(
  channel: Channel,
  series: SeriesPoint[],
  idx: number,
): PsdSnapshot {
  const r = rng((channel.id.charCodeAt(2) + idx) * 7);
  const f80 = series[idx]?.v ?? channel.baseF80;
  const k = f80 / channel.baseF80;
  const pcts = [
    { name: "F10", x: 10, y: channel.baseF80 * 0.22 * k + (r() - 0.5) * 2 },
    { name: "F20", x: 20, y: channel.baseF80 * 0.32 * k + (r() - 0.5) * 2 },
    { name: "F30", x: 30, y: channel.baseF80 * 0.42 * k + (r() - 0.5) * 2 },
    { name: "F40", x: 40, y: channel.baseF80 * 0.52 * k + (r() - 0.5) * 2 },
    { name: "F50", x: 50, y: channel.baseF80 * 0.62 * k + (r() - 0.5) * 2 },
    { name: "F60", x: 60, y: channel.baseF80 * 0.72 * k + (r() - 0.5) * 2 },
    { name: "F70", x: 70, y: channel.baseF80 * 0.84 * k + (r() - 0.5) * 2 },
    { name: "F80", x: 80, y: f80 },
    { name: "F90", x: 90, y: channel.baseF80 * 1.18 * k + (r() - 0.5) * 3 },
  ];
  const sieves = SIEVE_SIZES.map((sz) => {
    const center = f80 * 0.55;
    const passing = 100 / (1 + Math.exp(-(sz - center) / (center * 0.32)));
    return { size: sz, passing: Math.max(0, Math.min(100, passing + (r() - 0.5) * 1.5)) };
  });
  return { pcts, sieves };
}

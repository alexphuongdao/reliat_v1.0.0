/**
 * Stable timestamp used by buildMock(). Server-rendered pages and client
 * hydration both compute the same mock substrate, avoiding hydration
 * mismatches that would otherwise appear in every `new Date(t)` call.
 *
 * Phase 3 (real API) makes this obsolete — the server returns real
 * timestamps and the client renders them as-is.
 */
export const STABLE_NOW = Date.UTC(2026, 4, 22, 18, 0, 0);

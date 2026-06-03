"use client";

/**
 * Channels — real-time data-science dashboard over ingested PsdRow data.
 * Replaces the mock-driven ChannelsScreen with an analytics-first
 * surface: KPI badges, SPC charts with ±1σ/2σ/3σ bands, sieve curve,
 * percentile breakdown, multi-metric trend grid, and an excursion table.
 *
 * The previous mock-driven ChannelsScreen component is preserved in
 * components/screens/ChannelsScreen.tsx as design reference; it is no
 * longer mounted by any route.
 */
import { AnalyticsDashboard } from "../../../components/screens/channels/AnalyticsDashboard";

export default function ChannelsPage() {
  return <AnalyticsDashboard />;
}

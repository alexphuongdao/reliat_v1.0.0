import { api } from "./api";
import type { Channel, Outlier, PsdSnapshot, SeriesPoint } from "./types";

export interface WorkspaceData {
  channels: Channel[];
  outliers: Outlier[];
  series: Record<string, SeriesPoint[]>;
  psd: Record<string, PsdSnapshot>;
}

/** Load the tenant-scoped data shared by the main operational screens. */
export async function loadWorkspaceData(): Promise<WorkspaceData> {
  const [channels, outliers] = await Promise.all([
    api.channels(),
    api.outliers({ limit: 2000 }),
  ]);

  const seriesEntries = await Promise.all(
    channels.map(async (channel) => [channel.id, await api.series(channel.id)] as const),
  );
  const psdEntries = await Promise.all(
    channels.map(async (channel) => [channel.id, await api.psd(channel.id)] as const),
  );

  return {
    channels,
    outliers,
    series: Object.fromEntries(seriesEntries),
    psd: Object.fromEntries(psdEntries),
  };
}

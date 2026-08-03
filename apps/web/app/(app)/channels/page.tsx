"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChannelsScreen } from "@/components/screens/ChannelsScreen";
import { useAppShell } from "@/components/shell/context";
import { useEffect, useState } from "react";
import { loadWorkspaceData, type WorkspaceData } from "@/lib/loadWorkspace";
import { ScreenError, ScreenLoading } from "@/components/ui";

// useSearchParams must be inside a Suspense boundary in Next 16.
function ChannelsPageInner() {
  const params = useSearchParams();
  const initialChannelId = params.get("c") || "cv42";
  const { openOutlier, askAgent } = useAppShell();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadWorkspaceData().then(setData).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  if (error) return <ScreenError label="Couldn't load channels." detail={error} onRetry={() => window.location.reload()} />;
  if (!data) return <ScreenLoading label="Loading channels…" />;
  if (!data.channels.length) return <ScreenError label="No channels configured for this tenant." detail="Add a channel before opening the channel analysis view." />;

  const psdAt = (channelId: string, idx: number) => {
    return data.psd[channelId] ?? { pcts: [], sieves: [] };
  };

  return (
    <ChannelsScreen
      channels={data.channels}
      series={data.series}
      outliers={data.outliers}
      psdAt={psdAt}
      initialChannelId={initialChannelId}
      onOpenOutlier={openOutlier}
      onAskAgent={(s) => askAgent(s.scope)}
    />
  );
}

export default function ChannelsPage() {
  return (
    <Suspense fallback={null}>
      <ChannelsPageInner />
    </Suspense>
  );
}

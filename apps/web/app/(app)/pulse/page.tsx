"use client";

import { useEffect, useState } from "react";
import { PulseScreen } from "@/components/screens/PulseScreen";
import { useAppShell } from "@/components/shell/context";
import { loadWorkspaceData, type WorkspaceData } from "@/lib/loadWorkspace";
import { ScreenError, ScreenLoading } from "@/components/ui";


export default function PulsePage() {
  const { openChannel, openOutlier, askAgent } = useAppShell();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadWorkspaceData().then(setData).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  if (error) return <ScreenError label="Couldn't load pulse." detail={error} onRetry={() => window.location.reload()} />;
  if (!data) return <ScreenLoading label="Loading pulse…" />;
  return (
    <PulseScreen
      channels={data.channels}
      series={data.series}
      outliers={data.outliers}
      shiftSummary={`Shift ${data.channels[0]?.shift ?? "—"}: ${data.outliers.filter((o) => o.status === "open").length} open outliers across ${data.channels.length} tenant channels.`}
      onOpenChannel={openChannel}
      onOpenOutlier={openOutlier}
      onAskAgent={askAgent}
    />
  );
}

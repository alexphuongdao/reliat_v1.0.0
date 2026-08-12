"use client";

import { AgentScreen } from "@/components/screens/AgentScreen";
import { useAppShell } from "@/components/shell/context";
import { loadWorkspaceData, type WorkspaceData } from "@/lib/loadWorkspace";
import { ScreenError, ScreenLoading } from "@/components/ui";
import { useEffect, useState } from "react";

export default function AgentPage() {
  const { openChannel, openOutlier, agentScope } = useAppShell();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadWorkspaceData().then(setData).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  if (error) return <ScreenError label="Couldn't load agent context." detail={error} onRetry={() => window.location.reload()} />;
  if (!data) return <ScreenLoading label="Loading agent context…" />;
  return (
    <AgentScreen
      channels={data.channels}
      outliers={data.outliers}
      mode="full"
      scope={asScopeArg(agentScope)}
      onOpenChannel={openChannel}
      onOpenOutlier={openOutlier}
    />
  );
}

function asScopeArg(s: unknown) {
  if (s == null) return null;
  if (typeof s === "string") return s;
  return s as { name: string };
}

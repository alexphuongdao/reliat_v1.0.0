"use client";

import { AgentScreen } from "../../components/screens/AgentScreen";
import { useAppShell } from "../../components/shell/context";
import { buildMock } from "../../lib/mockData";
import { STABLE_NOW } from "../../lib/now";

const data = buildMock(STABLE_NOW);

export default function AgentPage() {
  const { openChannel, openOutlier, agentScope } = useAppShell();
  return (
    <AgentScreen
      channels={data.channels}
      outliers={data.outliers}
      initialThread={data.agentThread}
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

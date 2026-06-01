"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChannelsScreen } from "../../../components/screens/ChannelsScreen";
import { useAppShell } from "../../../components/shell/context";
import { buildMock } from "../../../lib/mockData";
import { STABLE_NOW } from "../../../lib/now";
import { psdAt as psdHelper } from "../../../lib/psd";

const data = buildMock(STABLE_NOW);

// useSearchParams must be inside a Suspense boundary in Next 16.
function ChannelsPageInner() {
  const params = useSearchParams();
  const initialChannelId = params.get("c") || "cv42";
  const { openOutlier, askAgent } = useAppShell();

  const psdAt = (channelId: string, idx: number) => {
    const c = data.channels.find((ch) => ch.id === channelId)!;
    return psdHelper(c, data.series[channelId] || [], idx);
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

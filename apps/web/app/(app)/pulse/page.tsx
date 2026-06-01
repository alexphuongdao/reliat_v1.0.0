"use client";

import { PulseScreen } from "../../../components/screens/PulseScreen";
import { useAppShell } from "../../../components/shell/context";
import { buildMock } from "../../../lib/mockData";
import { STABLE_NOW } from "../../../lib/now";

const data = buildMock(STABLE_NOW);

export default function PulsePage() {
  const { openChannel, openOutlier, askAgent } = useAppShell();
  return (
    <PulseScreen
      channels={data.channels}
      series={data.series}
      outliers={data.outliers}
      shiftSummary={data.shiftSummary}
      onOpenChannel={openChannel}
      onOpenOutlier={openOutlier}
      onAskAgent={askAgent}
    />
  );
}

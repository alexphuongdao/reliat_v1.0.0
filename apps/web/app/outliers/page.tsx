"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OutliersScreen } from "../../components/screens/OutliersScreen";
import { useAppShell } from "../../components/shell/context";
import { buildMock } from "../../lib/mockData";
import { STABLE_NOW } from "../../lib/now";

const data = buildMock(STABLE_NOW);

function OutliersPageInner() {
  const params = useSearchParams();
  const initialOutlierId = params.get("o") || undefined;
  const { openChannel, askAgent } = useAppShell();

  return (
    <OutliersScreen
      channels={data.channels}
      outliers={data.outliers}
      initialOutlierId={initialOutlierId}
      onOpenChannel={openChannel}
      onAskAgent={(o) => askAgent(o)}
    />
  );
}

export default function OutliersPage() {
  return (
    <Suspense fallback={null}>
      <OutliersPageInner />
    </Suspense>
  );
}

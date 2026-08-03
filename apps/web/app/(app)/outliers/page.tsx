"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OutliersScreen } from "@/components/screens/OutliersScreen";
import { useAppShell } from "@/components/shell/context";
import { ScreenError, ScreenLoading } from "@/components/ui";
import { api } from "@/lib/api";
import type { Channel, Outlier } from "@/lib/types";

interface Loaded {
  channels: Channel[];
  outliers: Outlier[];
}

function OutliersPageInner() {
  const params = useSearchParams();
  const initialOutlierId = params.get("o") || undefined;
  const { openChannel, askAgent } = useAppShell();

  // No mock seed. Previously this initialised from `buildMock()`, so the
  // screen rendered a full inbox of fabricated outliers for a second and
  // then swapped them for the real ones — the app appearing to change its
  // mind about the facts. Now: loading → real data, or an honest error.
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    Promise.all([api.channels(), api.outliers({ limit: 2000 })])
      .then(([channels, outliers]) => {
        if (!cancelled) setData({ channels, outliers });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  if (error) {
    return (
      <ScreenError
        label="Couldn't load outliers."
        detail={error}
        onRetry={retry}
      />
    );
  }

  if (!data) return <ScreenLoading label="Loading outliers…" />;

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
    <Suspense fallback={<ScreenLoading label="Loading outliers…" />}>
      <OutliersPageInner />
    </Suspense>
  );
}

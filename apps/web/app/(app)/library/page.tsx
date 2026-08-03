"use client";

import { LibraryScreen } from "@/components/screens/LibraryScreen";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Channel } from "@/lib/types";
import { ScreenError, ScreenLoading } from "@/components/ui";


export default function LibraryPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.channels().then(setChannels).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  if (error) return <ScreenError label="Couldn't load library." detail={error} onRetry={() => window.location.reload()} />;
  if (!channels) return <ScreenLoading label="Loading library…" />;
  return <LibraryScreen channels={channels} />;
}

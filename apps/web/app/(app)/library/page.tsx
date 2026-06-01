"use client";

import { LibraryScreen } from "../../../components/screens/LibraryScreen";
import { buildMock } from "../../../lib/mockData";
import { STABLE_NOW } from "../../../lib/now";

const data = buildMock(STABLE_NOW);

export default function LibraryPage() {
  return <LibraryScreen channels={data.channels} />;
}

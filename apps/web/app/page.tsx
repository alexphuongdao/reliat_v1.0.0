import { redirect } from "next/navigation";

// Until the app shell lands (Phase 2/3) the root just sends you to the
// first ported screen.
export default function Home() {
  redirect("/outliers");
}

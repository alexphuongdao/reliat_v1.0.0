import { redirect } from "next/navigation";

// Pulse is the landing surface. The shell renders the chrome; the
// /pulse route renders the screen.
export default function Home() {
  redirect("/pulse");
}

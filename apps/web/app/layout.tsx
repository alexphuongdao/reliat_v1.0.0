import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "../components/shell/AppShell";
import { buildMock } from "../lib/mockData";
import { STABLE_NOW } from "../lib/now";
import "./globals.css";

// CSS variable names match what tokens.css consumes — the design language
// keeps owning the font-family stack; next/font just makes 'Geist' and
// 'Geist Mono' available as the first entries in that stack.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reliat — Mining Intelligence",
  description: "Mining outlier substrate.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Build the mock substrate the shell needs (channels + outliers feed the
  // ⌘K command palette; agentThread + commands seed the drawer + palette).
  // Each page builds its own mock for its screen — deterministic with the
  // same STABLE_NOW, so the data matches across the shell and page.
  const { channels, outliers, agentThread, commands } = buildMock(STABLE_NOW);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppShell
          channels={channels}
          outliers={outliers}
          agentThread={agentThread}
          commands={commands}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reliat — Mining Intelligence",
  description: "Mining outlier substrate.",
};

// Root layout is deliberately chrome-free: it wraps both the authenticated
// app (which adds AppShell in `(app)/layout.tsx`) and the login screen,
// which must render with no shell around it.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

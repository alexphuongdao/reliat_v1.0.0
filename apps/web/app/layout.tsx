import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "../lib/auth";
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
  // Root holds only what every route needs: fonts + auth context. The
  // AppShell + mock substrate live in app/(app)/layout.tsx so the
  // /login, /register, /auth/callback, /logout routes render bare.
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

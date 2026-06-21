import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { UnitsProvider } from "@/lib/units";
import { AudioProvider } from "@/lib/AudioContext";
import FloatingMiniPlayer from "@/components/ui/FloatingMiniPlayer";
import AdminBanner from "@/components/admin/AdminBanner";

export const metadata: Metadata = {
  title: "Studio0x · World Cup 2026 Stats Engine",
  description: "Live match telemetry, prediction markets, and team anthems for FIFA World Cup 2026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SessionProvider><UnitsProvider><AudioProvider><AdminBanner />{children}<FloatingMiniPlayer /></AudioProvider></UnitsProvider></SessionProvider>
      </body>
    </html>
  );
}

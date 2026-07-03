import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { UnitsProvider } from "@/lib/units";
import { AudioProvider } from "@/lib/AudioContext";
import FloatingMiniPlayer from "@/components/ui/FloatingMiniPlayer";
import AdminBanner from "@/components/admin/AdminBanner";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = {
  title: "Studio0x · World Cup 2026 Stats Engine",
  description: "Live match telemetry, prediction markets, and team anthems for FIFA World Cup 2026",
};

// Applies the persisted theme BEFORE first paint so there's no flash.
// Dark is the default; "light" is opt-in via the toggle (localStorage).
const THEME_INIT = `try{var t=localStorage.getItem("studio0x_theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      {/* pb keeps content clear of the mobile bottom tab bar */}
      <body className="pb-20 sm:pb-0">
        <SessionProvider>
          <UnitsProvider>
            <AudioProvider>
              <AdminBanner />
              {children}
              <FloatingMiniPlayer />
              <BottomNav />
            </AudioProvider>
          </UnitsProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

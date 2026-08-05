import type { Metadata } from "next";
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { UnitsProvider } from "@/lib/units";
import { AudioProvider } from "@/lib/AudioContext";
import FloatingMiniPlayer from "@/components/ui/FloatingMiniPlayer";
import AdminBanner from "@/components/admin/AdminBanner";
import BottomNav from "@/components/ui/BottomNav";
import SportOSFooter from "@/components/ui/SportOSFooter";
import { SPORT } from "@/lib/sportConfig";

// ── studio0x type stack (LC26 Gaming-UI skin) ────────────────────────────────
// Archivo is loaded with its `wdth` axis so display type can run EXPANDED —
// wdth 125 for the hero, 105 for card titles (see .s0x-display-* in globals.css).
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-display",
});

// Body copy.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

// Labels, data, scores, timers. Not a variable font — weights are explicit.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-mono",
});

const FONT_VARS = `${archivo.variable} ${instrumentSans.variable} ${plexMono.variable}`;

// Per-deployment site identity. Every LC26 page shipped with the World Cup
// deployment's title ("podiumMetrics · live tournament stats by studio0x", and a
// description about "the 2026 tournament across North America" written for WC26)
// because these were plain string literals.
//
// SPORT.brandSubtitle is the nominative-use deployment name ("podiumMetrics –
// Leagues Cup 2026"). Per CLAUDE.md BRANDING, the tournament name belongs in the
// deployment SUBTITLE, never in the product mark itself, and nothing here may
// claim to be official.
const SITE_URL = SPORT.id === "leaguescup"
  ? "https://leaguescup.vercel.app"
  : "https://podiummetrics.studio0x.io";

const SITE_TITLE = `${SPORT.brandSubtitle} · live tournament stats by studio0x`;

const SITE_DESCRIPTION = SPORT.entityKind === "club"
  ? `Live match telemetry, proprietary metrics and club coverage for the ${SPORT.eventName} — MLS and Liga MX clubs across North America.`
  : `Live match telemetry, prediction markets, proprietary metrics and team anthems for the ${SPORT.eventName} across North America`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "./" },
  openGraph: {
    siteName: "podiumMetrics",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    type: "website",
  },
};

// Applies the persisted theme BEFORE first paint so there's no flash.
// Dark is the default; "light" is opt-in via the toggle (localStorage).
const THEME_INIT = `try{var t=localStorage.getItem("studio0x_theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={FONT_VARS} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0F0C0E" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      {/* pb keeps content clear of the mobile bottom tab bar */}
      <body className="pb-20 sm:pb-0">
        <SessionProvider>
          <UnitsProvider>
            <AudioProvider>
              <AdminBanner />
              {children}
              <SportOSFooter />
              <FloatingMiniPlayer />
              <BottomNav />
            </AudioProvider>
          </UnitsProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

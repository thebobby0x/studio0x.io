import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://podiumschedule.studio0x.io";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "podiumSchedule · the global sport calendar by studio0x",
  description: "One depot for tournaments, fixtures and race weekends across every sport — the sportOS schedule engine.",
  alternates: { canonical: "./" },
  openGraph: {
    siteName: "podiumSchedule",
    title: "podiumSchedule · the global sport calendar by studio0x",
    description: "One depot for tournaments, fixtures and race weekends across every sport — the sportOS schedule engine.",
    url: SITE_URL,
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-brand-dark text-slate-200 font-sans min-h-screen">
        {children}
        <footer className="border-t border-brand-border py-6 text-center space-y-2 mt-16">
          <div className="text-xs font-black text-slate-300 tracking-tight">
            podium<span className="text-brand-gold">Schedule</span>
            <span className="text-slate-600 font-medium"> — part of </span>
            sportOS
            <span className="text-slate-600 font-medium"> by studio0x</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-[10px] uppercase tracking-widest text-slate-600">
            <a href="https://podiummetrics.studio0x.io" className="hover:text-brand-gold transition-colors">podiumMetrics</a>
            <span aria-hidden className="text-slate-700">·</span>
            <span title="VIP sport travel — coming soon" className="cursor-default">podiumSelect</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

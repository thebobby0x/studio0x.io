export const dynamic = "force-dynamic";

import Link from "next/link";
import { Trophy, Music2, Wifi, CalendarDays } from "lucide-react";
import ScheduleView from "./ScheduleView";
import type { ScheduleMatch } from "@/app/api/schedule/route";

async function fetchSchedule(): Promise<ScheduleMatch[]> {
  try {
    // Direct server-side fetch — same process, no HTTP hop needed
    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET();
    return res.json() as Promise<ScheduleMatch[]>;
  } catch {
    return [];
  }
}

export default async function SchedulePage() {
  const matches = await fetchSchedule();

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      {/* Nav — same as homepage */}
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-brand-gold" />
            <Link href="/" className="font-bold text-white tracking-tight hover:text-brand-gold transition-colors">
              Studio0x
            </Link>
            <span className="text-brand-border">·</span>
            <span className="text-sm text-slate-400">World Cup 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/schedule"
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold hover:text-amber-300 transition-colors"
            >
              <CalendarDays size={13} />
              Schedule
            </Link>
            <Link
              href="/anthems"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Music2 size={13} />
              Anthems
            </Link>
            <Link href="/admin/anthems" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Admin
            </Link>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Wifi size={12} className="text-brand-green" />
              <span className="hidden sm:inline">Live data feed active</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            FIFA World Cup 2026 <span className="text-brand-gold">Schedule</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Live scores · Countdowns · Full group stage & knockout bracket
          </p>
        </div>

        {matches.length === 0 ? (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-12 text-center">
            <CalendarDays size={48} className="mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 font-semibold">Schedule unavailable</p>
            <p className="text-slate-600 text-sm mt-1">
              Add <code className="text-brand-green">FOOTBALL_DATA_API_KEY</code> to Vercel to load the full schedule.
            </p>
          </div>
        ) : (
          <ScheduleView initialMatches={matches} />
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Schedule data via football-data.org
      </footer>
    </div>
  );
}

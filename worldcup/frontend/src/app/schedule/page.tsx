export const dynamic = "force-dynamic";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import AppNav from "@/components/ui/AppNav";
import ScheduleView from "./ScheduleView";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import { prisma } from "@/lib/prisma";

async function fetchSchedule(): Promise<ScheduleMatch[]> {
  try {
    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET();
    const data = (await res.json()) as ScheduleMatch[];
    if (data.length > 0) return data;
  } catch {
    // fall through to DB fallback
  }

  // DB fallback — seeded matches always available even without API key
  try {
    const matches = await prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });
    return matches.map((m) => ({
      id: m.fixture,
      utcDate: m.date.toISOString(),
      status: (m.status as ScheduleMatch["status"]) ?? "NS",
      minute: m.elapsed ?? 0,
      stage: "GROUP_STAGE",
      stageLabel: "Group Stage",
      group: m.homeTeam.groupStage ?? "",
      matchday: 1,
      homeTeam: { name: m.homeTeam.name, tla: m.homeTeam.code },
      awayTeam: { name: m.awayTeam.name, tla: m.awayTeam.code },
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function SchedulePage() {
  const matches = await fetchSchedule();

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

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
              No match data found. Run the seed endpoint or check your connection.
            </p>
          </div>
        ) : (
          <ScheduleView initialMatches={matches} />
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Schedule data via api-football.com
      </footer>
    </div>
  );
}

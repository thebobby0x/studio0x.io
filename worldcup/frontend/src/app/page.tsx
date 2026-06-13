export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { Trophy, Wifi, CalendarDays, ChevronRight } from "lucide-react";
import LiveMatchCard from "@/components/match/LiveMatchCard";
import GroupWinnerTickers from "@/components/sentiment/GroupWinnerTickers";
import LiveWinMeter from "@/components/stats/LiveWinMeter";
import TournamentOddsPanel from "@/components/stats/TournamentOddsPanel";
import type { Match } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { getFlag } from "@/lib/flags";
import { venueCity } from "@/lib/venues";
import type { ScheduleMatch } from "@/app/api/schedule/route";

async function getInitialData() {
  try {
    const matches = await prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });
    return { matches: matches as unknown as Match[] };
  } catch {
    return { matches: [] };
  }
}

async function getTodaySchedule(): Promise<ScheduleMatch[]> {
  try {
    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET();
    const all = (await res.json()) as ScheduleMatch[];
    const today = new Date().toISOString().slice(0, 10);
    return all.filter(m => m.utcDate.startsWith(today)).slice(0, 8);
  } catch {
    return [];
  }
}

function matchLabel(status: string, elapsed: number) {
  if (status === "LIVE") return `${elapsed}'`;
  if (status === "HT")   return "HT";
  if (status === "FT")   return "FT";
  return "NS";
}

export default async function DashboardPage() {
  const [{ matches }, todayMatches] = await Promise.all([
    getInitialData(),
    getTodaySchedule(),
  ]);

  const liveMatches = matches.filter((m) => ["LIVE", "HT"].includes(m.status));
  const ftMatches   = matches.filter((m) => m.status === "FT");
  const nsMatches   = matches.filter((m) => m.status === "NS");

  const featuredMatch =
    liveMatches.length > 0
      ? liveMatches.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b))
      : ftMatches.length > 0
        ? ftMatches[ftMatches.length - 1]
        : (nsMatches[0] ?? matches[matches.length - 1]);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-brand-gold" />
            <span className="font-black text-white tracking-tight">WC 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/schedule" className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold hover:text-amber-300 transition-colors">
              <CalendarDays size={13} />Schedule
            </Link>
            <Link href="/anthems" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Anthems</Link>
            <Link href="/admin/anthems" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Admin</Link>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Wifi size={11} className="text-brand-green" />
              <span className="hidden sm:inline">Live</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              FIFA World Cup <span className="text-brand-gold">2026</span>
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Live scores · group winner odds · prediction markets
            </p>
          </div>
          <Link
            href="/schedule"
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-brand-border rounded-full px-3 py-1.5 hover:border-slate-500 transition-all shrink-0"
          >
            <CalendarDays size={12} />
            Schedule
            <ChevronRight size={11} />
          </Link>
        </div>

        {/* Today's schedule strip */}
        {todayMatches.length > 0 && (
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Today at the World Cup</span>
              <Link href="/schedule?filter=today" className="text-[10px] text-brand-gold hover:text-amber-300 transition-colors">View all →</Link>
            </div>
            <div className="flex overflow-x-auto divide-x divide-brand-border/50">
              {todayMatches.map(m => {
                const isLive = m.status === "LIVE" || m.status === "HT";
                const isDone = m.status === "FT";
                return (
                  <Link key={m.id} href={`/schedule/${m.id}`} className="flex-shrink-0 flex flex-col items-center gap-1.5 px-5 py-4 hover:bg-white/5 transition-colors group min-w-[120px]">
                    <div className="flex items-center gap-2 text-sm">
                      <span>{getFlag(m.homeTeam.tla)}</span>
                      <span className={`font-black text-sm tabular-nums ${isLive ? "text-white" : isDone ? "text-slate-400" : "text-slate-600"}`}>
                        {(isLive || isDone) ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : "vs"}
                      </span>
                      <span>{getFlag(m.awayTeam.tla)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                      <span className={`text-[10px] font-semibold ${isLive ? "text-red-400" : isDone ? "text-slate-600" : "text-slate-500"}`}>
                        {isLive ? (m.status === "HT" ? "HT" : `${m.minute}'`) : isDone ? "FT" : "NS"}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-700 uppercase tracking-wider group-hover:text-slate-500 transition-colors">
                      {m.homeTeam.tla} · {m.awayTeam.tla}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {featuredMatch ? (
          <div className="space-y-6">
            {/* Featured match label */}
            <div className="flex items-center gap-3">
              {["LIVE", "HT"].includes(featuredMatch.status) ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Live · Group {featuredMatch.homeTeam.groupStage} · {featuredMatch.venue}{venueCity(featuredMatch.venue, featuredMatch.city) ? `, ${venueCity(featuredMatch.venue, featuredMatch.city)}` : ""}
                  </span>
                </>
              ) : featuredMatch.status === "FT" ? (
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Last Result · Group {featuredMatch.homeTeam.groupStage} · {featuredMatch.venue}{venueCity(featuredMatch.venue, featuredMatch.city) ? `, ${venueCity(featuredMatch.venue, featuredMatch.city)}` : ""}
                </span>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Next Match · Group {featuredMatch.homeTeam.groupStage} · {featuredMatch.venue}{venueCity(featuredMatch.venue, featuredMatch.city) ? `, ${venueCity(featuredMatch.venue, featuredMatch.city)}` : ""}
                </span>
              )}
            </div>

            <Suspense fallback={<div className="h-80 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />}>
              <LiveMatchCard matchId={featuredMatch.id} />
            </Suspense>

            <LiveWinMeter matchId={featuredMatch.id} />

            {featuredMatch.homeTeam.groupStage && (
              <GroupWinnerTickers
                group={featuredMatch.homeTeam.groupStage}
                highlightTeams={[featuredMatch.homeTeam.name, featuredMatch.awayTeam.name]}
              />
            )}

            <TournamentOddsPanel
              highlightTlas={[featuredMatch.homeTeam.code, featuredMatch.awayTeam.code]}
              limit={12}
            />

            {/* All Matches table */}
            {matches.length > 1 && (
              <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                  All Matches
                </div>
                <div className="divide-y divide-brand-border/50">
                  {matches.map(m => {
                    const isFeatured  = m.id === featuredMatch.id;
                    const isMatchLive = m.status === "LIVE" || m.status === "HT";
                    return (
                      <Link
                        key={m.id}
                        href={`/schedule/${m.fixture}`}
                        className={`flex items-center gap-4 px-4 py-3 transition-colors ${isFeatured ? "bg-brand-green/5" : "hover:bg-white/3"}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-base shrink-0">{m.homeTeam.flagEmoji}</span>
                          <span className="text-sm font-semibold text-slate-300 truncate">{m.homeTeam.name}</span>
                          <span className={`font-black text-sm tabular-nums mx-1 shrink-0 ${isMatchLive ? "text-white" : m.status === "FT" ? "text-slate-400" : "text-slate-600"}`}>
                            {m.status !== "NS" ? `${m.homeScore}–${m.awayScore}` : "vs"}
                          </span>
                          <span className="text-sm font-semibold text-slate-300 truncate">{m.awayTeam.name}</span>
                          <span className="text-base shrink-0">{m.awayTeam.flagEmoji}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isMatchLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            isMatchLive ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-500"
                          }`}>
                            {matchLabel(m.status, m.elapsed)}
                          </span>
                          {isFeatured && (
                            <span className={`text-[10px] font-semibold ${
                              isMatchLive ? "text-red-400" : m.status === "FT" ? "text-brand-green" : "text-amber-400"
                            }`}>
                              {isMatchLive ? "Live" : m.status === "FT" ? "Latest" : "Next"}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 text-slate-500">
            <Trophy size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-semibold">No matches loaded.</p>
            <p className="text-sm mt-2 text-slate-600">Run the seed endpoint to populate match data.</p>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · FIFA World Cup 2026 · Data refreshes every 5 seconds
      </footer>
    </div>
  );
}

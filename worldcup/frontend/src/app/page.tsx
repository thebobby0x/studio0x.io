export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { Trophy, Wifi, Music2, CalendarDays, ChevronRight } from "lucide-react";
import LiveMatchCard from "@/components/match/LiveMatchCard";
import GroupWinnerTickers from "@/components/sentiment/GroupWinnerTickers";
import AnthemPlayer from "@/components/anthem/AnthemPlayer";
import type { Match, AudioStream } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { getFlag } from "@/lib/flags";
import type { ScheduleMatch } from "@/app/api/schedule/route";

async function getInitialData() {
  try {
    const [matches, streams] = await Promise.all([
      prisma.match.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { date: "asc" } }),
      prisma.audioStream.findMany({ include: { team: true } }),
    ]);
    return { matches: matches as unknown as Match[], streams: streams as unknown as AudioStream[] };
  } catch {
    return { matches: [], streams: [] };
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

export default async function DashboardPage() {
  const [{ matches, streams }, todayMatches] = await Promise.all([
    getInitialData(),
    getTodaySchedule(),
  ]);

  const liveMatches = matches.filter((m) => ["LIVE", "HT"].includes(m.status));
  const ftMatches   = matches.filter((m) => m.status === "FT");
  const nsMatches   = matches.filter((m) => m.status === "NS");

  // Prefer: live → most recently completed → next upcoming
  const featuredMatch =
    liveMatches.length > 0
      ? liveMatches.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b))
      : ftMatches.length > 0
        ? ftMatches[ftMatches.length - 1]
        : (nsMatches[0] ?? matches[matches.length - 1]);

  const liveMatch = featuredMatch;

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-brand-gold" />
            <span className="font-bold text-white tracking-tight">Studio0x</span>
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
            <Link
              href="/admin/anthems"
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Admin
            </Link>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Wifi size={12} className="text-brand-green" />
              <span>Live</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              FIFA World Cup 2026 <span className="text-brand-gold">Stats Engine</span>
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Real-time match telemetry · prediction market signals · team anthems
            </p>
          </div>
          <Link
            href="/schedule"
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-brand-border rounded-full px-3 py-1.5 hover:border-slate-500 transition-all"
          >
            <CalendarDays size={12} />
            Full schedule
            <ChevronRight size={11} />
          </Link>
        </div>

        {/* Today's schedule strip */}
        {todayMatches.length > 0 && (
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Today at the World Cup</span>
              <Link href="/schedule?filter=today" className="text-[10px] text-brand-gold hover:text-amber-300 transition-colors">
                View all →
              </Link>
            </div>
            <div className="flex overflow-x-auto gap-0 divide-x divide-brand-border/50">
              {todayMatches.map(m => {
                const isLive = m.status === "LIVE" || m.status === "HT";
                const isDone = m.status === "FT";
                return (
                  <Link
                    key={m.id}
                    href={`/schedule/${m.id}`}
                    className="flex-shrink-0 flex flex-col items-center gap-1.5 px-5 py-4 hover:bg-white/5 transition-colors group min-w-[120px]"
                  >
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

        {liveMatch ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                {["LIVE", "HT"].includes(liveMatch.status) ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Live · Group {liveMatch.homeTeam.groupStage} · {liveMatch.venue}, {liveMatch.city}
                    </span>
                  </>
                ) : liveMatch.status === "FT" ? (
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Last Result · Group {liveMatch.homeTeam.groupStage} · {liveMatch.venue}, {liveMatch.city}
                  </span>
                ) : (
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Next Match · Group {liveMatch.homeTeam.groupStage} · {liveMatch.venue}, {liveMatch.city}
                  </span>
                )}
              </div>
              <Suspense fallback={<div className="h-80 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />}>
                <LiveMatchCard matchId={liveMatch.id} />
              </Suspense>
              {liveMatch.homeTeam.groupStage && (
                <GroupWinnerTickers
                  group={liveMatch.homeTeam.groupStage}
                  highlightTeams={[liveMatch.homeTeam.name, liveMatch.awayTeam.name]}
                />
              )}

              {/* Other DB matches */}
              {matches.length > 1 && (
                <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                    All Matches
                  </div>
                  <div className="divide-y divide-brand-border/50">
                    {matches.map(m => {
                      const isActive = m.id === liveMatch.id;
                      const isMatchLive = m.status === "LIVE" || m.status === "HT";
                      return (
                        <div key={m.id} className={`flex items-center gap-4 px-4 py-3 ${isActive ? "bg-brand-green/5" : "hover:bg-white/3"} transition-colors`}>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Link href={`/team/${m.homeTeam.code}`} className="flex items-center gap-1.5 hover:text-brand-gold transition-colors group/t">
                              <span>{m.homeTeam.flagEmoji}</span>
                              <span className="text-sm font-semibold text-slate-300 group-hover/t:text-brand-gold truncate">{m.homeTeam.name}</span>
                            </Link>
                            <span className={`font-black text-sm tabular-nums mx-1 ${isMatchLive ? "text-white" : m.status === "FT" ? "text-slate-400" : "text-slate-600"}`}>
                              {m.status !== "NS" ? `${m.homeScore}–${m.awayScore}` : "vs"}
                            </span>
                            <Link href={`/team/${m.awayTeam.code}`} className="flex items-center gap-1.5 hover:text-brand-gold transition-colors group/t">
                              <span className="text-sm font-semibold text-slate-300 group-hover/t:text-brand-gold truncate">{m.awayTeam.name}</span>
                              <span>{m.awayTeam.flagEmoji}</span>
                            </Link>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isMatchLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              isMatchLive ? "bg-red-500/20 text-red-400" :
                              m.status === "FT" ? "bg-slate-800 text-slate-500" :
                              "bg-slate-800 text-slate-500"
                            }`}>
                              {m.status === "LIVE" ? `${m.elapsed}'` : m.status}
                            </span>
                            {isActive && (
                              <span className="text-[10px] text-brand-green font-semibold">Watching</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Anthem Hub</span>
              </div>
              <AnthemPlayer streams={streams} />
              <Suspense fallback={null}>
                <LineupCard matchId={liveMatch.id} />
              </Suspense>
            </div>
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
        Studio0x.io · World Cup 2026 Stats Engine · V1 MVP · Data refreshes every 5 seconds
      </footer>
    </div>
  );
}

async function LineupCard({ matchId }: { matchId: string }) {
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { include: { homePlayers: true } },
        awayTeam: { include: { homePlayers: true } },
      },
    });
    if (!match) return null;

    const positions = ["GK", "DEF", "MID", "FWD"];
    const sides = [
      { team: match.homeTeam, players: match.homeTeam.homePlayers },
      { team: match.awayTeam, players: match.awayTeam.homePlayers },
    ];

    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
          Starting Lineups
        </div>
        <div className="grid grid-cols-2 divide-x divide-brand-border">
          {sides.map((side) => (
            <div key={side.team.id} className="p-3">
              <Link href={`/team/${side.team.code}`} className="text-xs font-bold text-white mb-2 block hover:text-brand-gold transition-colors">
                {side.team.name}
              </Link>
              {positions.map((pos) => {
                const pp = (side.players as Array<{ id: string; number: number; name: string; position: string }>).filter((p) => p.position === pos);
                if (!pp.length) return null;
                return (
                  <div key={pos} className="mb-2">
                    <div className="text-[10px] text-slate-600 uppercase mb-1">{pos}</div>
                    {pp.map((p: { number: number; name: string; id: string }) => (
                      <div key={p.number} className="flex items-center gap-1.5 text-xs text-slate-300 py-0.5">
                        <span className="text-[10px] text-slate-600 w-4 text-right">{p.number}</span>
                        <span>{p.name}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
